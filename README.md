# coin-sweep

``
CREATE2 + Clones
``
## 셋업

```bash
npm install
cp .env.example .env   # ALCHEMY_*, CHAIN_ID, DB_*, JWT_SECRET 채우기
npm run migration:run  # 테이블 생성 (blocks, users, currencies, deposit_addresses, transactions, user_balances, user_balance_histories, bets, game_rounds, sweeps ...)
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

# 새 이더리움 계정 만들기 (주소 / 프라이빗 키 / 퍼블릭 키를 콘솔에 출력, RPC 호출 없음)
npm run cli -- wallet-create

# 배포: .env 의 DEPLOYER_PRIVATE_KEY, SWEEP_TREASURY_ADDRESS 를 채운 뒤
npm run cli -- sweep-contract-deploy             # 배포 정보 확인 → yes 입력 → 배포 → sweep_contracts 저장

# 취급할 ERC-20 토큰 등록 (ETH 등 네이티브 코인은 받지 않는다). 입금 감지 / sweep / balances 는 등록된 토큰만 다룬다
npm run cli -- currency-add 0xUSDT주소 --ratio 1 --min 10   # 1 USDT = 1 포인트, 최소 sweep 10 USDT (심볼/소수점은 체인에서 읽음)
npm run cli -- erc20-mint 1000                    # 테스트 토큰(MintableToken) 새로 배포 + 배포 계정에 1000 CUSD (DEPLOYER_PRIVATE_KEY, yes 확인)
npm run cli -- erc20-mint 100 0x받을주소 -t 0x토큰주소   # 이미 배포한 테스트 토큰을 100개 더 찍기
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
npm run cli -- sweep --all                           # 최소 sweep 금액 이상인 입금 주소 전체를 한 번에 (목록 확인 → yes)
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
| POST | `/api/auth/register` | - | 회원가입 `{ email, password, name? }` → 로그인과 같은 토큰 + 유저 (같은 IP 1분 5번) |
| POST | `/api/auth/login` | - | `{ email, password }` → `accessToken`(JWT) + `refreshToken` 발급 |
| POST | `/api/auth/refresh` | - | `{ refreshToken }` → 새 `accessToken` + 새 `refreshToken` (보낸 토큰은 폐기) |
| POST | `/api/auth/logout` | - | `{ refreshToken }` → 리프레시 토큰 폐기 |
| GET | `/api/auth/me` | Bearer | 내 정보 |
| GET | `/api/points` | Bearer | 내 포인트 (유저당 하나, 입금이 없었으면 0) |
| GET | `/api/points/history?limit=20&offset=0` | Bearer | 내 포인트 이력 (type, 반영 전/후 포인트, 최근 것부터, limit 최대 100) |
| POST | `/api/points/churu` | Bearer | Chonk 고양이에게 츄르 주기. 10 포인트 차감 (이력 type = churu), 포인트 부족이면 400 |
| GET | `/api/deposit-address` | Bearer | 내 입금 주소 (없으면 이때 발급, deposit_addresses 저장) + 받는 토큰 목록. 컨트랙트 배포 전이면 503 |
| GET | `/api/blocks?limit=12` | - | 최근 블록 (최신이 앞) + `serverTime` (게임 화면은 소켓을 쓴다) |
| GET | `/api/games/:game/rounds?limit=20&offset=0` | - | 블록 게임 라운드 결과 (game_rounds, 최신이 앞) |
| POST | `/api/games/:game/bets` | Bearer | 배팅 `{ targetBlockNumber, pick, amount }` → 배팅 + 반영 후 포인트. 아래 게임 참고 |
| GET | `/api/games/bets?game=coin&limit=20&offset=0` | Bearer | 내 배팅 기록 (최근 것부터, `status`: pending / settled) |

- 리프레시 토큰은 1회용이다. 이미 쓴 토큰이 다시 들어오면 탈취로 보고 그 유저의 리프레시 토큰을 전부 폐기한다 (다시 로그인 필요). 로그아웃한 토큰은 예외로 거절만 한다.
- 만료된 리프레시 토큰은 API 서버가 매일 새벽 4시에 지운다.

- 모든 API 는 기본으로 `Authorization: Bearer <accessToken>` 이 필요하다. 열어둘 API 에만 `@Public()` 을 붙인다.
- 유저는 회원가입 API 나 CLI 의 `user-create` 로 만든다.
- 입금: `/api/deposit-address` 로 받은 주소에 등록된 토큰을 보내면, polling-deposit 이 10블록 지난 블록에서 확인할 때(약 2~5분) 포인트가 적립된다.
  집금(sweep)은 관리자가 CLI 로 따로 한다 (포인트와 상관없이 treasury 로 모으는 작업).

### 소켓 (Socket.IO, 게임 화면 실시간 데이터)

API 서버와 같은 포트(`/socket.io`). 로그인 없이 붙는다. 브라우저가 백엔드에 직접 붙으므로 `SOCKET_CORS_ORIGINS` 에 프론트 주소를 넣는다
(Vercel rewrites 는 웹소켓을 넘기지 못한다).

| 방향 | 이벤트 | 내용 |
|---|---|---|
| 서버 → | `blocks` | 접속하면 한 번 + 새 블록이 저장될 때마다. `{ serverTime, blocks(최근 12, 최신이 앞), round: { targetBlockNumber, closesAt } }` |
| → 서버 | `rounds:subscribe` (game) | 그 게임 라운드 결과를 받는다 (한 번에 한 게임). 응답(ack): `{ game, rounds(최근 20) }` |
| 서버 → | `rounds` | 구독한 게임의 라운드가 새로 확정될 때. `{ game, rounds }` |

blocks / game_rounds 는 polling-block, polling-bet 이 쓰므로 API 서버가 1초마다 DB 를 확인해서 보낸다 (접속자가 없으면 확인하지 않는다, Alchemy 요청 없음).
- 로그인은 같은 IP 에서 1분에 5번까지 (넘으면 429). 프록시 뒤에 두면 실제 IP 를 받도록 trust proxy 설정이 필요하다.
- 포인트는 정확도를 위해 숫자가 아닌 문자열로 내려준다 (예: `"150.5"`).

## 한 번에 실행 (PM2)

API 서버 + polling-block + polling-deposit + polling-bet 을 PM2 로 띄운다 (`ecosystem.config.js`, 빌드한 `dist/` 실행).

```bash
npm run pm2:start    # 빌드 + 4개 시작 (떠 있으면 다시 시작)
npm run pm2:status   # 상태
npm run pm2:logs     # 로그 (하나만: npx pm2 logs polling-bet)
npm run pm2:stop     # 멈춤 (완전히 내리기: npx pm2 delete ecosystem.config.js)
```

- 죽으면 자동으로 다시 띄운다 (점점 늘어나는 간격으로).
- polling-block / polling-deposit 은 1개씩만 띄운다 (여러 개면 Alchemy 요청이 그만큼 는다).

## 게임

포인트를 걸고 하는 게임 5개. 결과는 서버(`src/modules/games/rules.ts`)가 정하고, 프론트(chonk-frontend)는 같은 규칙으로 애니메이션만 보여준다.
두 쪽 규칙이 같은지는 `npm test` (test/games-rules.spec.ts) 로 확인한다.

| game | 결과 | pick | 배당 (건 금액의 몇 배를 돌려받는지) |
|---|---|---|---|
| `coin` | 판정 블록 해시 마지막 글자 홀수/짝수 | `odd` / `even` | 2 |
| `cat-race` | 해시 64글자 중 가장 많이 나온 고양이 (0~3 치즈, 4~7 까망, 8~b 삼색이, c~f 하양. 동점이면 먼저 도착) | `orange` / `black` / `calico` / `white` | 4 |
| `block-match` | 해시 마지막 3글자 → 그림 3개 (0~3 츄르, 4~7 생선, 8~b 고양이, c~f 쥐) | 없음 | 츄르 3개 12 / 같은 그림 3개 6 / 츄르 2개 1.5 / 같은 그림 2개 0.5 |
| `dice` | 해시 끝에서부터 1바이트씩 (252 이상은 건너뜀) → 주사위 2개의 합 | `low`(2~6) / `seven` / `high`(8~12) | 2.2 / 5 / 2.2 |
| `churu-match` | 서버 난수로 그림 3개 (츄르, 생선, 고양이, 쥐, 털실) | 없음 | 츄르 3개 20 / 같은 그림 3개 5 / 츄르 2개 2 / 같은 그림 2개 1 |

- 걸 수 있는 금액은 10 / 50 / 100 포인트. 걸 때 바로 빠지고(`user_balance_histories.type = bet`) 취소는 없다.
- **블록 게임** (churu-match 를 뺀 4개): 지금 최신 블록이 N 이면 `targetBlockNumber = N+2` 에 건다. 블록 시각부터 9초 동안만 받고, 그 뒤엔 409.
  polling-block 이 멈추거나 밀려 최신 블록이 오래됐어도 마감으로 처리되니, 이미 나온 블록에 거는 일은 없다.
- **라운드 결과 + 정산**: 판정 블록 뒤로 2블록이 더 저장되면(약 24초) `polling-bet` 이 blocks 에 저장된 해시로 블록 게임 4개의 라운드 결과를 `game_rounds` 에 남기고,
  같은 트랜잭션에서 그 블록에 건 배팅을 판정해 payout(= amount × 배수)이 있으면 올린다(`bet_payout`). 게임 화면 히스토리는 이 라운드 결과를 보여준다.
  그 사이 reorg 가 나면 polling-block 이 되감아 둔 새 해시로 판정한다. polling-bet 을 여러 개 띄워도 같은 배팅이 두 번 정산되지 않는다.
- **churu-match** 는 `targetBlockNumber`, `pick` 없이 금액만 보내면 그 자리에서 정산된 결과(`status = settled`)가 온다.
- 한 유저는 한 게임의 한 라운드에 한 번만 건다 (`bets` 유니크). 포인트가 모자라면 400.

## CLI

```bash
# 로그인 유저 만들기
npm run cli -- user-create -e user@example.com -p password1234 -n 이름

