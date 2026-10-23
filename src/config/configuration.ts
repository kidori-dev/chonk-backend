/**
 * .env 값을 코드에서 쓰기 좋은 형태로 묶는다.
 * 사용 예) config.get<string>('alchemy.apiKey')
 */
export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresInSeconds: parseInt(process.env.JWT_EXPIRES_IN ?? '3600', 10),
    refreshExpiresInSeconds: parseInt(process.env.JWT_REFRESH_EXPIRES_IN ?? '1209600', 10),
  },
  // 입금 감지 (polling-deposit). finalized 블록만 확인한다
  deposit: {
    // finalized 블록을 확인하는 간격 (finalized 는 약 6.4분마다 32블록씩 늘어나서 자주 볼 필요가 없다)
    pollIntervalMs: parseInt(process.env.DEPOSIT_POLL_INTERVAL_MS ?? '60000', 10),
    // polling-deposit: 로그 확인 안 된 블록이 이만큼 쌓이면 eth_getLogs 한 번으로 확인한다
    scanBatch: parseInt(process.env.DEPOSIT_SCAN_BATCH ?? '10', 10),
  },
  // sweep-contract-deploy 커맨드에서만 쓴다
  deploy: {
    privateKey: process.env.DEPLOYER_PRIVATE_KEY ?? '',
    treasuryAddress: process.env.SWEEP_TREASURY_ADDRESS ?? '',
  },
  alchemy: {
    url: process.env.ALCHEMY_URL ?? '',
    chainId: parseInt(process.env.CHAIN_ID ?? '0', 10),
    apiKey: process.env.ALCHEMY_API_KEY ?? '',
    subApiKey: process.env.ALCHEMY_SUB_API_KEY ?? '',
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? '6000', 10),
    // 비어 있으면 polling-block 은 웹소켓 없이 HTTP 폴링만 한다
    wsUrl: process.env.ALCHEMY_WS_URL ?? '',
    // 웹소켓을 쓸 때 끊김에 대비해 노드에 최신 블록을 물어보는 간격
    wsFallbackIntervalMs: parseInt(process.env.WS_FALLBACK_INTERVAL_MS ?? '60000', 10),
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'chonk',
  },
});
