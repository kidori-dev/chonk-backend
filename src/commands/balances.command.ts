import { Logger } from '@nestjs/common';
import { formatUnits, Interface } from 'ethers';
import { Command, CommandRunner, Option } from 'nest-commander';

import { AlchemyService, MulticallCall } from '../modules/alchemy/alchemy.service';
import { CurrenciesService } from '../modules/currencies/currencies.service';
import { DepositAddressesService } from '../modules/deposit-addresses/deposit-addresses.service';
import { ERC20_ABI } from '../modules/sweep-contracts/sweep-factory';

interface BalancesOptions {
  currency?: string[];
  nonzero?: boolean;
}

const erc20 = new Interface(ERC20_ABI);

/**
 * 사용법: npm run cli -- balances [--currency <심볼>]... [--nonzero]
 * 예)    npm run cli -- balances --nonzero          (등록된 currency 전체, 잔액 있는 주소만)
 *        npm run cli -- balances -c USDT            (USDT 만)
 *
 * deposit_addresses 에 발급된 입금 주소 전체의 잔액을 체인에서 조회한다 (sweep 전 확인용).
 * 자산은 currencies 에 등록·활성화된 것만 조회한다.
 * Multicall3 로 수백 건씩 묶어 보내서 주소가 많아도 RPC 호출 수가 적다.
 * 잔액이 있는 유저로 바로 sweep 할 수 있는 명령도 같이 보여준다.
 */
@Command({
  name: 'balances',
  description:
    '발급된 입금 주소 전체의 잔액을 조회한다. 예) balances [-c USDT] [--nonzero (잔액 있는 주소만)]',
})
export class BalancesCommand extends CommandRunner {
  private readonly logger = new Logger(BalancesCommand.name);

  constructor(
    private readonly alchemy: AlchemyService,
    private readonly depositAddresses: DepositAddressesService,
    private readonly currencies: CurrenciesService,
  ) {
    super();
  }

  async run(_params: string[], options: BalancesOptions): Promise<void> {
    const assets = await this.currencies.findActive(options.currency);
    const factory = await this.depositAddresses.currentFactory();
    const addresses = await this.depositAddresses.findAll();
    if (addresses.length === 0) {
      this.logger.log('발급된 입금 주소가 없습니다. 먼저 deposit-address-issue 를 실행하세요.');
      return;
    }

    // 1. 주소 × 토큰 잔액(balanceOf)을 Multicall3 로 한 번에 조회한다
    const calls: MulticallCall[] = addresses.flatMap((d) =>
      assets.map((asset) => ({
        target: asset.address,
        callData: erc20.encodeFunctionData('balanceOf', [d.address]),
      })),
    );
    const results = await this.alchemy.multicall(calls);

    // balances[i][j] = i 번째 주소의 j 번째 자산 잔액 (조회 실패면 null)
    const balances = addresses.map((_, i) =>
      assets.map((_, j) => decodeBalance(results[i * assets.length + j])),
    );

    // 2. 표로 보여준다
    const holders = addresses.filter((_, i) => balances[i].some((b) => b !== null && b > 0n));
    // 최소 sweep 금액 이상인 잔액이 있는 주소 (sweep 해도 되는 주소)
    const sweepable = addresses.filter((_, i) =>
      balances[i].some((b, j) => b !== null && b > 0n && b >= BigInt(assets[j].minSweepAmount)),
    );
    const rows = addresses
      .map((d, i) => ({ d, balances: balances[i] }))
      .filter((row) => !options.nonzero || holders.includes(row.d));

    const header = ['user', 'user_id', 'address', ...assets.map((a) => a.symbol)];
    const body = rows.map((row) => [
      row.d.user.email,
      row.d.userId,
      row.d.address,
      ...row.balances.map((b, j) => (b === null ? '조회실패' : formatUnits(b, assets[j].decimals))),
    ]);
    const totals = assets.map((a, j) =>
      formatUnits(
        balances.reduce((sum, b) => sum + (b[j] ?? 0n), 0n),
        a.decimals,
      ),
    );

    const lines = [
      '',
      `체인 ${factory.chainId} / factory ${factory.factoryAddress}`,
      ...(body.length > 0
        ? renderTable(header, body, ['합계', '', '', ...totals])
        : ['잔액이 있는 입금 주소가 없습니다.']),
      `잔액 있는 주소 ${holders.length} / 전체 ${addresses.length}` +
        ` (최소 sweep 금액 이상 ${sweepable.length})`,
    ];

    if (sweepable.length > 0) {
      // 자산을 골라서 조회했으면 sweep 도 같은 자산만 하도록 -c 를 붙여준다
      const currencyArgs = options.currency ? assets.map((a) => ` -c ${a.symbol}`).join('') : '';
      lines.push(
        '',
        '최소 sweep 금액 이상인 유저를 sweep 하려면:',
        `npm run cli -- sweep ${sweepable.map((d) => d.userId).join(' ')}${currencyArgs}`,
        `(전체를 한 번에: npm run cli -- sweep --all${currencyArgs})`,
      );
    }
    this.logger.log(lines.join('\n'));
  }

  @Option({
    flags: '-c, --currency <symbol>',
    description: '조회할 자산 심볼 (currencies 에 등록된 것). 여러 개면 반복. 생략하면 전체',
  })
  parseCurrency(value: string, previous: string[] = []): string[] {
    return [...previous, value];
  }

  @Option({ flags: '-z, --nonzero', description: '잔액이 있는 주소만 보여준다' })
  parseNonzero(): boolean {
    return true;
  }
}

/** Multicall3 결과 하나를 잔액으로 바꾼다. 실패했거나 형식이 이상하면 null */
function decodeBalance(result: { success: boolean; returnData: string }): bigint | null {
  if (!result.success || result.returnData.length !== 66) {
    return null;
  }
  return BigInt(result.returnData);
}

/** 열 너비를 맞춘 표. 마지막 줄은 합계 */
function renderTable(header: string[], body: string[][], footer: string[]): string[] {
  const widths = header.map((h, col) =>
    Math.max(h.length, footer[col].length, ...body.map((row) => row[col].length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, col) => (col < 3 ? cell.padEnd(widths[col]) : cell.padStart(widths[col])))
      .join('  ');
  const separator = widths.map((w) => '-'.repeat(w)).join('  ');
  return [line(header), separator, ...body.map(line), separator, line(footer)];
}
