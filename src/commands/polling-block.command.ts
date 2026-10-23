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
 * - 새 블록 감지: ALCHEMY_WS_URL 이 있으면 웹소켓 newHeads 로 바로 알고(eth_blockNumber 호출 없음),
 *   웹소켓이 끊겼을 때를 대비해 WS_FALLBACK_INTERVAL_MS 마다 노드에도 물어본다.
 *   없으면 POLL_INTERVAL_MS 마다 노드에 물어본다 (HTTP 폴링).
 */
// 새 블록 소식은 받았는데 노드에 아직 블록이 없을 때, 다시 시도하기까지 기다리는 시간
const BLOCK_RETRY_MS = 1000;

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
    const heads = new NewHeadSignal();
    const useWs = this.alchemy.watchNewHeads((blockNumber) => heads.push(blockNumber));
    const intervalMs = useWs
      ? this.config.get<number>('alchemy.wsFallbackIntervalMs')!
      : this.config.get<number>('alchemy.pollIntervalMs')!;

    // 다음에 저장할 블록 번호
    const lastSavedNumber = await this.blocks.findLatestNumber();
    let nextBlockNumber =
      lastSavedNumber === null ? await this.alchemy.getLatestBlockNumber() : lastSavedNumber + 1;
    this.logger.log(
      `#${nextBlockNumber} 부터 시작 ` +
        `(마지막 저장 블록: ${lastSavedNumber === null ? '없음' : `#${lastSavedNumber}`}, ` +
        (useWs ? `웹소켓 newHeads + ${intervalMs}ms 마다 확인)` : `${intervalMs}ms 마다 확인)`),
    );

    // 따라갈 최신 블록 번호. null 이면 노드에 물어본다
    let latestBlockNumber: number | null = null;

    while (true) {
      let waitMs = intervalMs;
      try {
        latestBlockNumber ??= await this.alchemy.getLatestBlockNumber();

        // 지난번 확인 이후 생긴 블록을 빠짐없이 순서대로 저장한다
        while (nextBlockNumber <= latestBlockNumber) {
          const block = await this.alchemy.getBlock(nextBlockNumber);

          // 노드에 아직 반영되지 않았다. 잠깐 뒤에 다시 시도한다
          if (!block) {
            waitMs = BLOCK_RETRY_MS;
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

        // 다 따라잡았으면 다음엔 새 블록 소식(또는 노드)을 기다린다
        if (nextBlockNumber > latestBlockNumber) {
          latestBlockNumber = null;
        }
      } catch (err) {
        // 네트워크/DB 오류 등은 로그만 남기고, 다음 확인 때 같은 블록부터 다시 시도한다
        this.logger.error(`블록 처리 실패: ${errorMessage(err)}`);
      }

      // 웹소켓으로 새 블록 소식이 오면 바로 깨어난다. 안 오면 waitMs 뒤 노드에 물어본다
      const head = await heads.wait(waitMs);
      if (head !== null) {
        latestBlockNumber = Math.max(head, latestBlockNumber ?? 0);
      }
    }
  }
}

/**
 * 웹소켓에서 받은 새 블록 번호를 폴링 루프에 넘긴다.
 * 루프가 기다리는 중이면 바로 깨우고, 블록을 처리하는 중이면 다음 wait() 에서 바로 돌려준다.
 */
class NewHeadSignal {
  private latest: number | null = null;
  private wake: (() => void) | null = null;

  push(blockNumber: number): void {
    this.latest = Math.max(blockNumber, this.latest ?? 0);
    this.wake?.();
  }

  /** 새 블록 번호를 기다린다. ms 안에 안 오면 null */
  async wait(ms: number): Promise<number | null> {
    if (this.latest === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        this.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.wake = null;
    }
    const blockNumber = this.latest;
    this.latest = null;
    return blockNumber;
  }
}
