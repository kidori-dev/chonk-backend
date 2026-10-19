# coin-sweep

``
CREATE2 + Clones
``
## 셋업

```bash
npm install
cp .env.example .env   # ALCHEMY_*, CHAIN_ID, DB_*, JWT_SECRET 채우기
npm run migration:run  # 테이블 생성 (blocks, users, currencies, deposit_addresses, transactions, user_balances, user_balance_histories, sweeps ...)
```

## 컨트랙트 (contracts/, Foundry)

유저별 입금 주소를 `CREATE2 + Clones(EIP-1167)` 로 만들고, 입금된 돈을 treasury 로 모은다.

- `contracts/src/SweepFactory.sol` — 입금 주소 계산(`predictAddress`), 배포, `sweep` (owner 전용)
- `contracts/src/DepositWallet.sol` — 입금 주소 하나하나가 되는 Clone 의 원본

```bash
# Foundry 설치: https://book.getfoundry.sh (forge 가 PATH 에 있어야 한다)
cd contracts && forge soldeer install && cd ..   # 처음 한 번: OpenZeppelin, forge-std 받기
npm run contract:build                           # 컴파일 → contracts/out
npm run contract:test                            # 테스트

# 배포: .env 의 DEPLOYER_PRIVATE_KEY, SWEEP_TREASURY_ADDRESS 를 채운 뒤
npm run cli -- sweep-contract-deploy             # 배포 정보 확인 → yes 입력 → 배포 → sweep_contracts 저장

# 취급할 ERC-20 토큰 등록 (ETH 등 네이티브 코인은 받지 않는다). 입금 감지 / sweep / balances 는 등록된 토큰만 다룬다
npm run cli -- currency-add 0xUSDT주소 --ratio 1 --min 10   # 1 USDT = 1 포인트, 최소 sweep 10 USDT (심볼/소수점은 체인에서 읽음)
npm run cli -- currency-set-ratio USDT 1                    # 토큰 1개당 포인트 변경 (이후 입금부터)
npm run cli -- currency-set-min USDT 20                     # 최소 sweep 금액 변경
npm run cli -- currency-list
npm run cli -- currency-disable USDC                        # sweep / balances 대상에서 빼기 (currency-enable 로 되돌림)

# 입금 주소 발급 (가스비 없음, deposit_addresses 에 저장)
npm run cli -- deposit-address-issue <유저id...>     # 특정 유저
npm run cli -- deposit-address-issue --all           # 아직 주소가 없는 유저 전부

# 발급된 입금 주소 전체 잔액 조회 (Multicall3 로 묶어서 조회, --nonzero 는 잔액 있는 주소만)
npm run cli -- balances --nonzero                    # 등록된 currency 전체
npm run cli -- balances -c USDT                      # USDT 만
# → 표 + 합계 + 잔액 있는 유저로 바로 실행할 수 있는 sweep 명령을 보여준다

# sweep: 유저들의 입금 주소 잔액을 treasury 로 모은다 (DEPLOYER_PRIVATE_KEY = 컨트랙트 owner 로 실행)
npm run cli -- sweep <유저id...>                     # 등록된 currency 전체. 잔액·가스 확인 → yes 입력 → 실행
npm run cli -- sweep <유저id...> -c USDT             # USDT 만
```

- 입금 주소 = `predictAddress(keccak256(users.id))`. 같은 유저면 항상 같은 주소다.
- sweep 은 입금 주소가 발급된 유저만 받는다. DB 의 주소가 컨트랙트 계산과 다르면 멈춘다.
- SweepFactory 를 새로 배포하면 주소가 바뀌므로, deposit_addresses 는 factory 별로 따로 발급된다.
- 잔액이 없거나 최소 sweep 금액(`currencies.min_sweep_amount`) 미만인 주소/자산은 자동으로 빠지고, 아직 Clone 이 없는 주소는 sweep 할 때 배포된다.
- 결과는 `sweeps`(트랜잭션 1건: pending → success/failed, 가스비) 와 `sweep_items`(입금 주소 × 자산별 옮긴 수량) 에 저장된다.
- 결과를 기다리다 꺼져서 `pending` 으로 남은 건은 `npm run cli -- sweep-reconcile` 로 체인에서 확인해 정리한다.
  (성공 → success + sweep_items / revert → failed / 같은 nonce 가 다른 트랜잭션으로 쓰임 → failed / 아직 대기 중 → pending 유지)

## API 서버

