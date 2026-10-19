import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Command, CommandRunner } from 'nest-commander';

import { errorMessage } from '../common/errors';
import { AlchemyService } from '../modules/alchemy/alchemy.service';
import { BlocksService } from '../modules/blocks/blocks.service';
import { DepositScannerService } from '../modules/deposits/deposit-scanner.service';

/**
 * 사용법: npm run cli -- polling-deposit
 *
 * DEPOSIT_POLL_INTERVAL_MS(기본 60초)마다:
 * 1. 노드의 finalized(최종 확정) 블록을 확인하고, 그 번호 이하의 blocks 를 unfinalized → finalized 로 바꾼다
 * 2. finalized 블록이 DEPOSIT_SCAN_BATCH(기본 10)개 쌓이면, 그 구간을 eth_getLogs 한 번으로 확인해
 *    토큰(ERC-20) 입금을 찾고 transactions 저장 + 유저 포인트 적립 후 is_scanned = true 로 바꾼다
 * Ctrl+C 로 종료한다.
 *
 * - finalized 블록만 확인하므로 reorg 로 입금이 취소될 일이 없다 (대신 반영이 약 13~15분 늦다)
 * - DEPOSIT_POLL_INTERVAL_MS(기본 60초)마다 finalized 블록을 확인한다 (Alchemy 요청 1회)
 * - 블록마다 묻지 않고 모아서 한 번에 물어서 Alchemy 요청을 줄인다
 * - 이미 transactions 에 있는 tx 는 건너뛴다. 같은 구간을 다시 확인해도 이중 입금이 되지 않는다
 */
@Command({
  name: 'polling-deposit',
  description:
    'blocks 를 finalized 로 확정하고, 모아서 eth_getLogs 로 토큰 입금을 찾아 포인트 적립. Ctrl+C 로 종료.',
})
export class PollingDepositCommand extends CommandRunner {
  private readonly logger = new Logger(PollingDepositCommand.name);

  constructor(
    private readonly alchemy: AlchemyService,
    private readonly blocks: BlocksService,
    private readonly scanner: DepositScannerService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const intervalMs = this.config.get<number>('deposit.pollIntervalMs')!;
    const batchSize = this.config.get<number>('deposit.scanBatch')!;
    this.logger.log(
      `토큰 입금 확인 시작 (finalized 블록이 ${batchSize}개 쌓이면 eth_getLogs 1회, ` +
        `${intervalMs}ms 마다 finalized 블록 확인)`,
    );

    while (true) {
      try {
        // 1. 노드의 finalized 블록 이하를 finalized 로 확정한다
        const finalized = await this.alchemy.getFinalizedBlock();
        const marked = await this.blocks.markFinalized(finalized);
        if (marked.status === 'marked' && marked.count > 0) {
          this.logger.log(`#${finalized.number} 까지 finalized 로 확정 (${marked.count}블록)`);
        } else if (marked.status === 'not-stored') {
          this.logger.log(
            `finalized #${finalized.number} 이 아직 blocks 에 없습니다 (polling-block 이 따라오는 중)`,
          );
        } else if (marked.status === 'hash-mismatch') {
          this.logger.warn(
            `저장된 #${finalized.number} 이 finalized 블록과 다릅니다. polling-block 이 reorg 를 되감을 때까지 기다립니다.`,
          );
        }

        // 2. finalized 블록을 쌓인 만큼 연달아 확인한다. 덜 쌓였으면 null 이 와서 멈춘다
        let result = await this.scanner.scanLogs(batchSize);
        while (result) {
          this.logger.log(
            `#${result.fromBlock}~#${result.toBlock} 로그 확인: ` +
              `입금 ${result.recorded.length}건, 이미 처리돼 건너뜀 ${result.skipped.length}건`,
          );
          for (const deposit of result.recorded) {
            this.logger.log(`  입금 ${this.scanner.describe(deposit, result.watch)}`);
          }
          for (const deposit of result.skipped) {
            this.logger.log(`  건너뜀 ${deposit.txHash} (log ${deposit.logIndex})`);
          }
          result = await this.scanner.scanLogs(batchSize);
        }
      } catch (err) {
        // 네트워크/DB 오류 등은 로그만 남기고, 다음 확인 때 같은 구간부터 다시 시도한다
        this.logger.error(`토큰 입금 확인 실패: ${errorMessage(err)}`);
      }

      await sleep(intervalMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
