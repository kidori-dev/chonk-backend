import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Block } from 'ethers';
import { Between, In, Repository } from 'typeorm';

import { BlockEntity } from './entities/block.entity';

/** saveBlock 결과: 저장했거나, reorg 라서 앞 블록을 지우고 한 칸 물러났거나 */
export type SaveBlockResult = 'saved' | 'rolled-back';

/** blocks 테이블 읽기/쓰기. 모두 .env 의 CHAIN_ID 체인 기준이다 */
@Injectable()
export class BlocksService {
  constructor(
    @InjectRepository(BlockEntity)
    private readonly blocks: Repository<BlockEntity>,
    private readonly config: ConfigService,
  ) {}

  /**
   * 블록을 저장한다.
   *
   * 저장된 앞 블록과 이어지지 않으면 reorg 다. 앞 블록은 체인에서 빠진 블록이니 지우고 'rolled-back' 을
   * 돌려준다. 부른 쪽은 한 칸 물러나서(앞 블록 번호부터) 다시 받으면 된다. 이어지는 지점이 나올 때까지 반복된다.
   * 최신 블록 근처의 1~2블록 reorg 는 흔하고, 입금 확인(DEPOSIT_CONFIRMATIONS 블록 뒤) 전이니 포인트에는 영향이 없다.
   *
   * 입금 확인을 끝낸(is_scanned) 블록이 뒤집혔다면, 적립한 포인트가 틀렸을 수 있어서 자동으로 고치지 않고 멈춘다.
   */
  async saveBlock(block: Block): Promise<SaveBlockResult> {
    const chainId = this.chainId();
    return this.blocks.manager.transaction(async (manager) => {
      const previous = await manager.findOneBy(BlockEntity, {
        chainId,
        number: block.number - 1,
      });

      if (previous && previous.hash !== block.parentHash) {
        if (previous.isScanned) {
          throw new Error(
            `입금 확인을 끝낸 #${previous.number} 블록이 체인에서 바뀌었습니다. ` +
              '자동으로 고치지 않습니다. 해당 구간의 blocks / transactions / user_balance_histories 를 확인하세요.',
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

  /** 이 번호의 블록이 이미 저장되어 있는지 */
  exists(blockNumber: number): Promise<boolean> {
    return this.blocks.existsBy({ chainId: this.chainId(), number: blockNumber });
  }

  /** 저장된 블록 중 가장 큰 번호. 하나도 없으면 null */
  async findLatestNumber(): Promise<number | null> {
    return (await this.findLatest())?.number ?? null;
  }

  /** 최근 블록 (최신이 앞) */
  findRecent(limit: number): Promise<BlockEntity[]> {
    return this.blocks.find({
      where: { chainId: this.chainId() },
      order: { number: 'DESC' },
      take: limit,
    });
  }

  /** 저장된 블록 중 가장 최신 블록. 하나도 없으면 null */
  findLatest(): Promise<BlockEntity | null> {
    return this.blocks.findOne({ where: { chainId: this.chainId() }, order: { number: 'DESC' } });
  }

  /** from ~ to 번호의 블록 (번호 순, 없는 번호는 빠진다). limit 을 주면 앞에서부터 그 개수까지 */
  findBetween(from: number, to: number, limit?: number): Promise<BlockEntity[]> {
    return this.blocks.find({
      where: { chainId: this.chainId(), number: Between(from, to) },
      order: { number: 'ASC' },
      take: limit,
    });
  }

  /** 번호들로 블록을 찾는다 (없는 번호는 빠진다) */
  findByNumbers(numbers: number[]): Promise<BlockEntity[]> {
    return numbers.length
      ? this.blocks.findBy({ chainId: this.chainId(), number: In(numbers) })
      : Promise.resolve([]);
  }

  /** .env 의 CHAIN_ID */
  chainId(): number {
    return this.config.get<number>('alchemy.chainId')!;
  }
}
