import { Logger } from '@nestjs/common';
import { formatUnits } from 'ethers';
import { Command, CommandRunner } from 'nest-commander';

import { formatPoints } from '../modules/currencies/points';
import { LedgerService } from '../modules/ledger/ledger.service';
import { UsersService } from '../modules/users/users.service';

/**
 * 사용법: npm run cli -- user-balance <유저 id 또는 이메일>
 *
 * 유저의 토큰별 포인트(user_balances)와 최근 원장(ledger_entries) 20건을 보여준다.
 */
@Command({
  name: 'user-balance',
  arguments: '<user>',
  description: '유저의 포인트와 최근 원장을 보여준다. 예) user-balance alice@example.com',
})
export class UserBalanceCommand extends CommandRunner {
  private readonly logger = new Logger(UserBalanceCommand.name);

  constructor(
    private readonly ledger: LedgerService,
    private readonly users: UsersService,
  ) {
    super();
  }

  async run([idOrEmail]: string[]): Promise<void> {
    const user = await this.users.findByIdOrEmail(idOrEmail);
    if (!user) {
      throw new Error(`유저를 찾을 수 없습니다: ${idOrEmail}`);
    }

    const [balances, entries] = await Promise.all([
      this.ledger.findBalances(user.id),
      this.ledger.findEntries(user.id),
    ]);

    const lines = ['', `${user.email} (${user.id})`, '', '포인트'];
    if (balances.length === 0) {
      lines.push('  없음');
    }
    for (const b of balances) {
      lines.push(`  ${b.currency.symbol.padEnd(8)} ${formatPoints(b.points)}`);
    }

    lines.push('', '최근 원장');
    if (entries.length === 0) {
      lines.push('  없음');
    }
    for (const e of entries) {
      const token = e.transaction
        ? `  (${formatUnits(e.transaction.amount, e.currency.decimals)} ${e.currency.symbol}` +
          `, tx ${e.transaction.txHash})`
        : '';
      lines.push(
        `  ${e.createdAt.toISOString()}  ${e.type.padEnd(8)} ${e.currency.symbol.padEnd(6)}` +
          ` +${formatPoints(e.points)} → ${formatPoints(e.pointsAfter)} 포인트${token}`,
      );
    }
    this.logger.log(lines.join('\n'));
  }
}
