import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractFactory, formatEther, getAddress } from 'ethers';
import { existsSync, readFileSync } from 'fs';
import { Command, CommandRunner } from 'nest-commander';
import { join } from 'path';

import { confirm } from '../common/cli/confirm';
import { AlchemyService } from '../modules/alchemy/alchemy.service';
import { SweepContractsService } from '../modules/sweep-contracts/sweep-contracts.service';

/** forge build 결과물. src/commands 와 dist/commands 어디서 실행해도 같은 위치를 가리킨다 */
const ARTIFACT_PATH = join(
  __dirname,
  '..',
  '..',
  'contracts',
  'out',
  'SweepFactory.sol',
  'SweepFactory.json',
);

/**
 * 사용법: npm run cli -- sweep-contract-deploy
 *
 * SweepFactory 컨트랙트(contracts/src/SweepFactory.sol)를 배포하고 sweep_contracts 테이블에 저장한다.
 *
 * 1. 배포 정보(네트워크, 배포 계정, 잔액, 예상 비용, treasury)를 보여준다
 * 2. "yes" 를 입력해야 실제로 배포한다
 * 3. 배포가 끝나면 컨트랙트 정보를 sweep_contracts 테이블에 저장한다
 *
 * 필요한 것: contracts 폴더에서 forge build, .env 의 DEPLOYER_PRIVATE_KEY / SWEEP_TREASURY_ADDRESS
 */
@Command({
  name: 'sweep-contract-deploy',
  description:
    'SweepFactory 컨트랙트를 배포하고 sweep_contracts 테이블에 저장한다. 실행 전 확인을 받는다.',
})
export class SweepContractDeployCommand extends CommandRunner {
  private readonly logger = new Logger(SweepContractDeployCommand.name);

  constructor(
    private readonly alchemy: AlchemyService,
    private readonly sweepContracts: SweepContractsService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run(): Promise<void> {
    // 1. 준비물 확인
    const privateKey = this.config.get<string>('deploy.privateKey');
    if (!privateKey) {
      throw new Error('.env 의 DEPLOYER_PRIVATE_KEY 가 비어 있습니다.');
    }
    const treasury = toChecksumAddress(this.config.get<string>('deploy.treasuryAddress'));
    const artifact = loadArtifact();

    const wallet = this.alchemy.createWallet(privateKey);
    const owner = wallet.address;
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);

    // 2. 엉뚱한 체인에 배포하지 않도록 노드의 실제 체인 ID 를 .env 와 비교한다
    const chainId = this.config.get<number>('alchemy.chainId')!;
    const nodeChainId = await this.alchemy.getNodeChainId();
    if (nodeChainId !== chainId) {
      throw new Error(`노드의 체인 ID(${nodeChainId})가 .env 의 CHAIN_ID(${chainId})와 다릅니다.`);
    }

    // 3. 배포 정보와 예상 비용을 보여준다
    const deployTx = await factory.getDeployTransaction(owner, treasury);
    const [balance, feeData, gasLimit, existing] = await Promise.all([
      wallet.provider!.getBalance(owner),
      wallet.provider!.getFeeData(),
      wallet.estimateGas(deployTx),
      this.sweepContracts.findByChain(chainId),
    ]);
    const maxGasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
    const maxCost = gasLimit * maxGasPrice;

    const lines = [
      '',
      '==================== SweepFactory 배포 ====================',
      `체인 ID        : ${chainId}`,
      `배포 계정      : ${owner} (배포 후 컨트랙트 owner 가 된다)`,
      `잔액           : ${formatEther(balance)}`,
      `treasury       : ${treasury} (sweep 한 돈이 모이는 주소)`,
      `예상 가스      : ${gasLimit}`,
      `최대 예상 비용 : ${formatEther(maxCost)}`,
    ];
    if (existing.length > 0) {
      lines.push(
        '',
        `[주의] 이 체인에 이미 배포된 SweepFactory 가 ${existing.length}개 있습니다.`,
        `       가장 최근: ${existing[0].factoryAddress} (${existing[0].createdAt.toISOString()})`,
        '       새로 배포하면 입금 주소가 전부 달라집니다.',
      );
    }
    lines.push('===========================================================');
    this.logger.log(lines.join('\n'));

    if (balance < maxCost) {
      throw new Error('배포 계정의 잔액이 최대 예상 비용보다 적습니다.');
    }

    // 4. 한 번 더 확인받는다
    if (!(await confirm('정말 배포하시겠습니까? 진행하려면 yes 를 입력하세요: '))) {
      this.logger.log('배포를 취소했습니다.');
      return;
    }

    // 5. 배포하고 블록에 포함될 때까지 기다린다
    const contract = await factory.deploy(owner, treasury);
    const tx = contract.deploymentTransaction()!;
    this.logger.log(`트랜잭션 전송: ${tx.hash} (블록에 포함될 때까지 기다립니다...)`);
    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error(`트랜잭션 영수증을 받지 못했습니다: ${tx.hash}`);
    }

    const factoryAddress = await contract.getAddress();
    const implementationAddress = getAddress(await contract.getFunction('implementation')());
    const record = {
      chainId,
      factoryAddress,
      implementationAddress,
      ownerAddress: owner,
      treasuryAddress: treasury,
      deployTxHash: tx.hash,
      deployBlockNumber: receipt.blockNumber,
    };

    // 6. DB 에 저장한다. 실패해도 컨트랙트는 이미 배포됐으니, 수동 등록할 수 있게 정보를 남긴다
    try {
      await this.sweepContracts.save(record);
    } catch (err) {
      this.logger.error(
        `배포는 성공했지만 DB 저장에 실패했습니다. 아래 정보로 직접 등록하세요.\n${JSON.stringify(record, null, 2)}`,
      );
      throw err;
    }

    this.logger.log(
      [
        '배포 완료 → sweep_contracts 테이블에 저장했습니다.',
        `factory        : ${factoryAddress}`,
        `implementation : ${implementationAddress}`,
        `block          : ${receipt.blockNumber}`,
        `가스 사용      : ${receipt.gasUsed} (비용 ${formatEther(receipt.gasUsed * receipt.gasPrice)})`,
      ].join('\n'),
    );
  }
}

/**
 * treasury 주소를 검사해 체크섬 형식으로 돌려준다.
 * 대소문자가 섞인 주소는 체크섬까지 맞아야 통과한다 (주소 오타로 돈을 잃지 않게).
 */
function toChecksumAddress(address: string | undefined): string {
  if (!address) {
    throw new Error('.env 의 SWEEP_TREASURY_ADDRESS 가 비어 있습니다. (sweep 한 돈이 모일 주소)');
  }
  try {
    return getAddress(address);
  } catch {
    throw new Error(
      `.env 의 SWEEP_TREASURY_ADDRESS 가 올바른 주소가 아닙니다: ${address} ` +
        '(대소문자가 섞인 주소는 체크섬이 맞아야 합니다. 오타가 없는지 확인하세요)',
    );
  }
}

/** forge build 가 만든 JSON 에서 ABI 와 바이트코드를 꺼낸다 */
function loadArtifact(): { abi: object[]; bytecode: string } {
  if (!existsSync(ARTIFACT_PATH)) {
    throw new Error(
      `컴파일 결과가 없습니다. 먼저 npm run contract:build 를 실행하세요. (${ARTIFACT_PATH})`,
    );
  }
  const json = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as {
    abi: object[];
    bytecode: { object: string };
  };
  return { abi: json.abi, bytecode: json.bytecode.object };
}
