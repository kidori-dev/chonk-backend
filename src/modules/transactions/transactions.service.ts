import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { Currency } from '../currencies/entities/currency.entity';
import { toPoints } from '../currencies/points';
import { UserBalancesService } from '../user-balances/user-balances.service';
import { Transaction } from './entities/transaction.entity';

/** 새로 기록할 입금 1건 */
export type DepositInput = Omit<Transaction, 'id' | 'type' | 'user' | 'currency' | 'createdAt'>;

/** 기록한 입금 1건과 그 입금으로 오른 포인트 */
export interface RecordedDeposit {
  transaction: Transaction;
  points: string;
}

export interface RecordResult {
  /** 이번에 새로 저장하고 포인트를 올린 입금 */
  recorded: RecordedDeposit[];
  /** 이미 transactions 에 있어서 건너뛴 입금 (같은 구간을 다시 확인한 경우) */
  skipped: DepositInput[];
}

/** transactions 테이블 쓰기 */
@Injectable()
export class TransactionsService {
  constructor(private readonly userBalances: UserBalancesService) {}

  /**
   * 입금을 transactions 에 저장하고 유저 포인트를 올린다. 호출한 쪽의 DB 트랜잭션 안에서 실행된다.
   *
   * 이중 입금 방지: (chain_id, tx_hash, log_index) 가 이미 있으면 저장하지 않고(ON CONFLICT DO NOTHING)
   * 포인트도 올리지 않는다. 실제로 새로 저장된 입금만 포인트를 올린다.
   */
  async recordDeposits(
    manager: EntityManager,
    deposits: { deposit: DepositInput; currency: Currency }[],
  ): Promise<RecordResult> {
    const result: RecordResult = { recorded: [], skipped: [] };

    for (const { deposit, currency } of deposits) {
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(Transaction)
        .values({ ...deposit, type: 'deposit' })
        .orIgnore()
        .returning(['id'])
        .execute();

      const id = (inserted.raw as { id: string }[])[0]?.id;
      if (!id) {
        result.skipped.push(deposit);
        continue;
      }

      const points = toPoints(deposit.amount, currency);
      await this.userBalances.credit(manager, {
        userId: deposit.userId,
        points,
        type: 'deposit',
        targetId: id,
      });
      result.recorded.push({
        transaction: manager.create(Transaction, { ...deposit, id, type: 'deposit' }),
        points,
      });
    }
    return result;
  }
}
