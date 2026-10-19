import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatEther, TransactionReceipt } from 'ethers';
import { Command, CommandRunner } from 'nest-commander';

import { AlchemyService } from '../modules/alchemy/alchemy.service';
import { Sweep } from '../modules/sweeps/entities/sweep.entity';
import { formatSweepItem, readSweptItems } from '../modules/sweeps/sweep-result';
import { SweepsService } from '../modules/sweeps/sweeps.service';

/**
 * 사용법: npm run cli -- sweep-reconcile
 *
 * pending 으로 남은 sweep(결과를 기다리다 프로그램이 꺼진 경우 등)을 체인에서 확인해 정리한다.
 * 체인에 이미 일어난 일을 DB 에 옮겨 적기만 하고 돈은 움직이지 않으니, 확인 없이 바로 실행한다.
 *
 * - 성공 영수증이 있음              → success + sweep_items 저장
 * - 실패 영수증이 있음 (revert)      → failed
 * - 영수증 없음 + 같은 nonce 가 이미 다른 트랜잭션으로 쓰임 → failed (버려진 트랜잭션)
 * - 영수증 없음 + 아직 대기 중일 수 있음 → pending 그대로 (나중에 다시 실행)
 */
@Command({
  name: 'sweep-reconcile',
  description: 'pending 으로 남은 sweep 을 체인에서 확인해 success / failed 로 정리한다.',
})
export class SweepReconcileCommand extends CommandRunner {
  private readonly logger = new Logger(SweepReconcileCommand.name);

  constructor(
    private readonly alchemy: AlchemyService,
    private readonly sweeps: SweepsService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const chainId = this.config.get<number>('alchemy.chainId')!;
    const pending = await this.sweeps.findPending(chainId);
    if (pending.length === 0) {
      this.logger.log(`체인 ${chainId} 에 pending 인 sweep 이 없습니다.`);
      return;
    }

    this.logger.log(`pending sweep ${pending.length}건을 확인합니다.`);
    const counts = { success: 0, failed: 0, pending: 0 };
    for (const sweep of pending) {
      const result = await this.reconcile(sweep);
      counts[result]++;
    }
    this.logger.log(
      `정리 끝: success ${counts.success}, failed ${counts.failed}, 아직 pending ${counts.pending}`,
    );
  }

  /** sweep 한 건을 체인과 맞춘다. 처리 후 상태를 돌려준다 */
  private async reconcile(sweep: Sweep): Promise<'success' | 'failed' | 'pending'> {
    const tag = `[${sweep.txHash}]`;

    // 1. 블록에 포함됐는지 (영수증이 있는지)
    const receipt = await this.alchemy.getTransactionReceipt(sweep.txHash);
    if (receipt) {
      return this.applyReceipt(sweep, receipt);
    }

    // 2. 영수증이 없는데 같은 nonce 가 이미 쓰였다면 이 트랜잭션은 영원히 포함될 수 없다
    if (sweep.nonce !== null) {
      const confirmedNonce = await this.alchemy.getConfirmedNonce(sweep.executorAddress);
      if (confirmedNonce > sweep.nonce) {
        // 1 과 nonce 확인 사이에 이 트랜잭션이 포함됐을 수 있으니 영수증을 한 번 더 본다
        const lateReceipt = await this.alchemy.getTransactionReceipt(sweep.txHash);
        if (lateReceipt) {
          return this.applyReceipt(sweep, lateReceipt);
        }
        await this.sweeps.markFailed(
          sweep.id,
          `dropped: nonce ${sweep.nonce} 를 다른 트랜잭션이 사용`,
        );
        this.logger.warn(`${tag} 버려진 트랜잭션(nonce ${sweep.nonce} 이미 사용됨) → failed`);
        return 'failed';
      }
    }

    // 3. 아직 대기 중이거나 노드가 아직 모르는 상태. 판단하지 않고 그대로 둔다
    const tx = await this.alchemy.getTransaction(sweep.txHash);
    this.logger.log(
      `${tag} 아직 블록에 포함되지 않았습니다 (${tx ? '대기열에 있음' : '노드가 모름'}). pending 유지`,
    );
    return 'pending';
  }

  /** 영수증으로 결과를 확정한다: 성공이면 success + sweep_items, revert 면 failed */
  private async applyReceipt(
    sweep: Sweep,
    receipt: TransactionReceipt,
  ): Promise<'success' | 'failed' | 'pending'> {
    const tag = `[${sweep.txHash}]`;
    if (receipt.status !== 1) {
      await this.sweeps.markFailed(sweep.id, `reverted (block ${receipt.blockNumber})`);
      this.logger.warn(`${tag} 실패(revert) → failed`);
      return 'failed';
    }
    if (!sweep.plan) {
      this.logger.warn(
        `${tag} 성공했지만 대상 목록(plan)이 없어 결과를 복원할 수 없습니다. 직접 확인하세요.`,
      );
      return 'pending';
    }

    const items = readSweptItems(receipt, sweep.factoryAddress, sweep.plan);
    const updated = await this.sweeps.markSuccess(sweep.id, {
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      feeWei: receipt.fee,
      items,
    });
    this.logger.log(
      [
        `${tag} 성공 → success${updated ? '' : ' (이미 다른 곳에서 처리됨)'}`,
        `block ${receipt.blockNumber}, 가스비 ${formatEther(receipt.fee)}`,
        ...items.map((item) => `  ${formatSweepItem(item)}`),
      ].join('\n'),
    );
    return 'success';
  }
}
