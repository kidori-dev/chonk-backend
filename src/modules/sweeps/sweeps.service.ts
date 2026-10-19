import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { SweepItem } from './entities/sweep-item.entity';
import { Sweep, SweepPlan } from './entities/sweep.entity';

export type CreatePendingSweepInput = Pick<
  Sweep,
  'chainId' | 'factoryAddress' | 'treasuryAddress' | 'executorAddress' | 'txHash' | 'nonce'
> & { plan: SweepPlan };

export type SweepItemInput = Omit<SweepItem, 'id' | 'sweepId' | 'sweep' | 'createdAt'>;

export interface SweepSuccessInput {
  blockNumber: number;
  gasUsed: bigint;
  feeWei: bigint;
  items: SweepItemInput[];
}

/**
 * sweeps / sweep_items 테이블 읽기/쓰기.
 * 트랜잭션을 보내면 pending 으로 저장하고, 결과가 나오면 success / failed 로 바꾼다.
 */
@Injectable()
export class SweepsService {
  constructor(
    @InjectRepository(Sweep)
    private readonly sweeps: Repository<Sweep>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** 트랜잭션을 보낸 직후 호출한다 */
  createPending(input: CreatePendingSweepInput): Promise<Sweep> {
    return this.sweeps.save(this.sweeps.create({ ...input, status: 'pending' }));
  }

  /** 아직 결과가 확정되지 않은 sweep (오래된 것부터) */
  findPending(chainId: number): Promise<Sweep[]> {
    return this.sweeps.find({
      where: { chainId, status: 'pending' },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 성공 결과와 옮긴 금액들을 한 DB 트랜잭션으로 저장한다.
   * 아직 pending 일 때만 바꾼다. sweep 과 sweep-reconcile 이 동시에 처리해도 금액이 두 번 들어가지 않게.
   * @returns 이번 호출로 바뀌었으면 true, 이미 다른 곳에서 처리됐으면 false
   */
  async markSuccess(sweepId: string, input: SweepSuccessInput): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        Sweep,
        { id: sweepId, status: 'pending' },
        {
          status: 'success',
          blockNumber: input.blockNumber,
          gasUsed: input.gasUsed.toString(),
          feeWei: input.feeWei.toString(),
        },
      );
      if (result.affected !== 1) {
        return false;
      }
      await manager.insert(
        SweepItem,
        input.items.map((item) => ({ ...item, sweepId })),
      );
      return true;
    });
  }

  /** 실패로 바꾼다. 아직 pending 일 때만 바꾼다 */
  async markFailed(sweepId: string, error: string): Promise<boolean> {
    const result = await this.sweeps.update(
      { id: sweepId, status: 'pending' },
      { status: 'failed', error },
    );
    return result.affected === 1;
  }
}
