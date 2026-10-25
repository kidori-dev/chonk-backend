import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Block,
  FetchRequest,
  Filter,
  FilterByBlockHash,
  Interface,
  InterfaceAbi,
  JsonRpcProvider,
  Log,
  Network,
  TransactionReceipt,
  TransactionResponse,
  Wallet,
} from 'ethers';
import WebSocket from 'ws';

import { errorMessage } from '../../common/errors';

/**
 * Multicall3: 여러 view 호출을 한 번에 묶어주는 공용 컨트랙트.
 * 이더리움 메인넷, Sepolia 등 대부분의 EVM 체인에 이 주소로 이미 배포되어 있다.
 */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
export const MULTICALL3_ABI = [
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])',
];
const MULTICALL_CHUNK_SIZE = 500;

// 웹소켓이 끊기면 이만큼 기다렸다가 다시 연결한다
const WS_RECONNECT_MS = 5000;
// 이 간격으로 ping 을 보내고, 다음 ping 때까지 pong 이 없으면 죽은 연결로 보고 끊는다
const WS_PING_INTERVAL_MS = 30000;

export interface MulticallCall {
  target: string;
  callData: string;
}

export interface MulticallResult {
  success: boolean;
  returnData: string;
}

/**
 * Alchemy 노드에 블록 정보를 물어보는 서비스.
 * 커맨드들은 RPC 를 직접 다루지 않고 이 서비스만 쓴다.
 *
 * 메인 키로 먼저 요청하고, 실패하면(키 오류, 사용량 초과 등) 서브 키로 한 번 더 요청한다.
 */
@Injectable()
export class AlchemyService {
  private readonly logger = new Logger(AlchemyService.name);
  private readonly mainRpc: JsonRpcProvider;
  private readonly subRpc: JsonRpcProvider | null;
  private readonly wsUrl: string;
  // 웹소켓 연결에 쓸 키 [메인, 서브]. 서브 키가 비어 있으면 메인만
  private readonly apiKeys: string[];

  constructor(config: ConfigService) {
    const url = config.get<string>('alchemy.url')!;
    const apiKey = config.get<string>('alchemy.apiKey')!;
    const subApiKey = config.get<string>('alchemy.subApiKey');
    const chainId = config.get<number>('alchemy.chainId')!;
    this.wsUrl = config.get<string>('alchemy.wsUrl') ?? '';
    this.apiKeys = subApiKey ? [apiKey, subApiKey] : [apiKey];

    this.mainRpc = createRpc(url, apiKey, chainId);
    // 서브 키가 비어 있으면 대체 없이 메인 키만 쓴다
    this.subRpc = subApiKey ? createRpc(url, subApiKey, chainId) : null;
  }

  /** 체인의 최신 블록 번호 */
  getLatestBlockNumber(): Promise<number> {
    return this.request((rpc) => rpc.getBlockNumber());
  }

  /** 트랜잭션 영수증. 아직 블록에 포함되지 않았으면 null */
  getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null> {
    return this.request((rpc) => rpc.getTransactionReceipt(txHash));
  }

  /** 트랜잭션. 노드가 모르는 트랜잭션이면(버려졌거나 아직 전파 전) null */
  getTransaction(txHash: string): Promise<TransactionResponse | null> {
    return this.request((rpc) => rpc.getTransaction(txHash));
  }

  /** 주소가 지금까지 블록에 포함시킨 트랜잭션 수 = 다음에 쓸 nonce */
  getConfirmedNonce(address: string): Promise<number> {
    return this.request((rpc) => rpc.getTransactionCount(address, 'latest'));
  }

  /** ETH 잔액 (wei). sweep 실행 계정의 가스비 확인에 쓴다 */
  getBalance(address: string): Promise<bigint> {
    return this.request((rpc) => rpc.getBalance(address));
  }

  /** 주소에 배포된 컨트랙트 코드. 컨트랙트가 없으면 '0x' */
  getCode(address: string): Promise<string> {
    return this.request((rpc) => rpc.getCode(address));
  }

