import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { Bet } from '../games/entities/bet.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { UserBalance } from './entities/user-balance.entity';
import { UserBalanceHistory, UserBalanceHistoryType } from './entities/user-balance-history.entity';

/** Chonk 고양이에게 츄르 1번 줄 때 빠지는 포인트 */
export const CHURU_POINTS = '10';

export interface CreditInput {
  userId: string;
  /** 올리거나(credit) 뺄(debit) 포인트 (양수, 소수 6자리까지) */
  points: string;
  type: UserBalanceHistoryType;
  /** 원인이 된 행의 id (deposit → transactions.id, bet / bet_payout → bets.id, churu → null) */
  targetId: string | null;
}

/** 이력 1건 + 입금 이력이면 그 입금 트랜잭션, 배팅 이력이면 그 배팅 */
export interface HistoryWithTransaction {
  history: UserBalanceHistory;
  transaction: Transaction | null;
  bet: Bet | null;
}

/**
 * 유저 포인트. 포인트는 이 서비스로만 바꾼다.
 * 포인트 변경과 이력 기록은 항상 호출한 쪽의 DB 트랜잭션(manager) 안에서 같이 일어난다.
 */
@Injectable()
export class UserBalancesService {
  constructor(
    @InjectRepository(UserBalance)
    private readonly balances: Repository<UserBalance>,
    @InjectRepository(UserBalanceHistory)
    private readonly histories: Repository<UserBalanceHistory>,
  ) {}

  /**
   * 포인트를 올리고 이력에 남긴다. 반영 후 포인트를 돌려준다.
   * 행이 없으면 만들고, 있으면 DB 에서 바로 더한다 (동시에 여러 곳에서 더해도 값이 꼬이지 않게).
   */
  async credit(manager: EntityManager, input: CreditInput): Promise<string> {
    const rows = (await manager.query(
      `INSERT INTO "user_balances" ("user_id", "points", "updated_at")
       VALUES ($1, $2, now())
       ON CONFLICT ("user_id")
       DO UPDATE SET "points" = "user_balances"."points" + EXCLUDED."points", "updated_at" = now()
       RETURNING "points" - $2::numeric AS "points_before", "points" AS "points_after"`,
      [input.userId, input.points],
    )) as { points_before: string; points_after: string }[];
    const { points_before: pointsBefore, points_after: pointsAfter } = rows[0];

    await manager.insert(UserBalanceHistory, {
      userId: input.userId,
      type: input.type,
      points: input.points,
      pointsBefore,
      pointsAfter,
      targetId: input.targetId,
    });
    return pointsAfter;
  }

  /**
   * 포인트를 빼고 이력에 남긴다(이력의 points 는 -). 반영 후 포인트를 돌려준다.
   * 포인트가 모자라면 아무것도 바꾸지 않고 null. 확인과 차감을 한 쿼리로 해서 동시에 빼도 마이너스가 되지 않는다.
   */
  async debit(manager: EntityManager, input: CreditInput): Promise<string | null> {
    // UPDATE 의 query() 결과는 [행 목록, 바뀐 행 수]
    const [rows] = (await manager.query(
      `UPDATE "user_balances" SET "points" = "points" - $2, "updated_at" = now()
       WHERE "user_id" = $1 AND "points" >= $2
       RETURNING "points" + $2::numeric AS "points_before", "points" AS "points_after"`,
      [input.userId, input.points],
    )) as [{ points_before: string; points_after: string }[], number];
    if (rows.length === 0) {
      return null;
    }
    const { points_before: pointsBefore, points_after: pointsAfter } = rows[0];

    await manager.insert(UserBalanceHistory, {
      userId: input.userId,
      type: input.type,
      points: `-${input.points}`,
      pointsBefore,
      pointsAfter,
      targetId: input.targetId,
    });
    return pointsAfter;
  }

  /**
   * Chonk 고양이에게 츄르를 준다. CHURU_POINTS 만큼 빼고(type = churu) 반영 후 포인트를 돌려준다.
   * 포인트가 모자라면 400. 원인이 되는 행이 따로 없어서 target_id 는 null (null 은 유니크에 걸리지 않아 여러 번 줄 수 있다)
   */
  async feedChuru(userId: string): Promise<string> {
    const after = await this.balances.manager.transaction((manager) =>
      this.debit(manager, { userId, points: CHURU_POINTS, type: 'churu', targetId: null }),
    );
    if (after === null) {
      throw new BadRequestException('포인트가 모자랍니다.');
    }
    return after;
  }

  /** 유저의 현재 포인트 (입금이 없었으면 "0") */
  async findPoints(userId: string): Promise<string> {
    const balance = await this.balances.findOneBy({ userId });
    return balance?.points ?? '0';
  }

  /** 유저의 포인트 이력 (최근 것부터). 입금 이력은 그 입금 트랜잭션(토큰 포함)을, 배팅 이력은 그 배팅을 같이 붙인다 */
  async findHistories(userId: string, limit = 20, offset = 0): Promise<HistoryWithTransaction[]> {
    const histories = await this.histories.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: offset,
    });

    const depositIds = histories
      .filter((h) => h.type === 'deposit' && h.targetId)
      .map((h) => h.targetId as string);
    const transactions = depositIds.length
      ? await this.histories.manager.find(Transaction, {
          where: { id: In(depositIds) },
          relations: { currency: true },
        })
      : [];

    const isBet = (h: UserBalanceHistory) => h.type === 'bet' || h.type === 'bet_payout';
    const betIds = histories.filter((h) => isBet(h) && h.targetId).map((h) => h.targetId as string);
    const bets = betIds.length ? await this.histories.manager.findBy(Bet, { id: In(betIds) }) : [];

    return histories.map((history) => ({
      history,
      transaction:
        history.type === 'deposit'
          ? (transactions.find((t) => t.id === history.targetId) ?? null)
          : null,
      bet: isBet(history) ? (bets.find((b) => b.id === history.targetId) ?? null) : null,
    }));
  }
}
