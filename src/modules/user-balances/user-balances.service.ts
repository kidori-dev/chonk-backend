import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { Transaction } from '../transactions/entities/transaction.entity';
import { UserBalance } from './entities/user-balance.entity';
import { UserBalanceHistory, UserBalanceHistoryType } from './entities/user-balance-history.entity';

export interface CreditInput {
  userId: string;
  /** 올릴 포인트 (양수, 소수 6자리까지) */
  points: string;
  type: UserBalanceHistoryType;
  /** 원인이 된 행의 id (deposit → transactions.id) */
  targetId: string;
}

/** 이력 1건 + 입금 이력이면 그 입금 트랜잭션 */
export interface HistoryWithTransaction {
  history: UserBalanceHistory;
  transaction: Transaction | null;
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

  /** 유저의 현재 포인트 (입금이 없었으면 "0") */
  async findPoints(userId: string): Promise<string> {
    const balance = await this.balances.findOneBy({ userId });
    return balance?.points ?? '0';
  }

  /** 유저의 포인트 이력 (최근 것부터). 입금 이력은 그 입금 트랜잭션(토큰 포함)을 같이 붙인다 */
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

    return histories.map((history) => ({
      history,
      transaction:
        history.type === 'deposit'
          ? (transactions.find((t) => t.id === history.targetId) ?? null)
          : null,
    }));
  }
}
