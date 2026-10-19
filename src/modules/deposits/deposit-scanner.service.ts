import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { formatUnits, getAddress, id, Log } from 'ethers';
import { DataSource, In, Repository } from 'typeorm';

import { AlchemyService } from '../alchemy/alchemy.service';
import { BlockEntity } from '../blocks/entities/block.entity';
import { CurrenciesService } from '../currencies/currencies.service';
import { Currency } from '../currencies/entities/currency.entity';
import { DepositAddressesService } from '../deposit-addresses/deposit-addresses.service';
import { DepositAddress } from '../deposit-addresses/entities/deposit-address.entity';
import {
  DepositInput,
  RecordedDeposit,
  RecordResult,
  TransactionsService,
} from '../transactions/transactions.service';

/** keccak256("Transfer(address,address,uint256)") — ERC-20 Transfer 이벤트의 topic0 */
const TRANSFER_TOPIC = id('Transfer(address,address,uint256)');

/**
 * 무엇을 입금으로 볼지. 주소 비교를 빠르게 하려고 소문자 주소를 키로 쓴다.
 */
export interface WatchList {
  /** 등록된 토큰 (비활성 포함. 비활성은 sweep 만 안 할 뿐 입금은 계속 기록한다) */
  tokens: Map<string, Currency>;
  /** 이 체인에 발급된 입금 주소 전체 */
  depositAddresses: Map<string, DepositAddress>;
}

/** 블록 구간 하나를 확인한 결과 */
export interface LogScanResult extends RecordResult {
  fromBlock: number;
  toBlock: number;
  /** 이번에 쓴 감시 대상 (로그 출력용) */
  watch: WatchList;
}

/**
 * 토큰 입금 감지.
 *
 * 1. status = finalized 이고 is_scanned = false 인 블록(입금 확인 대기)을 모은다
 * 2. eth_getLogs 한 번으로 그 구간의 등록된 토큰 Transfer 로그를 받는다
 * 3. 받는 주소(to)가 입금 주소인 로그만 transactions 에 저장하고 유저 포인트를 올린다
 *    (이미 있는 tx 는 건너뛴다 → 같은 구간을 다시 확인해도 이중 입금이 되지 않는다)
 * 4. 그 구간의 블록을 is_scanned = true 로 바꾼다 (3 과 한 DB 트랜잭션)
 */
