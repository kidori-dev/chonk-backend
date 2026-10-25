import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import type { Game } from '../rules';

/** pg 는 bigint 를 문자열로 돌려주므로 블록 번호를 숫자로 바꿔서 쓴다 */
const nullableBigintToNumber = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

/**
 * 배팅 진행 상태
 * - pending: 포인트를 뺐고 결과를 기다린다 (블록 게임은 판정 블록 + 확인 블록이 쌓일 때까지)
 * - settled: 결과가 정해지고 돌려줄 포인트(payout)까지 반영했다
 */
export type BetStatus = 'pending' | 'settled';

/**
 * 배팅 1건 = 1행. 걸 때 포인트를 빼고(user_balance_histories.type = bet),
 * 정산 때 payout 이 0 보다 크면 돌려준다(type = bet_payout). 두 이력 모두 target_id = bets.id.
 */
@Entity('bets')
export class Bet {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 20 })
  game!: Game;

  /** 판정 블록의 체인. 블록을 쓰지 않는 게임(churu-match)은 null */
  @Column({ name: 'chain_id', type: 'integer', nullable: true })
  chainId!: number | null;

  /** 판정 블록 번호 (서버가 정한다). churu-match 는 null */
  @Column({
    name: 'target_block_number',
    type: 'bigint',
    nullable: true,
    transformer: nullableBigintToNumber,
  })
  targetBlockNumber!: number | null;

  /** 고른 값 (예: odd, orange, seven). 고르는 것 없는 게임은 null */
  @Column({ type: 'varchar', length: 20, nullable: true })
  pick!: string | null;

  /** 건 포인트 */
  @Column({ type: 'numeric', precision: 38, scale: 6 })
  amount!: string;

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status!: BetStatus;

  /** 판정에 쓴 블록 해시. churu-match 는 null */
  @Column({ name: 'block_hash', type: 'varchar', length: 66, nullable: true })
  blockHash!: string | null;

  /** 결과 값 (예: 'f', 'orange', 'churu,fish,cat', '3,4'). 정산 전엔 null */
  @Column({ type: 'varchar', length: 40, nullable: true })
  result!: string | null;

  /** 건 금액의 몇 배를 돌려받았는지 (꽝 0). 정산 전엔 null */
  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  multiplier!: string | null;

  /** 돌려받은 포인트 = amount × multiplier. 정산 전엔 null */
  @Column({ type: 'numeric', precision: 38, scale: 6, nullable: true })
  payout!: string | null;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
