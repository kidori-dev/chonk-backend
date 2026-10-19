import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { getAddress, parseUnits } from 'ethers';
import { Repository } from 'typeorm';

import { AlchemyService } from '../alchemy/alchemy.service';
import { ERC20_ABI } from '../sweep-contracts/sweep-factory';
import { Currency } from './entities/currency.entity';

/**
 * currencies 테이블 읽기/쓰기. 모두 .env 의 CHAIN_ID 체인 기준이다.
 */
@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private readonly currencies: Repository<Currency>,
    private readonly alchemy: AlchemyService,
    private readonly config: ConfigService,
  ) {}

  /**
   * ERC-20 토큰을 등록한다. 심볼과 소수점은 체인에서 직접 읽는다.
   * - pointRatio: 토큰 1개당 포인트 (예: "1" = 1 USDT 당 1 포인트)
   * - minSweep: 최소 sweep 금액, 사람이 읽는 단위 (예: "10" = 10 USDT). 0 이면 잔액이 있으면 전부 sweep
   */
  async addToken(address: string, pointRatio = '1', minSweep = '0'): Promise<Currency> {
    const tokenAddress = getAddress(address);
    if ((await this.alchemy.getCode(tokenAddress)) === '0x') {
      throw new Error(
        `${tokenAddress} 에 컨트랙트가 없습니다. 주소와 체인(CHAIN_ID)을 확인하세요.`,
      );
    }
    const [symbol, decimals] = await Promise.all([
      this.alchemy.call<string>(tokenAddress, ERC20_ABI, 'symbol'),
      this.alchemy.call<bigint>(tokenAddress, ERC20_ABI, 'decimals'),
    ]);
    return this.save({
      symbol,
      decimals: Number(decimals),
      address: tokenAddress,
      pointRatio: toPointRatio(pointRatio),
      minSweepAmount: toMinUnits(minSweep, Number(decimals)),
    });
  }

  /** 등록된 전체 (비활성 포함) */
  findAll(): Promise<Currency[]> {
    return this.currencies.find({
      where: { chainId: this.chainId() },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * sweep / balances 대상 자산.
   * symbols 를 주면 그 자산만, 안 주면 활성화된 전체. 없거나 비활성인 심볼이 있으면 에러.
   */
  async findActive(symbols?: string[]): Promise<Currency[]> {
    const active = await this.currencies.find({
      where: { chainId: this.chainId(), isActive: true },
      order: { createdAt: 'ASC' },
    });
    if (active.length === 0) {
      throw new Error('활성화된 currency 가 없습니다. 먼저 currency-add 로 등록하세요.');
    }
    if (!symbols || symbols.length === 0) {
      return active;
    }

    const wanted = [...new Set(symbols.map(normalizeSymbol))];
    const unknown = wanted.filter((s) => !active.some((c) => c.symbol === s));
    if (unknown.length > 0) {
      throw new Error(
        `등록되지 않았거나 비활성인 currency: ${unknown.join(', ')} ` +
          `(사용 가능: ${active.map((c) => c.symbol).join(', ')})`,
      );
    }
    return active.filter((c) => wanted.includes(c.symbol));
  }

  /** 활성/비활성 전환 */
  async setActive(symbol: string, isActive: boolean): Promise<Currency> {
    const currency = await this.findBySymbolOrFail(symbol);
    currency.isActive = isActive;
    return this.currencies.save(currency);
  }

  /** 최소 sweep 금액을 바꾼다. amount 는 사람이 읽는 단위 (예: "10" = 10 USDT) */
  async setMinSweep(symbol: string, amount: string): Promise<Currency> {
    const currency = await this.findBySymbolOrFail(symbol);
    currency.minSweepAmount = toMinUnits(amount, currency.decimals);
    return this.currencies.save(currency);
  }

  /** 토큰 1개당 포인트를 바꾼다. 이미 쌓인 포인트는 바뀌지 않고 이후 입금부터 적용된다 */
  async setPointRatio(symbol: string, ratio: string): Promise<Currency> {
    const currency = await this.findBySymbolOrFail(symbol);
    currency.pointRatio = toPointRatio(ratio);
    return this.currencies.save(currency);
  }

  private async findBySymbolOrFail(symbol: string): Promise<Currency> {
    const currency = await this.currencies.findOneBy({
      chainId: this.chainId(),
      symbol: normalizeSymbol(symbol),
    });
    if (!currency) {
      throw new NotFoundException(`등록되지 않은 currency 입니다: ${symbol}`);
    }
    return currency;
  }

  private async save(
    input: Pick<Currency, 'symbol' | 'decimals' | 'address' | 'pointRatio' | 'minSweepAmount'>,
  ) {
    const chainId = this.chainId();
    const symbol = normalizeSymbol(input.symbol);
    const duplicate = await this.currencies.findOne({
      where: [
        { chainId, address: input.address },
        { chainId, symbol },
      ],
    });
    if (duplicate) {
      throw new ConflictException(
        `이미 등록된 currency 입니다: ${duplicate.symbol} (${duplicate.address})`,
      );
    }
    return this.currencies.save(this.currencies.create({ ...input, symbol, chainId }));
  }

  private chainId(): number {
    return this.config.get<number>('alchemy.chainId')!;
  }
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** 포인트 비율 검사. 0 보다 크고 소수 6자리까지 */
function toPointRatio(ratio: string): string {
  const value = Number(ratio);
  if (!/^\d+(\.\d{1,6})?$/.test(ratio.trim()) || value <= 0) {
    throw new Error(`포인트 비율이 올바르지 않습니다: ${ratio} (0 보다 큰 수, 소수 6자리까지)`);
  }
  return ratio.trim();
}

/** 사람이 읽는 금액("10.5")을 최소 단위 정수 문자열로 바꾼다 (USDT 6자리면 "10500000") */
function toMinUnits(amount: string, decimals: number): string {
  try {
    const value = parseUnits(amount.trim(), decimals);
    if (value < 0n) {
      throw new Error();
    }
    return value.toString();
  } catch {
    throw new Error(`금액이 올바르지 않습니다: ${amount} (0 이상, 소수점 ${decimals}자리까지)`);
  }
}