@Injectable()
export class DepositScannerService {
  constructor(
    private readonly alchemy: AlchemyService,
    private readonly currencies: CurrenciesService,
    private readonly depositAddresses: DepositAddressesService,
    private readonly transactions: TransactionsService,
    private readonly config: ConfigService,
    @InjectRepository(BlockEntity)
    private readonly blocks: Repository<BlockEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** DB 에서 감시 대상(토큰, 입금 주소)을 읽는다. 구간을 확인할 때마다 새로 읽어서 새 등록을 반영한다 */
  private async loadWatchList(): Promise<WatchList> {
    const [currencies, depositAddresses] = await Promise.all([
      this.currencies.findAll(),
      this.depositAddresses.findAllOnChain(),
    ]);
    return {
      tokens: new Map(currencies.map((c) => [c.address.toLowerCase(), c])),
      depositAddresses: new Map(depositAddresses.map((d) => [d.address.toLowerCase(), d])),
    };
  }

  /**
   * finalized 블록이 batchSize 개 이상 쌓였으면, 가장 오래된 것부터 batchSize 개
   * (번호가 이어지는 구간만)를 eth_getLogs 한 번으로 확인하고 is_scanned = true 로 바꾼다.
   * 덜 쌓였거나, 등록된 토큰 / 입금 주소가 아직 없으면 null (확인하지 않고 기다린다).
   *
   * finalized 블록은 되돌려지지 않으므로, 여기서 적립한 포인트가 reorg 로 무효가 되는 일은 없다.
   */
  async scanLogs(batchSize: number): Promise<LogScanResult | null> {
    const chainId = this.config.get<number>('alchemy.chainId')!;
    const ready = { chainId, status: 'finalized' as const, isScanned: false };
    if ((await this.blocks.countBy(ready)) < batchSize) {
      return null;
    }

    const pending = await this.blocks.find({
      where: ready,
      order: { number: 'ASC' },
      take: batchSize,
    });
    // 번호가 이어지는 앞부분만 한 구간으로 본다 (중간에 빠진 블록이 있으면 거기서 끊는다)
    const range = [pending[0]];
    for (const block of pending.slice(1)) {
      if (block.number !== range[range.length - 1].number + 1) {
        break;
      }
      range.push(block);
    }

    // 등록된 토큰이나 입금 주소가 없으면 확인하지 않고 기다린다.
    // (확인한 것으로 처리해버리면 나중에 등록해도 그 블록들의 입금을 다시 볼 수 없다)
    const watch = await this.loadWatchList();
    if (watch.tokens.size === 0 || watch.depositAddresses.size === 0) {
      return null;
    }
    const deposits = await this.findDeposits(range, watch);

    const result = await this.dataSource.transaction(async (manager) => {
      const recorded = await this.transactions.recordDeposits(manager, deposits);
      await manager.update(
        BlockEntity,
        { chainId, number: In(range.map((b) => b.number)) },
        { isScanned: true },
      );
      return recorded;
    });

    return {
      fromBlock: range[0].number,
      toBlock: range[range.length - 1].number,
      watch,
      ...result,
    };
  }

  /** 입금 1건을 로그 한 줄로. 예) alice@x.com +100.0 USDT (+100.0 포인트) → 0x47F7... (block 123, tx 0x12...) */
  describe({ transaction: tx, points }: RecordedDeposit, watch: WatchList): string {
    const owner = watch.depositAddresses.get(tx.address.toLowerCase());
    const currency = [...watch.tokens.values()].find((c) => c.id === tx.currencyId)!;
    return (
      `${owner?.user.email ?? tx.userId} +${formatUnits(tx.amount, currency.decimals)} ${currency.symbol} ` +
      `(+${points} 포인트) → ${tx.address} (block ${tx.blockNumber}, tx ${tx.txHash})`
    );
  }

  /** 블록 구간의 등록된 토큰 Transfer 로그 중 입금 주소로 들어온 것 (eth_getLogs 1회) */
  private async findDeposits(
    range: BlockEntity[],
    watch: WatchList,
  ): Promise<{ deposit: DepositInput; currency: Currency }[]> {
    const blocksByNumber = new Map(range.map((b) => [b.number, b]));
    const logs = await this.alchemy.getLogs({
      fromBlock: range[0].number,
      toBlock: range[range.length - 1].number,
      address: [...watch.tokens.values()].map((c) => c.address),
      topics: [TRANSFER_TOPIC],
    });

    return logs.flatMap((log) => {
      // 로그가 우리가 저장한 블록과 같은 블록에서 나온 것인지 확인한다 (다르면 reorg)
      const block = blocksByNumber.get(log.blockNumber);
      if (!block || block.hash !== log.blockHash) {
        throw new Error(
          `reorg 감지: #${log.blockNumber} 로그의 blockHash(${log.blockHash})가 ` +
            `저장된 블록 hash(${block?.hash ?? '없음'})와 다릅니다.`,
        );
      }

      const transfer = parseTransfer(log);
      const depositAddress = transfer && watch.depositAddresses.get(transfer.to);
      if (!transfer || !depositAddress || transfer.amount === 0n) {
        return [];
      }

      const currency = watch.tokens.get(log.address.toLowerCase())!;
      const deposit: DepositInput = {
        chainId: this.config.get<number>('alchemy.chainId')!,
        userId: depositAddress.userId,
        currencyId: currency.id,
        address: depositAddress.address,
        fromAddress: getAddress(transfer.from),
        amount: transfer.amount.toString(),
        txHash: log.transactionHash,
        logIndex: log.index,
        blockNumber: block.number,
        blockHash: block.hash,
        blockTime: block.blockTime,
      };
      return [{ deposit, currency }];
    });
  }
}

/**
 * ERC-20 Transfer 로그를 읽는다. 주소는 소문자.
 * topic 이 3개(이벤트 이름, from, to)가 아니면 ERC-20 Transfer 가 아니므로 무시한다 (ERC-721 등)
 */
function parseTransfer(log: Log): { from: string; to: string; amount: bigint } | null {
  if (log.topics.length !== 3 || log.data.length !== 66) {
    return null;
  }
  return {
    from: `0x${log.topics[1].slice(26)}`.toLowerCase(),
    to: `0x${log.topics[2].slice(26)}`.toLowerCase(),
    amount: BigInt(log.data),
  };
}
