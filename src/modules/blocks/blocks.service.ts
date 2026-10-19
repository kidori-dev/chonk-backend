import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Block } from 'ethers';
import { LessThanOrEqual, Repository } from 'typeorm';

import { BlockEntity } from './entities/block.entity';

/** saveBlock 결과: 저장했거나, reorg 라서 앞 블록을 지우고 한 칸 물러났거나 */
export type SaveBlockResult = 'saved' | 'rolled-back';

/** markFinalized 결과 */
export type MarkFinalizedResult =
  | { status: 'marked'; count: number }
  /** DB 에 그 finalized 블록이 아직 없다 (polling-block 이 아직 거기까지 못 갔다) */
  | { status: 'not-stored' }
  /** DB 의 같은 번호 블록이 finalized 블록과 다르다 (polling-block 이 아직 reorg 를 되감기 전) */
  | { status: 'hash-mismatch' };

/** blocks 테이블 읽기/쓰기. 모두 .env 의 CHAIN_ID 체인 기준이다 */
@Injectable()
export class BlocksService {
  constructor(
    @InjectRepository(BlockEntity)
    private readonly blocks: Repository<BlockEntity>,
    private readonly config: ConfigService,
  ) {}

  /**
   * 블록을 unfinalized 상태로 저장한다.
   *
   * 저장된 앞 블록과 이어지지 않으면 reorg 다. 앞 블록은 체인에서 빠진 블록이니 지우고 'rolled-back' 을
   * 돌려준다. 부른 쪽은 한 칸 물러나서(앞 블록 번호부터) 다시 받으면 된다. 이어지는 지점이 나올 때까지 반복된다.
   * 최신 블록 근처의 1~2블록 reorg 는 흔하고, unfinalized 블록이라 입금 확인 전이니 포인트에는 영향이 없다.
   *
   * 이미 finalized 인 블록이 뒤집혔다면 프로토콜상 일어나면 안 되는 일이라 자동으로 고치지 않고 멈춘다.
   */
  async saveBlock(block: Block): Promise<SaveBlockResult> {
    const chainId = this.chainId();
    return this.blocks.manager.transaction(async (manager) => {
      const previous = await manager.findOneBy(BlockEntity, {
        chainId,
        number: block.number - 1,
      });

      if (previous && previous.hash !== block.parentHash) {
        if (previous.status !== 'unfinalized') {
          throw new Error(
            `${previous.status} 상태인 #${previous.number} 블록이 체인에서 바뀌었습니다. ` +
              '자동으로 고치지 않습니다. 해당 구간의 blocks / transactions / ledger_entries 를 확인하세요.',
          );
        }
        await manager.delete(BlockEntity, { chainId, number: previous.number });
        return 'rolled-back';
      }

      await manager.upsert(
        BlockEntity,
        {
          chainId,
          number: block.number,
          hash: block.hash!,
          parentHash: block.parentHash,
          txCount: block.transactions.length,
          blockTime: new Date(block.timestamp * 1000),
        },
        ['chainId', 'number'],
      );
      return 'saved';
    });
  }

  /**
   * 노드의 finalized 블록 기준으로, 그 번호 이하의 unfinalized 블록을 finalized 로 바꾼다.
   * DB 에 그 블록이 있고 hash 가 같을 때만 바꾼다 (DB 블록들은 앞 블록 hash 로 이어져 있으니,
   * 이 블록이 맞으면 그 아래도 체인과 같다).
   */
  async markFinalized(finalized: Block): Promise<MarkFinalizedResult> {
    const chainId = this.chainId();
    const stored = await this.blocks.findOneBy({ chainId, number: finalized.number });
    if (!stored) {
      return { status: 'not-stored' };
    }
    if (stored.hash !== finalized.hash) {
      return { status: 'hash-mismatch' };
    }

    const result = await this.blocks.update(
      { chainId, status: 'unfinalized', number: LessThanOrEqual(finalized.number) },
      { status: 'finalized' },
    );
    return { status: 'marked', count: result.affected ?? 0 };
  }

  /** 이 번호의 블록이 이미 저장되어 있는지 */
  exists(blockNumber: number): Promise<boolean> {
    return this.blocks.existsBy({ chainId: this.chainId(), number: blockNumber });
  }

  /** 저장된 블록 중 가장 큰 번호. 하나도 없으면 null */
  async findLatestNumber(): Promise<number | null> {
    const latest = await this.blocks.findOne({
      where: { chainId: this.chainId() },
      order: { number: 'DESC' },
    });
    return latest?.number ?? null;
  }

  private chainId(): number {
    return this.config.get<number>('alchemy.chainId')!;
  }
}
