import { formatUnits, Interface, TransactionReceipt } from 'ethers';

import { SWEEP_FACTORY_ABI } from '../sweep-contracts/sweep-factory';
import { SweepPlan } from './entities/sweep.entity';
import { SweepItemInput } from './sweeps.service';

const factoryInterface = new Interface(SWEEP_FACTORY_ABI);

/**
 * sweep 트랜잭션 영수증의 이벤트를 sweep_items 행으로 바꾼다.
 * - Swept: 실제로 옮긴 금액 (입금 주소, 자산, 수량)
 * - WalletDeployed: 이번에 Clone 이 새로 배포된 입금 주소
 *
 * sweep 커맨드(바로 결과를 받을 때)와 sweep-reconcile(나중에 정리할 때)이 같이 쓴다.
 */
export function readSweptItems(
  receipt: TransactionReceipt,
  factoryAddress: string,
  plan: SweepPlan,
): SweepItemInput[] {
  const events = receipt.logs
    .filter((log) => log.address === factoryAddress)
    .map((log) => factoryInterface.parseLog(log))
    .filter((event) => event !== null);

  const deployedWallets = new Set(
    events.filter((e) => e.name === 'WalletDeployed').map((e) => e.args.wallet as string),
  );

  return events
    .filter((e) => e.name === 'Swept')
    .map((e) => {
      const walletAddress = e.args.wallet as string;
      const wallet = plan.wallets.find((w) => w.address === walletAddress)!;
      const asset = plan.assets.find((a) => a.address === e.args.token)!;
      return {
        label: wallet.label,
        salt: wallet.salt,
        walletAddress,
        walletDeployed: deployedWallets.has(walletAddress),
        tokenAddress: asset.address,
        tokenSymbol: asset.symbol,
        tokenDecimals: asset.decimals,
        amount: (e.args.amount as bigint).toString(),
      };
    });
}

/** sweep_items 한 건을 로그 한 줄로. 예) user-1 0x47F7... (배포됨) → 100.0 USDT */
export function formatSweepItem(item: SweepItemInput): string {
  return (
    `${item.label} ${item.walletAddress}${item.walletDeployed ? ' (배포됨)' : ''}` +
    ` → ${formatUnits(item.amount, item.tokenDecimals)} ${item.tokenSymbol}`
  );
}
