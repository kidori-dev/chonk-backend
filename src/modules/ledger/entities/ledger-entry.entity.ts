import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Currency } from '../../currencies/entities/currency.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/entities/user.entity';

/** 포인트가 바뀐 이유. 지금은 입금만 있다 */
export type LedgerEntryType = 'deposit';

/**
 * 원장: 유저 포인트가 바뀐 이력 1건 = 1행. 지우거나 고치지 않고 쌓기만 한다.
 * (type, transaction_id) 가 유니크라 같은 트랜잭션이 두 번 반영될 수 없다.
 */
@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'currency_id', type: 'uuid' })
  currencyId!: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency_id' })
  currency!: Currency;

  @Column({ type: 'varchar', length: 20 })
  type!: LedgerEntryType;

  /** 바뀐 포인트 (소수 6자리). 늘면 +, 줄면 - */
  @Column({ type: 'numeric', precision: 38, scale: 6 })
  points!: string;

  /** 반영 후 포인트 */
  @Column({ name: 'points_after', type: 'numeric', precision: 38, scale: 6 })
  pointsAfter!: string;

  /** 원인이 된 트랜잭션 (입금이면 그 입금) */
  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId!: string | null;

  @ManyToOne(() => Transaction, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'transaction_id' })
  transaction!: Transaction | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
