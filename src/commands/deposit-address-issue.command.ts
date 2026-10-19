import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { DepositAddressesService } from '../modules/deposit-addresses/deposit-addresses.service';

interface IssueOptions {
  all?: boolean;
}

/**
 * 사용법: npm run cli -- deposit-address-issue <유저 id...>
 *         npm run cli -- deposit-address-issue --all   (아직 주소가 없는 유저 전부)
 *
 * 유저에게 입금 주소를 발급해 deposit_addresses 테이블에 저장한다.
 * 주소 계산만 하고 체인에 트랜잭션을 보내지 않으니 가스비가 들지 않는다.
 * 이미 발급된 유저는 기존 주소를 그대로 보여준다.
 */
@Command({
  name: 'deposit-address-issue',
  arguments: '[userIds...]',
  description:
    '유저에게 입금 주소를 발급한다 (가스비 없음). 예) deposit-address-issue <유저id> / --all',
})
export class DepositAddressIssueCommand extends CommandRunner {
  private readonly logger = new Logger(DepositAddressIssueCommand.name);

  constructor(private readonly depositAddresses: DepositAddressesService) {
    super();
  }

  async run(userIds: string[], options: IssueOptions): Promise<void> {
    const targets = options.all ? await this.depositAddresses.findUserIdsWithoutAddress() : userIds;
    if (!options.all && targets.length === 0) {
      throw new Error('유저 id 를 입력하거나 --all 을 붙이세요.');
    }
    if (targets.length === 0) {
      this.logger.log('입금 주소가 없는 유저가 없습니다.');
      return;
    }

    const results = await this.depositAddresses.issue(targets);
    const created = results.filter((r) => r.created).length;
    this.logger.log(
      [
        `입금 주소 ${results.length}건 (새로 발급 ${created}, 기존 ${results.length - created})`,
        ...results.map(
          (r) =>
            `  ${r.depositAddress.userId} → ${r.depositAddress.address}` +
            (r.created ? ' (새로 발급)' : ' (기존)'),
        ),
      ].join('\n'),
    );
  }

  @Option({ flags: '-a, --all', description: '아직 입금 주소가 없는 유저 전부에게 발급한다' })
  parseAll(): boolean {
    return true;
  }
}
