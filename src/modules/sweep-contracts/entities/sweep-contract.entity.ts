import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** pg 는 bigint 를 문자열로 돌려주므로 블록 번호를 숫자로 바꿔서 쓴다 */
const bigintToNumber = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

/**
 * 배포한 SweepFactory 한 개 = 한 행. (contracts/src/SweepFactory.sol)
 * 같은 체인에 여러 번 배포했다면 가장 최근(created_at) 행이 지금 쓰는 컨트랙트다.
 */
@Entity('sweep_contracts')
export class SweepContract {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'chain_id', type: 'integer' })
  chainId!: number;

  /** SweepFactory 주소. 입금 주소 계산(predictAddress)과 sweep 을 여기로 호출한다 */
  @Column({ name: 'factory_address', type: 'varchar', length: 42 })
  factoryAddress!: string;

  /** 입금 주소(Clone)들이 로직을 빌려 쓰는 DepositWallet 원본 주소 */
  @Column({ name: 'implementation_address', type: 'varchar', length: 42 })
  implementationAddress!: string;

  /** 배포 시점의 owner (= 배포한 계정). sweep / treasury 변경 권한을 가진다 */
  @Column({ name: 'owner_address', type: 'varchar', length: 42 })
  ownerAddress!: string;

  /** 배포 시점의 treasury. sweep 한 돈이 모이는 주소 */
  @Column({ name: 'treasury_address', type: 'varchar', length: 42 })
  treasuryAddress!: string;

  @Column({ name: 'deploy_tx_hash', type: 'varchar', length: 66 })
  deployTxHash!: string;

  @Column({ name: 'deploy_block_number', type: 'bigint', transformer: bigintToNumber })
  deployBlockNumber!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
