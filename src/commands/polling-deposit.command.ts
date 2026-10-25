import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Command, CommandRunner } from 'nest-commander';

import { errorMessage } from '../common/errors';
import { DepositScannerService } from '../modules/deposits/deposit-scanner.service';

/**
 * 사용법: npm run cli -- polling-deposit
 *
 * DEPOSIT_POLL_INTERVAL_MS(기본 60초)마다, 최신 블록에서 DEPOSIT_CONFIRMATIONS(기본 10) 블록 지난 블록이
 * DEPOSIT_SCAN_BATCH(기본 10)개 쌓이면 그 구간을 eth_getLogs 한 번으로 확인해 토큰(ERC-20) 입금을 찾고
 * transactions 저장 + 유저 포인트 적립 후 is_scanned = true 로 바꾼다.
 * Ctrl+C 로 종료한다.
 *
 * - 10블록(약 2분) 지난 블록만 확인한다. 그보다 깊은 reorg 는 사실상 없고, 생기면 polling-block 이 멈춘다
 * - 입금 반영은 약 2~5분 걸린다 (confirmations 10 + 배치 10 + 확인 간격)
 * - 확인할 블록은 DB(blocks)만 보고 정한다. Alchemy 요청은 eth_getLogs 뿐이다
 * - 블록마다 묻지 않고 모아서 한 번에 물어서 Alchemy 요청을 줄인다
 * - 이미 transactions 에 있는 tx 는 건너뛴다. 같은 구간을 다시 확인해도 이중 입금이 되지 않는다
 */
@Command({
  name: 'polling-deposit',
  description:
    '10블록 지난 블록을 모아 eth_getLogs 로 토큰 입금을 찾아 포인트 적립. Ctrl+C 로 종료.',
})
export class PollingDepositCommand extends CommandRunner {
  private readonly logger = new Logger(PollingDepositCommand.name);

  constructor(
    private readonly scanner: DepositScannerService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const intervalMs = this.config.get<number>('deposit.pollIntervalMs')!;
    const batchSize = this.config.get<number>('deposit.scanBatch')!;
    const confirmations = this.config.get<number>('deposit.confirmations')!;
    this.logger.log(
      `토큰 입금 확인 시작 (${confirmations}블록 지난 블록이 ${batchSize}개 쌓이면 eth_getLogs 1회, ` +
        `${intervalMs}ms 마다 확인)`,
    );

    while (true) {
      try {
        // confirmations 지난 블록을 쌓인 만큼 연달아 확인한다. 덜 쌓였으면 null 이 와서 멈춘다
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
