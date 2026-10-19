import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';

import { AlchemyService } from '../modules/alchemy/alchemy.service';
import { formatBlock } from '../modules/alchemy/format-block';
import { BlocksService } from '../modules/blocks/blocks.service';

/**
 * 사용법: npm run cli -- target-block <블록 높이>
 *
 * polling-block 이 이미 지나간 구간에서 빠진 블록 하나를 채운다 (백필용).
 * 저장된 블록의 토큰 입금은 polling-deposit 이 확인한다.
 *
 * polling-block 의 마지막 저장 블록보다 뒤의 블록은 저장하지 않는다.
 * (뒤의 블록을 먼저 저장하면 polling-block 이 거기서부터 이어가서 그 사이 블록을 건너뛰게 된다)
 */
@Command({
  name: 'target-block',
  arguments: '<blockNumber>',
  description: 'polling-block 이 지나간 구간에서 빠진 블록 하나를 저장한다. 이미 있으면 건너뛴다.',
})
export class TargetBlockCommand extends CommandRunner {
  private readonly logger = new Logger(TargetBlockCommand.name);

  constructor(
    private readonly alchemy: AlchemyService,
    private readonly blocks: BlocksService,
  ) {
    super();
  }

  async run([input]: string[]): Promise<void> {
    const blockNumber = Number(input);
    if (!Number.isInteger(blockNumber) || blockNumber < 0) {
      throw new Error(`블록 높이는 0 이상의 정수여야 합니다. (입력값: ${input})`);
    }

    // 이미 저장된 블록이면 Alchemy 를 호출하지 않고 끝낸다.
    if (await this.blocks.exists(blockNumber)) {
      this.logger.log(`#${blockNumber} 은 이미 저장되어 있어 건너뜁니다.`);
      return;
    }

    // polling-block 이 아직 가지 않은 블록은 저장하지 않는다 (polling-block 이 저장한다)
    const lastSavedNumber = await this.blocks.findLatestNumber();
    if (lastSavedNumber === null || blockNumber > lastSavedNumber) {
      throw new Error(
        `#${blockNumber} 은 polling-block 이 아직 지나가지 않은 블록입니다 ` +
          `(마지막 저장 블록: ${lastSavedNumber === null ? '없음' : `#${lastSavedNumber}`}). ` +
          'target-block 은 지나간 구간에서 빠진 블록을 채울 때만 쓴다.',
      );
    }

    const block = await this.alchemy.getBlock(blockNumber);
    if (!block) {
      throw new Error(`#${blockNumber} 블록이 없습니다.`);
    }

    if ((await this.blocks.saveBlock(block)) === 'rolled-back') {
      throw new Error(
        `#${blockNumber - 1} 이 체인에서 빠진 블록이라 지웠습니다 (reorg). ` +
          `target-block ${blockNumber - 1} 부터 다시 채우세요.`,
      );
    }
    this.logger.log(`${formatBlock(block)} → 저장 완료 (토큰 입금은 polling-deposit 이 확인한다)`);
  }
}