  /**
   * 컨트랙트의 view 함수를 호출한다 (eth_call, 가스비 없음).
   * 예) call(factory, SWEEP_FACTORY_ABI, 'predictAddress', [salt])
   */
  async call<T>(to: string, abi: InterfaceAbi, method: string, args: unknown[] = []): Promise<T> {
    const iface = new Interface(abi);
    const data = iface.encodeFunctionData(method, args);
    const result = await this.request((rpc) => rpc.call({ to, data }));
    return iface.decodeFunctionResult(method, result)[0] as T;
  }

  /**
   * 여러 view 호출을 Multicall3 로 묶어서 한 번에 보낸다. 주소 수천 개의 잔액 조회 등에 쓴다.
   * 결과는 calls 와 같은 순서다. 실패한 호출은 success=false.
   */
  async multicall(calls: MulticallCall[]): Promise<MulticallResult[]> {
    if ((await this.getCode(MULTICALL3_ADDRESS)) === '0x') {
      throw new Error(`이 체인에는 Multicall3(${MULTICALL3_ADDRESS})가 배포되어 있지 않습니다.`);
    }

    const results: MulticallResult[] = [];
    // 한 요청이 너무 커지지 않게 나눠서 보낸다
    for (let i = 0; i < calls.length; i += MULTICALL_CHUNK_SIZE) {
      const chunk = calls.slice(i, i + MULTICALL_CHUNK_SIZE);
      const chunkResults = await this.call<[boolean, string][]>(
        MULTICALL3_ADDRESS,
        MULTICALL3_ABI,
        'aggregate3',
        [chunk.map((c) => ({ target: c.target, allowFailure: true, callData: c.callData }))],
      );
      results.push(...chunkResults.map(([success, returnData]) => ({ success, returnData })));
    }
    return results;
  }

  /** 노드에 직접 물어본 체인 ID. .env 의 CHAIN_ID 가 맞는지 확인할 때 쓴다 */
  async getNodeChainId(): Promise<number> {
    return Number(await this.request((rpc) => rpc.send('eth_chainId', [])));
  }

  /**
   * 트랜잭션을 보낼 지갑. 컨트랙트 배포 등에 쓴다.
   * 같은 트랜잭션을 두 번 보내는 일이 없도록 서브 키 대체 없이 메인 키로만 보낸다.
   */
  createWallet(privateKey: string): Wallet {
    return new Wallet(privateKey, this.mainRpc);
  }

  /** 블록 하나를 조회한다. 아직 없는 블록이면 null */
  getBlock(blockNumber: number): Promise<Block | null> {
    return this.request((rpc) => rpc.getBlock(blockNumber));
  }

  /** 이벤트 로그를 조회한다. 예) 특정 블록의 ERC20 Transfer 로그 */
  getLogs(filter: Filter | FilterByBlockHash): Promise<Log[]> {
    return this.request((rpc) => rpc.getLogs(filter));
  }

  /**
   * 새 블록이 생길 때마다 onBlock(블록 번호)을 부른다 (웹소켓 eth_subscribe newHeads).
   * ALCHEMY_WS_URL 이 비어 있으면 아무것도 하지 않고 false 를 돌려준다.
   *
   * - 연결이 끊기면 WS_RECONNECT_MS 뒤 다시 연결한다. 연결 자체가 안 되면 메인 ↔ 서브 키를 번갈아 쓴다.
   * - 끊긴 동안 생긴 블록은 알려주지 않는다. 받는 쪽이 번호를 보고 빠진 블록을 채워야 한다.
   */
  watchNewHeads(onBlock: (blockNumber: number) => void): boolean {
    if (!this.wsUrl) {
      return false;
    }
    let keyIndex = 0;

    const connect = () => {
      const keyName = keyIndex === 0 ? '메인' : '서브';
      const ws = new WebSocket(joinUrl(this.wsUrl, this.apiKeys[keyIndex]));
      let opened = false;
      let alive = true;
      let pingTimer: NodeJS.Timeout | undefined;

      ws.on('open', () => {
        opened = true;
        ws.send(
          JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['newHeads'] }),
        );
        this.logger.log(`웹소켓 연결 → newHeads 구독 (${keyName} 키)`);

        pingTimer = setInterval(() => {
          if (!alive) {
            this.logger.warn('웹소켓 응답 없음 → 연결을 끊습니다');
            ws.terminate();
            return;
          }
          alive = false;
          ws.ping();
        }, WS_PING_INTERVAL_MS);
      });
      ws.on('pong', () => {
        alive = true;
      });

