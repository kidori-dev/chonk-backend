import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { SweepItem } from './sweep-item.entity';

/**
 * sweep 상태
 * - pending: 트랜잭션을 보냈고 결과를 기다리는 중 (이 상태로 남아 있으면 tx_hash 로 직접 확인해야 한다)
 * - success: 블록에 포함되어 성공
 * - failed: 실패 (revert 등). error 에 이유가 남는다
 */
export type SweepStatus = 'pending' | 'success' | 'failed';

/** sweep 을 보낼 때의 대상 목록. 영수증 이벤트를 sweep_items 로 바꿀 때 쓴다 */
export interface SweepPlan {
  wallets: { label: string; salt: string; address: string }[];
  assets: { address: string; symbol: string; decimals: number }[];
}

/** pg 는 bigint 를 문자열로 돌려주므로 블록 번호를 숫자로 바꿔서 쓴다 */
const bigintToNumber = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

/** sweep 트랜잭션 1건 = 1행 */
@Entity('sweeps')
export class Sweep {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'chain_id', type: 'integer' })
  chainId!: number;

  @Column({ name: 'factory_address', type: 'varchar', length: 42 })
  factoryAddress!: string;

  /** 돈이 모인 주소 */
  @Column({ name: 'treasury_address', type: 'varchar', length: 42 })
  treasuryAddress!: string;

  /** 트랜잭션을 보내고 가스비를 낸 계정 (컨트랙트 owner) */
  @Column({ name: 'executor_address', type: 'varchar', length: 42 })
  executorAddress!: string;

  /** 트랜잭션 nonce. 같은 nonce 를 다른 트랜잭션이 썼으면 이 트랜잭션은 버려진 것이다 */
  @Column({ type: 'integer', nullable: true })
  nonce!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  plan!: SweepPlan | null;

  @Column({ name: 'tx_hash', type: 'varchar', length: 66 })
  txHash!: string;

  @Column({ type: 'varchar', length: 10 })
  status!: SweepStatus;

  @Column({ name: 'block_number', type: 'bigint', nullable: true, transformer: bigintToNumber })
  blockNumber!: number | null;

  /** 큰 정수라 문자열로 다룬다 */
  @Column({ name: 'gas_used', type: 'numeric', precision: 78, scale: 0, nullable: true })
  gasUsed!: string | null;

  /** 실제로 낸 가스비 (wei) */
  @Column({ name: 'fee_wei', type: 'numeric', precision: 78, scale: 0, nullable: true })
  feeWei!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @OneToMany(() => SweepItem, (item) => item.sweep)
  items!: SweepItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