# 1) 최신 블록을 따라가며 blocks 에 저장 (reorg 는 자동으로 되감는다. Ctrl+C 로 종료, 다시 실행하면 이어서)
npm run cli -- polling-block

# 2) 최신 블록에서 10블록 지난 블록을 10개씩 모아 eth_getLogs 1회로 토큰 입금 확인 → transactions 저장 + 포인트 적립
npm run cli -- polling-deposit

# 3) 블록 게임 라운드 결과 기록 + 배팅 정산 (판정 블록 뒤로 2블록이 더 저장되면. DB 만 읽어서 Alchemy 요청 없음)
npm run cli -- polling-bet

# polling-block 이 지나간 구간에서 빠진 블록 하나를 저장 (앞쪽 블록은 거부. 입금 확인은 polling-deposit 이 한다)
npm run cli -- target-block 12345678

# 유저 포인트와 최근 이력 보기
npm run cli -- user-balance alice@example.com
```

### 입금 처리 흐름

```
polling-block    최신 블록 저장 (blocks.is_scanned = false)
                 ALCHEMY_WS_URL 이 있으면 웹소켓 newHeads 로 새 블록을 바로 알고 (없으면 POLL_INTERVAL_MS 마다 HTTP 폴링)
                 reorg 면 빠진 블록을 지우고 되감아서 다시 받는다 (입금 확인을 끝낸 블록이면 멈춘다)
      ↓
