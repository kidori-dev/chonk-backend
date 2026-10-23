import * as Joi from 'joi';

/** 앱 시작 시 .env 를 검사한다. 값이 없거나 형식이 틀리면 바로 실패한다. */
export const envValidationSchema = Joi.object({
  // production 이면 Swagger 문서가 꺼진다
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  // 토큰 서명 키. 유출되면 누구나 토큰을 만들 수 있으니 길고 무작위로 만든다
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.number().integer().min(60).default(3600),
  JWT_REFRESH_EXPIRES_IN: Joi.number().integer().min(60).default(1209600),

  ALCHEMY_URL: Joi.string().uri().required(),
  CHAIN_ID: Joi.number().integer().min(1).required(),
  ALCHEMY_API_KEY: Joi.string().required(),
  ALCHEMY_SUB_API_KEY: Joi.string().allow('').default(''),
  POLL_INTERVAL_MS: Joi.number().min(100).default(3000),
  // polling-block 이 새 블록을 바로 알기 위한 웹소켓 주소 (키 제외). 비우면 HTTP 폴링만 한다
  ALCHEMY_WS_URL: Joi.string()
    .uri({ scheme: ['ws', 'wss'] })
    .allow('')
    .default(''),
  // 웹소켓을 쓸 때 끊김에 대비해 노드에 최신 블록을 물어보는 간격(ms)
  WS_FALLBACK_INTERVAL_MS: Joi.number().integer().min(1000).default(60000),
  // polling-deposit 이 finalized 블록을 확인하는 간격(ms)
  DEPOSIT_POLL_INTERVAL_MS: Joi.number().integer().min(1000).default(60000),
  // polling-deposit 이 eth_getLogs 한 번에 확인할 블록 수. Alchemy 무료 플랜은 한 번에 10블록까지만 된다
  DEPOSIT_SCAN_BATCH: Joi.number().integer().min(1).default(10),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  // 컨트랙트 배포용 (sweep-contract-deploy). 배포할 때만 필요해서 비워둬도 된다
  DEPLOYER_PRIVATE_KEY: Joi.string()
    .allow('')
    .pattern(/^(0x)?[0-9a-fA-F]{64}$/)
    .messages({ 'string.pattern.base': 'DEPLOYER_PRIVATE_KEY 는 64자리 hex 여야 합니다.' }),
  SWEEP_TREASURY_ADDRESS: Joi.string()
    .allow('')
    .pattern(/^0x[0-9a-fA-F]{40}$/)
    .messages({
      'string.pattern.base': 'SWEEP_TREASURY_ADDRESS 는 0x 로 시작하는 주소여야 합니다.',
    }),
});
