import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { LedgerEntry, LedgerEntryType } from './entities/ledger-entry.entity';
import { UserBalance } from './entities/user-balance.entity';

export interface CreditInput {
  userId: string;
  currencyId: string;
  /** 올릴 포인트 (양수, 소수 6자리까지) */
  points: string;
  type: LedgerEntryType;
  transactionId: string;
}

/**
 * 유저 포인트 원장. 포인트는 이 서비스로만 바꾼다.
 * 포인트 변경과 원장 기록은 항상 호출한 쪽의 DB 트랜잭션(manager) 안에서 같이 일어난다.
 */
@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(UserBalance)
    private readonly balances: Repository<UserBalance>,
    @InjectRepository(LedgerEntry)
    private readonly entries: Repository<LedgerEntry>,
  ) {}

  /**
   * 포인트를 올리고 원장에 남긴다. 반영 후 포인트를 돌려준다.
   * 행이 없으면 만들고, 있으면 DB 에서 바로 더한다 (동시에 여러 곳에서 더해도 값이 꼬이지 않게).
   */
  async credit(manager: EntityManager, input: CreditInput): Promise<string> {
    const rows = (await manager.query(
      `INSERT INTO "user_balances" ("user_id", "currency_id", "points", "updated_at")
       VALUES ($1, $2, $3, now())
       ON CONFLICT ("user_id", "currency_id")
       DO UPDATE SET "points" = "user_balances"."points" + EXCLUDED."points", "updated_at" = now()
       RETURNING "points"`,
      [input.userId, input.currencyId, input.points],
    )) as { points: string }[];
    const pointsAfter = rows[0].points;

    await manager.insert(LedgerEntry, {
      userId: input.userId,
      currencyId: input.currencyId,
      type: input.type,
      points: input.points,
      pointsAfter,
      transactionId: input.transactionId,
    });
    return pointsAfter;
  }

  /** 유저의 토큰별 포인트 */
  findBalances(userId: string): Promise<UserBalance[]> {
    return this.balances.find({
      where: { userId },
      relations: { currency: true },
      order: { currencyId: 'ASC' },
    });
  }

  /** 유저의 원장 (최근 것부터) */
  findEntries(userId: string, limit = 20, offset = 0): Promise<LedgerEntry[]> {
    return this.entries.find({
      where: { userId },
      relations: { currency: true, transaction: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: offset,
    });
  }
}
