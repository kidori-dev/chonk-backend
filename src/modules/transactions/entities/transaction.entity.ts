import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Currency } from '../../currencies/entities/currency.entity';
import { User } from '../../users/entities/user.entity';

/** pg 는 bigint 를 문자열로 돌려주므로 블록 번호를 숫자로 바꿔서 쓴다 */
const bigintToNumber = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

/** 지금은 입금(deposit)만 있다 */
export type TransactionType = 'deposit';

/**
 * 감지한 우리 입금 1건 = 1행 = ERC-20 Transfer 로그 1개 (polling-deposit 이 eth_getLogs 로 찾는다).
 * (chain_id, tx_hash, log_index) 가 유니크라 같은 입금은 한 번만 들어가고, 포인트도 한 번만 오른다.
 */
@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'chain_id', type: 'integer' })
  chainId!: number;

  @Column({ type: 'varchar', length: 16 })
  type!: TransactionType;

  /** 입금 주소의 주인 */
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

  /** 우리 쪽 주소 (입금이면 돈이 들어온 입금 주소) */
  @Column({ type: 'varchar', length: 42 })
  address!: string;

  /** 보낸 주소 */
  @Column({ name: 'from_address', type: 'varchar', length: 42 })
  fromAddress!: string;

  /** 토큰 수량 (최소 단위, 1 USDT = 1000000). 큰 정수라 문자열로 다룬다 */
  @Column({ type: 'numeric', precision: 78, scale: 0 })
  amount!: string;

  @Column({ name: 'tx_hash', type: 'varchar', length: 66 })
  txHash!: string;

  /** 트랜잭션 안에서 Transfer 로그의 위치 (한 tx 에 입금이 여러 개일 수 있어서 tx_hash 와 같이 쓴다) */
  @Column({ name: 'log_index', type: 'integer' })
  logIndex!: number;

  @Column({ name: 'block_number', type: 'bigint', transformer: bigintToNumber })
  blockNumber!: number;

  @Column({ name: 'block_hash', type: 'varchar', length: 66 })
  blockHash!: string;

  @Column({ name: 'block_time', type: 'timestamptz' })
  blockTime!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
