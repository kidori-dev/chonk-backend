import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

/**
 * 유저별 현재 포인트 (유저당 1행). 입금되면 "토큰 개수 × currencies.point_ratio" 만큼 오른다.
 * 직접 바꾸지 않고 UserBalancesService 를 통해서만 바꾼다. 바뀔 때마다 user_balance_histories 에 이력이 남는다.
 */
@Entity('user_balances')
export class UserBalance {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** 포인트 (소수 6자리). 문자열로 다룬다 */
  @Column({ type: 'numeric', precision: 38, scale: 6, default: 0 })
  points!: string;

  /** 행이 만들어진 시각 (첫 포인트 적립 시각) */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
