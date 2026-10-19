import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { Currency } from '../../currencies/entities/currency.entity';
import { User } from '../../users/entities/user.entity';

/**
 * 유저 × 토큰별 현재 포인트. 입금되면 "토큰 개수 × currencies.point_ratio" 만큼 오른다.
 * 직접 바꾸지 않고 LedgerService 를 통해서만 바꾼다. 바뀔 때마다 ledger_entries 에 이력이 남는다.
 */
@Entity('user_balances')
export class UserBalance {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ name: 'currency_id', type: 'uuid' })
  currencyId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency_id' })
  currency!: Currency;

  /** 포인트 (소수 6자리). 문자열로 다룬다 */
  @Column({ type: 'numeric', precision: 38, scale: 6, default: 0 })
  points!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