      ws.on('message', (data) => {
        alive = true;
        try {
          const msg = JSON.parse(data.toString()) as {
            method?: string;
            params?: { result?: { number?: string } };
            error?: { message?: string };
          };
          if (msg.error) {
            // 구독 요청이 거절됐다 (키 오류 등). 끊고 다시 연결한다
            this.logger.warn(`newHeads 구독 실패: ${msg.error.message}`);
            ws.close();
          } else if (msg.method === 'eth_subscription' && msg.params?.result?.number) {
            onBlock(Number(msg.params.result.number));
          }
        } catch (err) {
          this.logger.warn(`웹소켓 메시지 처리 실패: ${errorMessage(err)}`);
        }
      });

      // 오류 뒤에는 항상 close 가 오므로 다시 연결은 close 에서 한다
      ws.on('error', (err) =>
        this.logger.warn(`웹소켓 오류 (${keyName} 키): ${errorMessage(err)}`),
      );
      ws.on('close', () => {
        clearInterval(pingTimer);
        if (!opened) {
          keyIndex = (keyIndex + 1) % this.apiKeys.length;
        }
        this.logger.warn(`웹소켓 끊김 → ${WS_RECONNECT_MS}ms 뒤 다시 연결`);
        setTimeout(connect, WS_RECONNECT_MS);
      });
    };

    connect();
    return true;
  }

  /** 메인 키로 요청하고, 실패하면 서브 키로 다시 요청한다 */
  private async request<T>(call: (rpc: JsonRpcProvider) => Promise<T>): Promise<T> {
    try {
      return await call(this.mainRpc);
    } catch (mainErr) {
      if (!this.subRpc) {
        throw new Error(`Alchemy 요청 실패: ${errorMessage(mainErr)}`);
      }
      this.logger.warn(`메인 키 요청 실패 → 서브 키로 재시도 (${errorMessage(mainErr)})`);

      try {
        return await call(this.subRpc);
      } catch (subErr) {
        throw new Error(`Alchemy 요청 실패 (메인·서브 키 모두): ${errorMessage(subErr)}`);
      }
    }
  }
}

/** url 과 키를 합쳐 RPC 클라이언트를 만든다. 예) https://eth-sepolia.g.alchemy.com/v2 + /<키> */
function createRpc(url: string, apiKey: string, chainId: number): JsonRpcProvider {
  const request = new FetchRequest(joinUrl(url, apiKey));
  // ethers 는 사용량 초과(429) 시 자체적으로 여러 번 재시도한다. 바로 실패시켜 서브 키로 넘긴다.
  request.setThrottleParams({ maxAttempts: 1 });
  // 체인을 직접 알려준다. 안 알려주면 ethers 가 노드에 체인을 물어보는데,
  // 키가 막혀 있으면 이 확인을 에러 없이 무한 재시도해서 서브 키로 넘어가지 못한다.
  const network = Network.from(chainId);
  return new JsonRpcProvider(request, network, { staticNetwork: network });
}

/** url 끝에 키를 붙인다. 예) wss://eth-sepolia.g.alchemy.com/v2 + <키> → .../v2/<키> */
function joinUrl(url: string, apiKey: string): string {
  return `${url.replace(/\/+$/, '')}/${apiKey}`;
}
