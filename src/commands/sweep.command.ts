import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Contract,
  ContractTransactionReceipt,
  ContractTransactionResponse,
  formatEther,
  formatUnits,
  isError,
} from 'ethers';
import { Command, CommandRunner, Option } from 'nest-commander';

import { confirm } from '../common/cli/confirm';
import { errorMessage } from '../common/errors';
import { AlchemyService } from '../modules/alchemy/alchemy.service';
import { CurrenciesService } from '../modules/currencies/currencies.service';
import { Currency } from '../modules/currencies/entities/currency.entity';
import { DepositAddressesService } from '../modules/deposit-addresses/deposit-addresses.service';
import { DepositAddress } from '../modules/deposit-addresses/entities/deposit-address.entity';
import { ERC20_ABI, SWEEP_FACTORY_ABI } from '../modules/sweep-contracts/sweep-factory';
import { formatSweepItem, readSweptItems } from '../modules/sweeps/sweep-result';
import { SweepsService } from '../modules/sweeps/sweeps.service';

interface SweepOptions {
  currency?: string[];
}

/** sweep 할 입금 주소 하나와 currency 별 잔액 (balances[i] 는 currencies[i] 의 잔액) */
interface SweepTarget {
  depositAddress: DepositAddress;
  deployed: boolean;
  balances: bigint[];
}

/**
 * 사용법: npm run cli -- sweep <유저 id...> [--currency <심볼>]...
 * 예)    npm run cli -- sweep <유저id1> <유저id2>            (등록된 currency 전체)
 *        npm run cli -- sweep <유저id1> -c USDT              (USDT 만)
 *
 * 유저들의 입금 주소(deposit_addresses) 잔액을 treasury 로 모은다.
 * 입금 주소가 발급된 유저만, currencies 에 등록·활성화된 자산만 다룬다.
 *
 * 1. 입금 주소별 잔액, 예상 가스비를 보여준다 (잔액이 없거나 최소 sweep 금액 미만인 주소/자산은 뺀다)
 * 2. "yes" 를 입력해야 실제로 실행한다
 * 3. 트랜잭션 한 번으로 처리한다. 아직 배포 안 된 입금 주소는 이때 Clone 이 배포된다
 * 4. 결과를 sweeps(트랜잭션) / sweep_items(옮긴 금액) 테이블에 저장한다
 *
 * .env 의 DEPLOYER_PRIVATE_KEY(= 컨트랙트 owner)로 실행한다.
 */
@Command({
  name: 'sweep',
  arguments: '<userIds...>',
  description:
    '유저들의 입금 주소 잔액을 treasury 로 모은다. 예) sweep <유저id...> [-c USDT -c USDC]',
})
export class SweepCommand extends CommandRunner {
  private readonly logger = new Logger(SweepCommand.name);