polling-deposit  DEPOSIT_POLL_INTERVAL_MS(60초)마다 DB 를 보고
                 최신 블록에서 DEPOSIT_CONFIRMATIONS(10) 블록 지난 블록이 DEPOSIT_SCAN_BATCH(10)개 쌓이면
                 eth_getLogs 1회 (그 구간의 등록된 토큰 Transfer 로그)
                 → 받는 주소가 deposit_addresses 면 입금
                 → transactions 저장 + user_balances.points 증가 + user_balance_histories 기록
                 → 그 구간 blocks.is_scanned = true   (전부 한 DB 트랜잭션)
```

- **블록 상태**: `is_scanned` = 입금 확인을 끝냈는지. polling-deposit 은 최신 블록에서 `DEPOSIT_CONFIRMATIONS` 이상 지났고 `is_scanned = false` 인 블록을 확인한다. 노드의 finalized 블록은 확인하지 않는다.
- **10블록 지나면 입금 확인**: 최신 블록에서 `DEPOSIT_CONFIRMATIONS`(기본 10, 약 2분) 지난 블록을 확인해서 입금 반영이 약 2~5분 걸린다. finalized(약 13~15분)를 기다리지 않는 대신 프로토콜상 보장은 없다. 10블록 넘는 reorg 는 사실상 없지만, 확인을 끝낸 블록이 바뀌면 polling-block 이 자동으로 고치지 않고 멈춘다. 출금을 붙이면 입금 후 충분히(예: finalized 약 15분) 지난 것만 출금 가능하게 하는 것을 권장.
- **새 블록 감지**: 웹소켓은 "새 블록이 나왔다"는 신호로만 쓰고, 블록 내용은 HTTP `getBlock` 으로 받아 저장한다. 웹소켓이 끊기면 5초 뒤 다시 연결하고(연결이 안 되면 메인 ↔ 서브 키 번갈아), 끊긴 동안의 블록은 다음 신호나 `WS_FALLBACK_INTERVAL_MS`(60초)마다의 HTTP 확인 때 빠짐없이 채운다.
- **reorg**: polling-block 은 최신 블록을 저장하므로 1~2블록짜리 reorg 를 만날 수 있다. 새 블록이 저장된 앞 블록과 이어지지 않으면 앞 블록을 지우고 이어지는 지점까지 되감는다. 아직 입금 확인 전(10블록 안쪽)인 블록이라 포인트에는 영향이 없다. (입금 확인을 끝낸 블록이 뒤집히면 자동으로 고치지 않고 멈춘다)
- 블록마다 묻지 않고 10개씩 모아서 묻기 때문에 Alchemy 요청이 적다. Alchemy 무료 플랜은 eth_getLogs 한 번에 10블록까지라 기본값이 10 이다.
- **이중 입금 방지**: transactions 의 `(chain_id, tx_hash, log_index)` 가 유니크라 이미 있는 tx 는 건너뛰고 포인트도 올리지 않는다. 이력(user_balance_histories)도 `(type, target_id)` 가 유니크다.
- **포인트** = 토큰 개수 × `currencies.point_ratio` (소수 6자리 아래는 버림). 예) ratio 1 이면 100 USDT → 100 포인트. 포인트는 토큰별로 나누지 않고 유저당 하나로 쌓인다.
- **포인트 이력**: `user_balance_histories` 에 `type`(deposit 입금 / withdraw 출금), 바뀐 포인트, 반영 전(`points_before`)/후(`points_after`) 포인트가 남는다.
- 등록된 토큰이나 입금 주소가 하나도 없으면 polling-deposit 은 블록을 확인 처리하지 않고 기다린다 (등록하면 그때부터 쌓인 블록을 확인).
- 비활성(`currency-disable`) 토큰도 입금은 계속 기록한다. 토큰 등록 전에 이미 확인된 블록의 그 토큰 입금은 기록되지 않는다.
- DB 의 모든 테이블/컬럼에 설명(COMMENT)이 달려 있다. DB 툴에서 바로 보인다.
