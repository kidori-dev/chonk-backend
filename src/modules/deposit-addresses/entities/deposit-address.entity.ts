import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

/**
 * 유저에게 발급한 입금 주소 한 개 = 한 행.
 * 주소 = SweepFactory.predictAddress(salt), salt = keccak256(user_id).
 * 발급만 하고 컨트랙트(Clone)는 첫 sweep 때 배포된다.
 */
@Entity('deposit_addresses')
export class DepositAddress {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'chain_id', type: 'integer' })
  chainId!: number;

  /** 이 주소를 계산한 SweepFactory. factory 가 바뀌면 같은 유저라도 주소가 달라진다 */
  @Column({ name: 'factory_address', type: 'varchar', length: 42 })
  factoryAddress!: string;

  @Column({ type: 'varchar', length: 66 })
  salt!: string;

  @Column({ type: 'varchar', length: 42 })
  address!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
