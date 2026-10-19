import { Logger } from '@nestjs/common';
import { formatUnits } from 'ethers';
import { Command, CommandRunner, Option } from 'nest-commander';

import { CurrenciesService } from '../modules/currencies/currencies.service';
import { Currency } from '../modules/currencies/entities/currency.entity';
import { formatPoints } from '../modules/currencies/points';

interface CurrencyAddOptions {
  ratio?: string;
  min?: string;
}

/**
 * 사용법: npm run cli -- currency-add <ERC-20 주소> [--ratio 1] [--min 10]
 *
 * 취급할 ERC-20 토큰을 currencies 테이블에 등록한다. 심볼/소수점은 체인에서 읽는다.
 * 입금 감지 / sweep / balances 는 등록된 토큰만 다룬다.
 * - --ratio: 토큰 1개당 포인트 (생략하면 1 → 1 USDT = 1 포인트)
 * - --min:   최소 sweep 금액 (사람이 읽는 단위, 생략하면 0). 잔액이 이보다 적은 입금 주소는 sweep 하지 않는다
 */
@Command({
  name: 'currency-add',
  arguments: '<contract>',
  description: 'ERC-20 토큰을 등록한다. 예) currency-add 0xUSDT주소 --ratio 1 --min 10',
})
export class CurrencyAddCommand extends CommandRunner {
  private readonly logger = new Logger(CurrencyAddCommand.name);

  constructor(private readonly currencies: CurrenciesService) {
    super();
  }

  async run([contract]: string[], options: CurrencyAddOptions): Promise<void> {
    const currency = await this.currencies.addToken(contract, options.ratio, options.min);
    this.logger.log(`등록 완료: ${formatCurrency(currency)}`);
  }

  @Option({
    flags: '-r, --ratio <points>',
    description: '토큰 1개당 포인트 (예: 1 = 1 USDT 당 1 포인트). 생략하면 1',
  })
  parseRatio(value: string): string {
    return value;
  }

  @Option({
    flags: '-m, --min <amount>',
    description: '최소 sweep 금액 (사람이 읽는 단위, 예: 10 = 10 USDT). 생략하면 0',
  })
  parseMin(value: string): string {
    return value;
  }
}

/** 사용법: npm run cli -- currency-set-ratio <심볼> <포인트>   예) currency-set-ratio USDT 1 */
@Command({
  name: 'currency-set-ratio',
  arguments: '<symbol> <points>',
  description: '토큰 1개당 포인트를 바꾼다 (이후 입금부터 적용). 예) currency-set-ratio USDT 1',
})
export class CurrencySetRatioCommand extends CommandRunner {
  private readonly logger = new Logger(CurrencySetRatioCommand.name);

  constructor(private readonly currencies: CurrenciesService) {
    super();
  }

  async run([symbol, points]: string[]): Promise<void> {
    this.logger.log(
      `변경 완료: ${formatCurrency(await this.currencies.setPointRatio(symbol, points))}`,
    );
  }
}

/** 사용법: npm run cli -- currency-set-min <심볼> <금액>   예) currency-set-min USDT 10 */
@Command({
  name: 'currency-set-min',
  arguments: '<symbol> <amount>',
  description: '최소 sweep 금액을 바꾼다 (사람이 읽는 단위). 예) currency-set-min USDT 10',
})
export class CurrencySetMinCommand extends CommandRunner {
  private readonly logger = new Logger(CurrencySetMinCommand.name);

  constructor(private readonly currencies: CurrenciesService) {
    super();
  }

  async run([symbol, amount]: string[]): Promise<void> {
    this.logger.log(
      `변경 완료: ${formatCurrency(await this.currencies.setMinSweep(symbol, amount))}`,
    );
  }
}

/** 사용법: npm run cli -- currency-list */
@Command({ name: 'currency-list', description: '등록된 자산 목록을 보여준다.' })
export class CurrencyListCommand extends CommandRunner {
  private readonly logger = new Logger(CurrencyListCommand.name);

  constructor(private readonly currencies: CurrenciesService) {
    super();
  }

  async run(): Promise<void> {
    const list = await this.currencies.findAll();
    this.logger.log(
      list.length === 0
        ? '등록된 currency 가 없습니다. currency-add 로 등록하세요.'
        : ['', ...list.map(formatCurrency)].join('\n'),
    );
  }
}

/** 사용법: npm run cli -- currency-disable <심볼>  (sweep / balances 대상에서 뺀다) */
@Command({
  name: 'currency-disable',
  arguments: '<symbol>',
  description: '자산을 비활성화한다 (sweep / balances 대상에서 빠진다).',
})
export class CurrencyDisableCommand extends CommandRunner {
  private readonly logger = new Logger(CurrencyDisableCommand.name);

  constructor(private readonly currencies: CurrenciesService) {
    super();
  }

  async run([symbol]: string[]): Promise<void> {
    this.logger.log(`비활성화: ${formatCurrency(await this.currencies.setActive(symbol, false))}`);
  }
}

/** 사용법: npm run cli -- currency-enable <심볼> */
@Command({ name: 'currency-enable', arguments: '<symbol>', description: '자산을 다시 활성화한다.' })
export class CurrencyEnableCommand extends CommandRunner {
  private readonly logger = new Logger(CurrencyEnableCommand.name);

  constructor(private readonly currencies: CurrenciesService) {
    super();
  }

  async run([symbol]: string[]): Promise<void> {
    this.logger.log(`활성화: ${formatCurrency(await this.currencies.setActive(symbol, true))}`);
  }
}

function formatCurrency(c: Currency): string {
  return (
    `${c.symbol.padEnd(8)} ${c.address} decimals=${c.decimals}` +
    `  1개당 ${formatPoints(c.pointRatio)}포인트` +
    `  최소 sweep ${formatUnits(c.minSweepAmount, c.decimals)}` +
    (c.isActive ? '' : '  [비활성]')
  );
}