```bash
npm run start:dev      # http://localhost:3000/api , Swagger 문서: /api/docs (NODE_ENV=production 이면 꺼짐)
```

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/auth/login` | - | `{ email, password }` → `accessToken`(JWT) + `refreshToken` 발급 |
| POST | `/api/auth/refresh` | - | `{ refreshToken }` → 새 `accessToken` + 새 `refreshToken` (보낸 토큰은 폐기) |
| POST | `/api/auth/logout` | - | `{ refreshToken }` → 리프레시 토큰 폐기 |
| GET | `/api/auth/me` | Bearer | 내 정보 |
| GET | `/api/points` | Bearer | 내 포인트 (유저당 하나, 입금이 없었으면 0) |
| GET | `/api/points/history?limit=20&offset=0` | Bearer | 내 포인트 이력 (type, 반영 전/후 포인트, 최근 것부터, limit 최대 100) |

- 리프레시 토큰은 1회용이다. 이미 쓴 토큰이 다시 들어오면 탈취로 보고 그 유저의 리프레시 토큰을 전부 폐기한다 (다시 로그인 필요). 로그아웃한 토큰은 예외로 거절만 한다.
- 만료된 리프레시 토큰은 API 서버가 매일 새벽 4시에 지운다.

- 모든 API 는 기본으로 `Authorization: Bearer <accessToken>` 이 필요하다. 열어둘 API 에만 `@Public()` 을 붙인다.
- 회원가입 API 는 없다. 유저는 CLI 의 `user-create` 로 만든다.
- 로그인은 같은 IP 에서 1분에 5번까지 (넘으면 429). 프록시 뒤에 두면 실제 IP 를 받도록 trust proxy 설정이 필요하다.
- 포인트는 정확도를 위해 숫자가 아닌 문자열로 내려준다 (예: `"150.5"`).

## CLI

```bash
# 로그인 유저 만들기
npm run cli -- user-create -e user@example.com -p password1234 -n 이름

# 1) 최신 블록을 따라가며 blocks 에 저장 (reorg 는 자동으로 되감는다. Ctrl+C 로 종료, 다시 실행하면 이어서)
npm run cli -- polling-block

# 2) finalized 된 블록을 10개씩 모아 eth_getLogs 1회로 토큰 입금 확인 → transactions 저장 + 포인트 적립
npm run cli -- polling-deposit

# polling-block 이 지나간 구간에서 빠진 블록 하나를 저장 (앞쪽 블록은 거부. 입금 확인은 polling-deposit 이 한다)
npm run cli -- target-block 12345678

# 유저 포인트와 최근 이력 보기
npm run cli -- user-balance alice@example.com
```

### 입금 처리 흐름

```
polling-block    최신 블록 저장 (blocks.status = unfinalized)
                 reorg 면 빠진 unfinalized 블록을 지우고 되감아서 다시 받는다
      ↓
polling-deposit  DEPOSIT_POLL_INTERVAL_MS(60초)마다 노드의 finalized 블록을 확인하고
                 그 번호 이하의 unfinalized 블록을 finalized 로 바꾼다 (DB 의 같은 번호 블록 hash 가 같을 때만)
                 finalized 블록이 DEPOSIT_SCAN_BATCH(10)개 쌓이면
                 eth_getLogs 1회 (그 구간의 등록된 토큰 Transfer 로그)
                 → 받는 주소가 deposit_addresses 면 입금
                 → transactions 저장 + user_balances.points 증가 + user_balance_histories 기록
                 → 그 구간 blocks.is_scanned = true   (전부 한 DB 트랜잭션)
```

- **블록 상태**: `status` = `unfinalized`(저장됨, 아직 바뀔 수 있음) → `finalized`(최종 확정). `is_scanned` = 입금 확인을 끝냈는지. polling-deposit 은 `finalized` 이고 `is_scanned = false` 인 블록을 확인한다.
- **finalized 블록만 입금 확인**: finalized(최종 확정) 블록은 프로토콜상 되돌려지지 않아서, 적립한 포인트가 reorg 로 무효가 되는 일이 없다. 대신 입금 반영이 약 13~15분 걸린다 (이더리움/Sepolia 기준).
- **reorg**: polling-block 은 최신 블록을 저장하므로 1~2블록짜리 reorg 를 만날 수 있다. 새 블록이 저장된 앞 블록과 이어지지 않으면 앞 블록을 지우고 이어지는 지점까지 되감는다. 아직 입금 확인 전인 블록이라 포인트에는 영향이 없다. (finalized 블록이 뒤집히면 프로토콜상 일어나면 안 되는 일이라 자동으로 고치지 않고 멈춘다)
- 블록마다 묻지 않고 10개씩 모아서 묻기 때문에 Alchemy 요청이 적다. Alchemy 무료 플랜은 eth_getLogs 한 번에 10블록까지라 기본값이 10 이다.
- **이중 입금 방지**: transactions 의 `(chain_id, tx_hash, log_index)` 가 유니크라 이미 있는 tx 는 건너뛰고 포인트도 올리지 않는다. 이력(user_balance_histories)도 `(type, target_id)` 가 유니크다.
- **포인트** = 토큰 개수 × `currencies.point_ratio` (소수 6자리 아래는 버림). 예) ratio 1 이면 100 USDT → 100 포인트. 포인트는 토큰별로 나누지 않고 유저당 하나로 쌓인다.
- **포인트 이력**: `user_balance_histories` 에 `type`(deposit 입금 / withdraw 출금), 바뀐 포인트, 반영 전(`points_before`)/후(`points_after`) 포인트가 남는다.
- 등록된 토큰이나 입금 주소가 하나도 없으면 polling-deposit 은 블록을 확인 처리하지 않고 기다린다 (등록하면 그때부터 쌓인 블록을 확인).
- 비활성(`currency-disable`) 토큰도 입금은 계속 기록한다. 토큰 등록 전에 이미 확인된 블록의 그 토큰 입금은 기록되지 않는다.
- DB 의 모든 테이블/컬럼에 설명(COMMENT)이 달려 있다. DB 툴에서 바로 보인다.
