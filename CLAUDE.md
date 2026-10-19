# coin-sweep

EVM(Sepolia) ERC-20 입금 감지 → 포인트 적립 → CREATE2 + Clones 로 집금(sweep) 하는 NestJS + Foundry 프로젝트.
구조와 명령은 README.md 에 정리돼 있다.

## 작업 규칙

- 대화와 코드 주석은 한국어.
- 코드는 심플하고 읽기 쉽게. 과한 추상화/기능보다 단순한 구조 (WSS 대신 HTTP 폴링, ETH 없이 ERC-20 만).
- Alchemy 무료 플랜 기준으로 요청을 최소화한다.
  - RPC 는 `AlchemyService` 를 통해서만 호출한다 (메인 키 실패 시 서브 키로 넘어감).
  - `eth_getLogs` 는 한 번에 최대 10블록 (`DEPOSIT_SCAN_BATCH`).
  - 새 폴링/반복 호출을 추가하면 월 CU 사용량이 얼마나 늘어나는지 같이 확인한다.
- 의미가 다른 상태는 컬럼을 나눈다 (예: `blocks.status` 와 `blocks.is_scanned`).
- DB 테이블/컬럼에는 마이그레이션에서 반드시 `COMMENT` 를 단다.
- 새 환경 변수는 `.env.example`, `src/config/env.validation.ts`, `src/config/configuration.ts` 에 함께 추가한다.

## 명령

```bash
npm run build            # 타입 체크 겸 빌드
npm run lint
npm run contract:build   # contracts/ (Foundry)
npm run contract:test
npm run cli -- <command> # nest-commander CLI (src/commands)
```

## 테스트 / 안전

- 실제 `chonk` DB 는 건드리지 않는다. 테스트는 `chonk_test` DB 를 만들어 `DB_NAME=chonk_test` 로 마이그레이션 후 진행하고 끝나면 DROP.
- Postgres 는 docker 컨테이너 `postgres-18`. `docker exec` 로 SQL 을 heredoc 으로 넘길 땐 `-i` 필수.
- 로컬 체인은 Anvil(`--chain-id 31337`). Anvil 은 URL 경로가 있으면 404 라서 `AlchemyService` 용 프록시가 필요하고, Multicall3 는 `anvil_setCode` 로 넣는다.
- 사용자가 3000 포트로 서버를 띄워 둘 수 있으니 테스트 서버는 다른 포트를 쓰고 사용자 프로세스는 끄지 않는다.
- `.env` 의 키(Alchemy, DEPLOYER_PRIVATE_KEY, JWT_SECRET)는 읽거나 출력하지 않는다.
- 자금이 움직이는 명령(`sweep`, `sweep-contract-deploy`)과 실제 DB 마이그레이션은 실행 전에 사용자에게 확인받는다.
