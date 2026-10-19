import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** pg 는 bigint 를 문자열로 돌려주므로 블록 번호를 숫자로 바꿔서 쓴다 */
const bigintToNumber = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

/**
 * 블록 상태 (체인 기준)
 * - unfinalized: polling-block 이 저장한 블록. 아직 reorg 로 바뀔 수 있다 (polling-block 이 되감을 수 있다)
 * - finalized:   polling-deposit 이 노드의 finalized 블록과 맞춰 확정한 블록. 더는 바뀌지 않는다
 */
export type BlockStatus = 'unfinalized' | 'finalized';

/** 저장한 블록 한 개 = 한 행. (chain_id, number) 가 PK */
@Entity('blocks')
export class BlockEntity {
  @PrimaryColumn({ name: 'chain_id', type: 'integer' })
  chainId!: number;

  @PrimaryColumn({ type: 'bigint', transformer: bigintToNumber })
  number!: number;

  @Column({ type: 'varchar', length: 66 })
  hash!: string;

  @Column({ name: 'parent_hash', type: 'varchar', length: 66 })
  parentHash!: string;

  @Column({ name: 'tx_count', type: 'integer' })
  txCount!: number;

  /** 블록이 만들어진 시각 */
  @Column({ name: 'block_time', type: 'timestamptz' })
  blockTime!: Date;

  /** 블록 상태 (BlockStatus 참고) */
  @Column({ type: 'varchar', length: 12, default: 'unfinalized' })
  status!: BlockStatus;

  /** polling-deposit 이 이 블록의 입금(Transfer 로그)을 확인했는지. finalized 블록만 확인한다 */
  @Column({ name: 'is_scanned', type: 'boolean', default: false })
  isScanned!: boolean;

  /** DB 에 저장된 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
