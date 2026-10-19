import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Command, CommandRunner } from 'nest-commander';

import { errorMessage } from '../common/errors';
import { AlchemyService } from '../modules/alchemy/alchemy.service';
import { formatBlock } from '../modules/alchemy/format-block';
import { BlocksService } from '../modules/blocks/blocks.service';

/**
 * 사용법: npm run cli -- polling-block
 *
 * 최신 블록을 따라가며 blocks 테이블에 저장한다. Ctrl+C 로 종료한다.
 * 블록은 unfinalized 로 저장되고, polling-deposit 이 finalized 로 바꾼 뒤 토큰 입금을 확인한다 (blocks.status, is_scanned).
 *
 * - 시작 위치: blocks 테이블이 비어 있으면 지금 최신 블록부터, 있으면 마지막 저장 블록 다음부터
 *   (그사이 밀린 블록을 빠짐없이 백필한다)
 * - reorg: 새 블록이 저장된 앞 블록과 이어지지 않으면, 앞 블록을 지우고 한 칸씩 물러나며 다시 받는다
 */
@Command({
  name: 'polling-block',
  description:
    '최신 블록을 따라가며 blocks 에 저장한다 (reorg 는 자동으로 되감는다). 마지막 저장 블록 다음부터 이어서 한다.',
})
export class PollingBlockCommand extends CommandRunner {
  private readonly logger = new Logger(PollingBlockCommand.name);

  constructor(
    private readonly alchemy: AlchemyService,
    private readonly blocks: BlocksService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const intervalMs = this.config.get<number>('alchemy.pollIntervalMs')!;

    // 다음에 저장할 블록 번호
    const lastSavedNumber = await this.blocks.findLatestNumber();
    let nextBlockNumber =
      lastSavedNumber === null ? await this.alchemy.getLatestBlockNumber() : lastSavedNumber + 1;
    this.logger.log(
      `#${nextBlockNumber} 부터 시작 ` +
        `(마지막 저장 블록: ${lastSavedNumber === null ? '없음' : `#${lastSavedNumber}`}, ` +
        `${intervalMs}ms 마다 확인)`,
    );

    while (true) {
      try {
        const latestBlockNumber = await this.alchemy.getLatestBlockNumber();

        // 지난번 확인 이후 생긴 블록을 빠짐없이 순서대로 저장한다
        while (nextBlockNumber <= latestBlockNumber) {
          const block = await this.alchemy.getBlock(nextBlockNumber);

          // 노드에 아직 반영되지 않았다. 다음 확인 때 다시 시도한다
          if (!block) {
            break;
          }

          if ((await this.blocks.saveBlock(block)) === 'rolled-back') {
            // reorg: 저장된 앞 블록이 체인에서 빠졌다. 지웠으니 그 번호부터 다시 받는다
            nextBlockNumber--;
            this.logger.warn(
              `reorg: 저장된 #${nextBlockNumber} 이 체인에서 빠져 지우고 다시 받습니다`,
            );
            continue;
          }

          this.logger.log(formatBlock(block));
          nextBlockNumber++;
        }
      } catch (err) {
        // 네트워크/DB 오류 등은 로그만 남기고, 다음 확인 때 같은 블록부터 다시 시도한다
        this.logger.error(`블록 처리 실패: ${errorMessage(err)}`);
      }

      await sleep(intervalMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
