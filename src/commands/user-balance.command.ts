import { Logger } from '@nestjs/common';
import { formatUnits } from 'ethers';
import { Command, CommandRunner } from 'nest-commander';

import { formatPoints } from '../modules/currencies/points';
import { UserBalancesService } from '../modules/user-balances/user-balances.service';
import { UsersService } from '../modules/users/users.service';

/**
 * 사용법: npm run cli -- user-balance <유저 id 또는 이메일>
 *
 * 유저의 포인트(user_balances)와 최근 이력(user_balance_histories) 20건을 보여준다.
 */
@Command({
  name: 'user-balance',
  arguments: '<user>',
  description: '유저의 포인트와 최근 이력을 보여준다. 예) user-balance alice@example.com',
})
export class UserBalanceCommand extends CommandRunner {
  private readonly logger = new Logger(UserBalanceCommand.name);

  constructor(
    private readonly userBalances: UserBalancesService,
    private readonly users: UsersService,
  ) {
    super();
  }

  async run([idOrEmail]: string[]): Promise<void> {
    const user = await this.users.findByIdOrEmail(idOrEmail);
    if (!user) {
      throw new Error(`유저를 찾을 수 없습니다: ${idOrEmail}`);
    }

    const [points, histories] = await Promise.all([
      this.userBalances.findPoints(user.id),
      this.userBalances.findHistories(user.id),
    ]);

    const lines = ['', `${user.email} (${user.id})`, '', `포인트  ${formatPoints(points)}`];

    lines.push('', '최근 이력');
    if (histories.length === 0) {
      lines.push('  없음');
    }
    for (const { history: h, transaction: t, bet } of histories) {
      const token = t
        ? `  (${formatUnits(t.amount, t.currency.decimals)} ${t.currency.symbol}, tx ${t.txHash})`
        : bet
          ? `  (${bet.game}${bet.targetBlockNumber ? ` #${bet.targetBlockNumber}` : ''}, bet ${bet.id})`
          : '';
      const sign = h.points.startsWith('-') ? '' : '+';
      lines.push(
        `  ${h.createdAt.toISOString()}  ${h.type.padEnd(10)} ${sign}${formatPoints(h.points)}` +
          `  ${formatPoints(h.pointsBefore)} → ${formatPoints(h.pointsAfter)} 포인트${token}`,
      );
    }
    this.logger.log(lines.join('\n'));
  }
}
