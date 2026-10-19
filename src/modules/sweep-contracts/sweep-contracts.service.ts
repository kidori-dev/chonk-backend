import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SweepContract } from './entities/sweep-contract.entity';

export type CreateSweepContractInput = Omit<SweepContract, 'id' | 'createdAt'>;

/** sweep_contracts 테이블 읽기/쓰기 */
@Injectable()
export class SweepContractsService {
  constructor(
    @InjectRepository(SweepContract)
    private readonly sweepContracts: Repository<SweepContract>,
  ) {}

  save(input: CreateSweepContractInput): Promise<SweepContract> {
    return this.sweepContracts.save(this.sweepContracts.create(input));
  }

  /** 이 체인에 배포된 컨트랙트 목록 (최근 것부터) */
  findByChain(chainId: number): Promise<SweepContract[]> {
    return this.sweepContracts.find({ where: { chainId }, order: { createdAt: 'DESC' } });
  }
}