  constructor(
    private readonly alchemy: AlchemyService,
    private readonly depositAddresses: DepositAddressesService,
    private readonly currencies: CurrenciesService,
    private readonly sweeps: SweepsService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run(userIds: string[], options: SweepOptions): Promise<void> {
    // 1. 준비물 확인
    const privateKey = this.config.get<string>('deploy.privateKey');
    if (!privateKey) {
      throw new Error('.env 의 DEPLOYER_PRIVATE_KEY(컨트랙트 owner 키)가 비어 있습니다.');
    }

    const chainId = this.config.get<number>('alchemy.chainId')!;
    const nodeChainId = await this.alchemy.getNodeChainId();
    if (nodeChainId !== chainId) {
      throw new Error(`노드의 체인 ID(${nodeChainId})가 .env 의 CHAIN_ID(${chainId})와 다릅니다.`);
    }

    const sweepContract = await this.depositAddresses.currentFactory();
    const wallet = this.alchemy.createWallet(privateKey);
    const factory = new Contract(sweepContract.factoryAddress, SWEEP_FACTORY_ABI, wallet);
    const [owner, treasury] = (await Promise.all([factory.owner(), factory.treasury()])) as [
      string,
      string,
    ];
    if (owner !== wallet.address) {
      throw new Error(
        `DEPLOYER_PRIVATE_KEY 의 주소(${wallet.address})가 컨트랙트 owner(${owner})가 아닙니다.`,
      );
    }

    // 2. 대상: 등록된 currency, 발급된 입금 주소만 (아니면 여기서 에러)
    const currencies = await this.currencies.findActive(options.currency);
    const depositAddresses = await this.depositAddresses.findByUserIds([...new Set(userIds)]);
    const deposits = await Promise.all(
      depositAddresses.map((d) => this.loadTarget(d, factory, currencies)),
    );

    // 최소 sweep 금액 이상인 잔액이 하나라도 있는 입금 주소만, 그 주소들에서 그런 자산만 모은다 (가스 절약)
    const targets = deposits.filter((d) =>
      d.balances.some((balance, i) => isSweepable(balance, currencies[i])),
    );
    const targetCurrencies = currencies.filter((c, i) =>
      targets.some((d) => isSweepable(d.balances[i], c)),
    );

    const lines = [
      '',
      '======================== sweep ========================',
      `체인 ID   : ${chainId}`,
      `factory   : ${sweepContract.factoryAddress}`,
      `treasury  : ${treasury} (여기로 모인다)`,
      `실행 계정 : ${owner} (가스비를 낸다)`,
      `자산      : ${currencies
        .map((c) => `${c.symbol}(최소 ${formatUnits(c.minSweepAmount, c.decimals)})`)
        .join(', ')}`,
      '',
    ];
    for (const d of deposits) {
      const balances = currencies.map((c, i) => {
        const balance = d.balances[i];
        const belowMin = balance > 0n && !isSweepable(balance, c);
        return `${formatUnits(balance, c.decimals)} ${c.symbol}${belowMin ? '(최소 미달)' : ''}`;
      });
      const isTarget = targets.includes(d);
      // 아직 Clone 이 없는 주소는 sweep 대상일 때만 이번에 배포된다
      const status = d.deployed ? '' : isTarget ? '(미배포 → 이번에 배포됨)' : '(미배포)';
      lines.push(
        `${d.depositAddress.user.email} ${d.depositAddress.userId}`,
        `    ${d.depositAddress.address} ${status}`.trimEnd(),
        `    ${balances.join(' / ')}${isTarget ? '' : '  → sweep 할 잔액 없음, 제외'}`,
      );
    }

    if (targets.length === 0) {
      lines.push('', '모을 잔액이 없습니다.');
      this.logger.log(lines.join('\n'));
      return;
    }

    // 3. 예상 가스비
    const salts = targets.map((d) => d.depositAddress.salt);
    const tokens = targetCurrencies.map((c) => c.address);
    const [gasLimit, feeData, ownerBalance] = await Promise.all([
      factory.sweep.estimateGas(salts, tokens),
      wallet.provider!.getFeeData(),
      this.alchemy.getBalance(owner),
    ]);
    const maxCost = gasLimit * (feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n);

    lines.push(
      '',
      `대상      : 입금 주소 ${targets.length}개, 자산 ${targetCurrencies.map((c) => c.symbol).join(', ')}`,
      `예상 가스 : ${gasLimit} (최대 ${formatEther(maxCost)}, 실행 계정 잔액 ${formatEther(ownerBalance)})`,
      '=======================================================',
    );
    this.logger.log(lines.join('\n'));

    if (ownerBalance < maxCost) {
      throw new Error('실행 계정의 잔액이 최대 예상 가스비보다 적습니다.');
    }

    // 4. 한 번 더 확인받는다
    if (!(await confirm('정말 sweep 하시겠습니까? 진행하려면 yes 를 입력하세요: '))) {
      this.logger.log('sweep 을 취소했습니다.');
      return;
    }

    // 5. 트랜잭션을 보내고, 바로 pending 으로 DB 에 남긴다 (기다리는 중에 꺼져도 tx hash 가 남도록)
    const tx = (await factory.sweep(salts, tokens)) as ContractTransactionResponse;
    this.logger.log(`트랜잭션 전송: ${tx.hash} (블록에 포함될 때까지 기다립니다...)`);
    const sweep = await this.sweeps.createPending({
      chainId,
      factoryAddress: sweepContract.factoryAddress,
      treasuryAddress: treasury,
      executorAddress: owner,
      txHash: tx.hash,
      nonce: tx.nonce,
      // pending 으로 남았을 때 sweep-reconcile 이 결과를 복원할 수 있도록 대상 목록을 같이 저장한다
      plan: {
        wallets: targets.map(({ depositAddress: d }) => ({
          label: d.userId,
          salt: d.salt,
          address: d.address,
        })),
        assets: targetCurrencies.map(({ address, symbol, decimals }) => ({
          address,
          symbol,
          decimals,
        })),
      },
    });

    // 6. 블록에 포함될 때까지 기다린다.
    //    체인에서 실제로 실패(revert)한 경우만 failed 로 남긴다. 네트워크 오류 등으로 기다리지 못한 경우는
    //    트랜잭션이 나중에 성공할 수도 있으니 pending 으로 두고 sweep-reconcile 이 체인에서 확인하게 한다.
    let receipt: ContractTransactionReceipt | null;
    try {
      receipt = await tx.wait();
    } catch (err) {
      if (isError(err, 'CALL_EXCEPTION') && err.receipt?.status === 0) {
        await this.sweeps.markFailed(sweep.id, `reverted (block ${err.receipt.blockNumber})`);
        throw new Error(`sweep 트랜잭션이 실패(revert)했습니다: ${tx.hash}`);
      }
      throw new Error(
        `결과를 확인하지 못했습니다: ${tx.hash} (${errorMessage(err)}). ` +
          'DB 에는 pending 으로 남아 있으니 sweep-reconcile 로 확인하세요.',
      );
    }
    if (!receipt) {
      throw new Error(
        `트랜잭션 영수증을 받지 못했습니다: ${tx.hash} (DB 에는 pending 으로 남아 있습니다)`,
      );
    }

    // 7. 컨트랙트 이벤트에서 실제로 옮긴 금액을 읽어 DB 에 저장한다
    const items = readSweptItems(receipt, sweepContract.factoryAddress, sweep.plan!);
    const updated = await this.sweeps.markSuccess(sweep.id, {
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      feeWei: receipt.fee,
      items,
    });

    const result = [
      `sweep 완료 → DB 저장 (sweeps.id ${sweep.id})` +
        (updated ? '' : ' — 이미 sweep-reconcile 에서 저장됨'),
      `block ${receipt.blockNumber}, 가스 ${receipt.gasUsed}, 가스비 ${formatEther(receipt.fee)}`,
      ...items.map((item) => `  ${formatSweepItem(item)}`),
    ];
    this.logger.log(result.join('\n'));
  }

  /**
   * 입금 주소의 배포 여부와 currency 별 잔액을 읽는다.
   * DB 에 저장된 주소가 컨트랙트가 계산한 주소와 다르면 멈춘다 (엉뚱한 주소를 보여주고 sweep 하지 않도록).
   */
  private async loadTarget(
    depositAddress: DepositAddress,
    factory: Contract,
    currencies: Currency[],
  ): Promise<SweepTarget> {
    const { address, salt } = depositAddress;
    const predicted = (await factory.predictAddress(salt)) as string;
    if (predicted !== address) {
      throw new Error(
        `유저 ${depositAddress.userId} 의 DB 입금 주소(${address})가 컨트랙트 계산(${predicted})과 다릅니다.`,
      );
    }

    const [code, ...balances] = await Promise.all([
      this.alchemy.getCode(address),
      ...currencies.map((c) =>
        this.alchemy.call<bigint>(c.address, ERC20_ABI, 'balanceOf', [address]),
      ),
    ]);
    return { depositAddress, deployed: code !== '0x', balances: balances as bigint[] };
  }

  @Option({
    flags: '-c, --currency <symbol>',
    description: '모을 자산 심볼 (currencies 에 등록된 것). 여러 개면 반복. 생략하면 전체',
  })
  parseCurrency(value: string, previous: string[] = []): string[] {
    return [...previous, value];
  }
}

/** 잔액이 있고 최소 sweep 금액 이상이면 sweep 대상 */
function isSweepable(balance: bigint, currency: Currency): boolean {
  return balance > 0n && balance >= BigInt(currency.minSweepAmount);
}
