import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 취급하는 ERC-20 토큰 하나 = 한 행 (예: USDT, USDC).
 * 입금 감지 / sweep / balances 는 여기 등록된 토큰만 다룬다.
 */
@Entity('currencies')
export class Currency {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'chain_id', type: 'integer' })
  chainId!: number;

  /** 커맨드에서 토큰을 고를 때 쓰는 이름. 대문자로 저장한다 (예: USDT) */
  @Column({ type: 'varchar', length: 32 })
  symbol!: string;

  /** 소수점 자릿수 (USDT 6, USDC 6). 금액은 항상 최소 단위 정수로 다룬다 (1 USDT = 1000000) */
  @Column({ type: 'integer' })
  decimals!: number;

  /** ERC-20 컨트랙트 주소 */
  @Column({ type: 'varchar', length: 42 })
  address!: string;

  /**
   * 토큰 1개당 포인트. 입금되면 유저 포인트(user_balances.points)가 "토큰 개수 × 이 값" 만큼 오른다.
   * 예) 1 이면 1 USDT = 1 포인트. 소수 6자리까지. 문자열로 다룬다
   */
  @Column({ name: 'point_ratio', type: 'numeric', precision: 38, scale: 6, default: 1 })
  pointRatio!: string;

  /**
   * 최소 sweep 금액 (최소 단위). 입금 주소 잔액이 이보다 적으면 sweep 하지 않는다 (가스비가 더 들 수 있어서).
   * 큰 정수라 문자열로 다룬다. 0 이면 잔액이 있으면 전부 sweep
   */
  @Column({ name: 'min_sweep_amount', type: 'numeric', precision: 78, scale: 0, default: 0 })
  minSweepAmount!: string;

  /** false 면 sweep / balances 대상에서 빠진다 (입금 감지는 계속한다) */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
