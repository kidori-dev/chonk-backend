import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Contract,
  ContractFactory,
  formatEther,
  formatUnits,
  getAddress,
  NonceManager,
  parseUnits,
} from 'ethers';
import { existsSync, readFileSync } from 'fs';
import { Command, CommandRunner, Option } from 'nest-commander';
import { join } from 'path';

import { confirm } from '../common/cli/confirm';
import { AlchemyService } from '../modules/alchemy/alchemy.service';

interface Erc20MintOptions {
  token?: string;
  name: string;
  symbol: string;
  decimals: number;
}

/** forge build 결과물. src/commands 와 dist/commands 어디서 실행해도 같은 위치를 가리킨다 */
const ARTIFACT_PATH = join(
  __dirname,
  '..',
  '..',
  'contracts',
  'out',
  'MintableToken.sol',
  'MintableToken.json',
);

/**
 * 사용법: npm run cli -- erc20-mint <수량> [받을 주소] [-t <토큰 주소>] [--name ..] [--symbol ..] [--decimals ..]
 * 예)    npm run cli -- erc20-mint 1000                          (새 토큰 CUSD 배포 + 배포 계정에 1000개)
 *        npm run cli -- erc20-mint 100 0x입금주소 -t 0x토큰주소    (이미 배포한 토큰을 입금 주소로 100개)
 *
 * 테스트용 ERC-20(contracts/src/MintableToken.sol)을 찍어낸다. 배포 계정 키(DEPLOYER_PRIVATE_KEY)로 보낸다.
 * - -t 가 없으면 MintableToken 을 새로 배포하고(owner = 배포 계정) 찍는다. 배포한 주소는 currency-add 로 등록한다
 * - -t 가 있으면 그 토큰의 mint 를 호출한다 (배포 계정이 owner 인 MintableToken 이어야 한다)
 * - 받을 주소를 생략하면 배포 계정 주소로 찍는다
 * 보내기 전에 정보를 보여주고 "yes" 를 입력해야 진행한다.
 */
@Command({
  name: 'erc20-mint',
  arguments: '<amount> [to]',
  description:
    '테스트용 ERC-20 을 찍는다 (-t 없으면 새로 배포). 예) erc20-mint 100 0x받을주소 -t 0x토큰주소',
})
export class Erc20MintCommand extends CommandRunner {
  private readonly logger = new Logger(Erc20MintCommand.name);

  constructor(
    private readonly alchemy: AlchemyService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async run([amount, to]: string[], options: Erc20MintOptions): Promise<void> {
    // 1. 준비물 확인
    const privateKey = this.config.get<string>('deploy.privateKey');
    if (!privateKey) {
      throw new Error('.env 의 DEPLOYER_PRIVATE_KEY 가 비어 있습니다.');
    }
    const artifact = loadArtifact();
    const wallet = this.alchemy.createWallet(privateKey);
    // 배포 직후 mint 를 보내면 노드가 아직 pending nonce 를 모를 수 있어서, nonce 를 직접 세며 보낸다
    const signer = new NonceManager(wallet);
    const recipient = to ? toAddress(to, '받을 주소') : wallet.address;

    const chainId = this.config.get<number>('alchemy.chainId')!;
    const nodeChainId = await this.alchemy.getNodeChainId();
    if (nodeChainId !== chainId) {
      throw new Error(`노드의 체인 ID(${nodeChainId})가 .env 의 CHAIN_ID(${chainId})와 다릅니다.`);
    }

    // 2. 찍을 토큰 정보. 기존 토큰이면 체인에서 읽고 owner 가 배포 계정인지 확인한다
    let token: Contract | null = null;
    let { name, symbol, decimals } = options;
    if (options.token) {
      token = new Contract(toAddress(options.token, '토큰 주소'), artifact.abi, signer);
      const owner = getAddress((await token.getFunction('owner')()) as string);
      if (owner !== wallet.address) {
        throw new Error(
          `토큰의 owner(${owner})가 배포 계정(${wallet.address})이 아니라 찍을 수 없습니다.`,
        );
      }
      [name, symbol, decimals] = await Promise.all([
        token.getFunction('name')() as Promise<string>,
        token.getFunction('symbol')() as Promise<string>,
        token.getFunction('decimals')().then(Number),
      ]);
    }
    const units = parseUnits(amount, decimals);

    this.logger.log(
      [
        '',
        '==================== ERC-20 mint ====================',
        `체인 ID   : ${chainId}`,
        `배포 계정 : ${wallet.address} (ETH 잔액 ${formatEther(await wallet.provider!.getBalance(wallet.address))})`,
        `토큰      : ${token ? await token.getAddress() : '(새로 배포)'} ${name} / ${symbol} / decimals ${decimals}`,
        `받을 주소 : ${recipient}`,
        `수량      : ${formatUnits(units, decimals)} ${symbol}`,
        '=====================================================',
      ].join('\n'),
    );
    if (!(await confirm('진행하려면 yes 를 입력하세요: '))) {
      this.logger.log('취소했습니다.');
      return;
    }

    // 3. 토큰이 없으면 배포한다
    if (!token) {
      const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
      const deployed = await factory.deploy(name, symbol, decimals, wallet.address);
      this.logger.log(`배포 트랜잭션: ${deployed.deploymentTransaction()!.hash} (기다리는 중...)`);
      await deployed.waitForDeployment();
      token = deployed as Contract;
      this.logger.log(`토큰 배포 완료: ${await token.getAddress()}`);
    }

    // 4. 찍는다
    const tx = (await token.getFunction('mint')(recipient, units)) as {
      hash: string;
      wait: () => Promise<{ blockNumber: number } | null>;
    };
    this.logger.log(`mint 트랜잭션: ${tx.hash} (기다리는 중...)`);
    const receipt = await tx.wait();

    const tokenAddress = await token.getAddress();
    this.logger.log(
      [
        `mint 완료 (block ${receipt?.blockNumber}): ${formatUnits(units, decimals)} ${symbol} → ${recipient}`,
        `토큰 주소: ${tokenAddress}`,
        `입금 감지에 쓰려면 등록: npm run cli -- currency-add ${tokenAddress}`,
      ].join('\n'),
    );
  }

  @Option({
    flags: '-t, --token <address>',
    description: '이미 배포한 MintableToken 주소. 생략하면 새로 배포한다',
  })
  parseToken(value: string): string {
    return value;
  }

  @Option({
    flags: '--name <name>',
    description: '새로 배포할 토큰 이름',
    defaultValue: 'Chonk Test USD',
  })
  parseName(value: string): string {
    return value;
  }

  @Option({
    flags: '--symbol <symbol>',
    description: '새로 배포할 토큰 심볼',
    defaultValue: 'CUSD',
  })
  parseSymbol(value: string): string {
    return value;
  }

  @Option({
    flags: '--decimals <decimals>',
    description: '새로 배포할 토큰 소수 자리수',
    defaultValue: 6,
  })
  parseDecimals(value: string): number {
    return parseInt(value, 10);
  }
}

/** 주소를 검사해 체크섬 형식으로 돌려준다 (대소문자가 섞였으면 체크섬까지 맞아야 한다) */
function toAddress(value: string, label: string): string {
  try {
    return getAddress(value);
  } catch {
    throw new Error(`${label}가 올바른 주소가 아닙니다: ${value}`);
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
