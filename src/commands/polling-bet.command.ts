import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';

import { errorMessage } from '../common/errors';
import { formatPoints } from '../modules/currencies/points';
import { GamesService } from '../modules/games/games.service';

/** 정산할 배팅을 확인하는 간격. DB 만 읽어서 Alchemy 요청은 없다 */
const SETTLE_INTERVAL_MS = 1000;

/**
 * 사용법: npm run cli -- polling-bet
 *
 * 블록 게임 라운드 결과를 기록하고 배팅을 정산한다. Ctrl+C 로 종료한다.
 * 판정 블록 뒤로 2블록이 더 저장되면(polling-block 이 저장) 판정 블록 해시로 라운드 결과(game_rounds)를 남기고,
 * 그 블록에 건 배팅을 정산해 돌려줄 포인트가 있으면 올린다 (user_balance_histories.type = bet_payout).
 * 여러 개를 띄우거나 다시 실행해도 같은 배팅이 두 번 정산되지 않는다.
 */
@Command({
  name: 'polling-bet',
  description:
    '블록 게임 라운드 결과를 기록하고 배팅을 정산한다 (판정 블록 뒤로 2블록이 더 나오면). Ctrl+C 로 종료.',
})
export class PollingBetCommand extends CommandRunner {
  private readonly logger = new Logger(PollingBetCommand.name);

  constructor(private readonly games: GamesService) {
    super();
  }

  async run(): Promise<void> {
    this.logger.log(`배팅 정산 시작 (${SETTLE_INTERVAL_MS}ms 마다 확인)`);

    while (true) {
      try {
        const { rounds, bets } = await this.games.settlePending();
        if (rounds > 0) {
          this.logger.log(`라운드 결과 ${rounds}블록 기록`);
        }
        for (const bet of bets) {
          this.logger.log(
            `bet ${bet.id} ${bet.game} #${bet.targetBlockNumber} pick=${bet.pick ?? '-'} ` +
              `result=${bet.result} ${formatPoints(bet.amount)} → ${formatPoints(bet.payout!)} 포인트`,
          );
        }
      } catch (err) {
        // DB 오류 등은 로그만 남기고 다음 확인 때 다시 시도한다
        this.logger.error(`배팅 정산 실패: ${errorMessage(err)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
    }
  }
}
