import { Logger } from '@nestjs/common';
import { Wallet } from 'ethers';
import { Command, CommandRunner } from 'nest-commander';

/**
 * 사용법: npm run cli -- wallet-create
 *
 * 새 이더리움 계정(주소 / 프라이빗 키 / 퍼블릭 키)을 무작위로 만들어 콘솔에 보여준다.
 * 체인이나 DB 에는 아무것도 보내지 않는다 (RPC 호출 없음).
 * 예) DEPLOYER_PRIVATE_KEY 에 넣을 배포 계정, SWEEP_TREASURY_ADDRESS 로 쓸 주소를 만들 때
 * 프라이빗 키는 다시 볼 수 없으니 바로 안전한 곳에 옮겨 두고, 터미널 기록에 남지 않게 주의한다.
 */
@Command({
  name: 'wallet-create',
  description: '새 이더리움 계정(주소 / 프라이빗 키 / 퍼블릭 키)을 만들어 보여준다',
})
export class WalletCreateCommand extends CommandRunner {
  private readonly logger = new Logger(WalletCreateCommand.name);

  async run(): Promise<void> {
    const wallet = Wallet.createRandom();
    this.logger.log(
      [
        '',
        '==================== 새 이더리움 계정 ====================',
        `주소        : ${wallet.address}`,
        `프라이빗 키 : ${wallet.privateKey}`,
        `퍼블릭 키   : ${wallet.publicKey}`,
        '==========================================================',
        '프라이빗 키는 다시 볼 수 없습니다. 안전한 곳에 옮겨 두고 절대 공유하지 마세요.',
      ].join('\n'),
    );
  }
}
