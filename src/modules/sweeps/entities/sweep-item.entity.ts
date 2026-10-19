import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Sweep } from './sweep.entity';

/** sweep 에서 실제로 옮긴 금액 1건 = 1행 (입금 주소 하나 × 자산 하나) */
@Entity('sweep_items')
export class SweepItem {
  /** bigint identity. pg 가 bigint 를 문자열로 돌려줘서 string 으로 다룬다 */
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'sweep_id', type: 'uuid' })
  sweepId!: string;

  @ManyToOne(() => Sweep, (sweep) => sweep.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sweep_id' })
  sweep!: Sweep;

  /** 입금 주소를 만든 라벨 (예: 유저 ID) */
  @Column({ type: 'varchar', length: 255 })
  label!: string;

  @Column({ type: 'varchar', length: 66 })
  salt!: string;

  /** 돈을 꺼낸 입금 주소 */
  @Column({ name: 'wallet_address', type: 'varchar', length: 42 })
  walletAddress!: string;

  /** 이 sweep 에서 입금 주소의 Clone 이 새로 배포됐는지 */
  @Column({ name: 'wallet_deployed', type: 'boolean' })
  walletDeployed!: boolean;

  /** ETH 는 0x0000000000000000000000000000000000000000 */
  @Column({ name: 'token_address', type: 'varchar', length: 42 })
  tokenAddress!: string;

  @Column({ name: 'token_symbol', type: 'varchar', length: 32 })
  tokenSymbol!: string;

  @Column({ name: 'token_decimals', type: 'integer' })
  tokenDecimals!: number;

  /** 옮긴 수량 (최소 단위, 예: USDT 1개 = 1000000). 큰 정수라 문자열로 다룬다 */
  @Column({ type: 'numeric', precision: 78, scale: 0 })
  amount!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
