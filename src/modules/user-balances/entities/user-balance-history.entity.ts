import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

/** 포인트가 바뀐 이유. 입금(deposit) / 출금(withdraw). 지금은 입금만 기록한다 */
export type UserBalanceHistoryType = 'deposit' | 'withdraw';

/**
 * 유저 포인트 변경 이력 1건 = 1행. 지우거나 고치지 않고 쌓기만 한다.
 * (type, target_id) 가 유니크라 같은 원인이 두 번 반영될 수 없다.
 */
@Entity('user_balance_histories')
export class UserBalanceHistory {
  /** bigint identity. pg 가 bigint 를 문자열로 돌려줘서 string 으로 다룬다 */
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 20 })
  type!: UserBalanceHistoryType;

  /** 바뀐 포인트 (소수 6자리). 늘면 +, 줄면 - */
  @Column({ type: 'numeric', precision: 38, scale: 6 })
  points!: string;

  /** 반영 전 포인트 */
  @Column({ name: 'points_before', type: 'numeric', precision: 38, scale: 6 })
  pointsBefore!: string;

  /** 반영 후 포인트 */
  @Column({ name: 'points_after', type: 'numeric', precision: 38, scale: 6 })
  pointsAfter!: string;

  /**
   * 원인이 된 행의 id. type 에 따라 가리키는 테이블이 달라서 FK 는 걸지 않는다.
   * deposit → transactions.id
   */
  @Column({ name: 'target_id', type: 'bigint', nullable: true })
  targetId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
