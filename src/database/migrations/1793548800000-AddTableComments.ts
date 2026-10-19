import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 모든 테이블과 컬럼에 설명(COMMENT)을 단다. DB 툴(DBeaver, DataGrip 등)에서 바로 보인다.
 * 테이블/컬럼을 추가하면 여기처럼 COMMENT 도 같이 단다.
 */
const COMMENTS: Record<string, { table: string; columns: Record<string, string> }> = {
  users: {
    table: '로그인 유저. 유저마다 입금 주소(deposit_addresses)와 포인트(user_balances)를 가진다',
    columns: {
      id: 'PK. 입금 주소의 salt 는 keccak256(이 값)',
      email: '로그인 아이디 (소문자로 저장, 유니크)',
      password_hash: '비밀번호 bcrypt 해시 (원문은 저장하지 않는다)',
      name: '표시 이름 (선택)',
      is_active: 'false 면 로그인과 API 사용이 막힌다',
      last_login_at: '마지막 로그인 시각',
      created_at: '가입(생성) 시각',
      updated_at: '마지막 수정 시각',
    },
  },
  refresh_tokens: {
    table: '발급한 리프레시 토큰. 1회용이며 쓰면 폐기되고 새 토큰이 발급된다 (rotation)',
    columns: {
      id: 'PK',
      user_id: '토큰 주인 (users.id)',
      token_hash: '토큰 SHA-256 해시 (원문은 저장하지 않는다)',
      expires_at: '만료 시각. 지나면 매일 새벽 4시에 삭제된다',
      revoked_at: '폐기된 시각. null 이면 아직 사용 가능',
      revoke_reason:
        '폐기 사유: rotated(재발급에 사용) / logout / reuse_detected(재사용 감지로 일괄 폐기)',
      created_at: '발급 시각',
    },
  },
  blocks: {
    table: 'polling-block 이 저장한 확정 블록 (최신에서 DEPOSIT_CONFIRMATIONS 만큼 지난 블록)',
    columns: {
      chain_id: 'PK. 체인 ID (예: 1 이더리움, 11155111 Sepolia)',
      number: 'PK. 블록 번호',
      hash: '블록 hash',
      parent_hash: '앞 블록 hash. 저장된 앞 블록과 다르면 reorg 로 보고 멈춘다',
      tx_count: '블록 안의 트랜잭션 수',
      block_time: '블록이 만들어진 시각',
      logs_scanned: 'polling-deposit 이 이 블록의 토큰 입금(Transfer 로그)을 확인했는지',
      created_at: 'DB 에 저장된 시각',
    },
  },
  currencies: {
    table:
      '취급하는 ERC-20 토큰 (예: USDT, USDC). 입금 감지 / sweep / 포인트는 여기 등록된 토큰만 다룬다',
    columns: {
      id: 'PK',
      chain_id: '체인 ID',
      symbol: '토큰 심볼 (대문자, 체인 안에서 유니크)',
      decimals: '소수점 자릿수 (USDT 6). 금액 컬럼은 모두 이 기준의 최소 단위 정수다',
      address: 'ERC-20 컨트랙트 주소',
      point_ratio:
        '토큰 1개당 포인트. 입금 시 포인트 = 토큰 개수 × 이 값 (예: 1 이면 1 USDT = 1 포인트)',
      min_sweep_amount:
        '최소 sweep 금액 (최소 단위). 입금 주소 잔액이 이보다 적으면 sweep 하지 않는다',
      is_active: 'false 면 sweep / balances 대상에서 빠진다 (입금 감지는 계속한다)',
      created_at: '등록 시각',
      updated_at: '마지막 수정 시각',
    },
  },
  sweep_contracts: {
    table: '배포한 SweepFactory 컨트랙트. 같은 체인에서는 가장 최근 행이 현재 쓰는 컨트랙트다',
    columns: {
      id: 'PK',
      chain_id: '체인 ID',
      factory_address:
        'SweepFactory 주소. 입금 주소 계산(predictAddress)과 sweep 을 여기로 호출한다',
      implementation_address: '입금 주소(Clone)들이 로직을 빌려 쓰는 DepositWallet 원본 주소',
      owner_address: '배포 시점의 owner (= 배포 계정). sweep / treasury 변경 권한',
      treasury_address: '배포 시점의 treasury. sweep 한 돈이 모이는 주소',
      deploy_tx_hash: '배포 트랜잭션 hash',
      deploy_block_number: '배포된 블록 번호',
      created_at: 'DB 에 저장된 시각',
    },
  },
  deposit_addresses: {
    table:
      '유저에게 발급한 입금 주소 (유저 1명 = factory 1개당 1개). 주소만 계산해 둔 것이고 컨트랙트는 첫 sweep 때 배포된다',
    columns: {
      id: 'PK',
      user_id: '주소 주인 (users.id)',
      chain_id: '체인 ID',
      factory_address: '주소를 계산한 SweepFactory. factory 가 바뀌면 같은 유저도 주소가 달라진다',
      salt: 'CREATE2 salt = keccak256(user_id)',
      address: '입금 주소 = SweepFactory.predictAddress(salt)',
      created_at: '발급 시각',
    },
  },
  transactions: {
    table:
      '감지한 우리 입금 1건 = ERC-20 Transfer 로그 1개. (chain_id, tx_hash, log_index) 유니크로 이중 입금을 막는다',
    columns: {
      id: 'PK',
      chain_id: '체인 ID',
      type: '종류 (지금은 deposit 만 있다)',
      user_id: '입금 주소의 주인 (users.id)',
      currency_id: '입금된 토큰 (currencies.id)',
      address: '돈이 들어온 우리 입금 주소',
      from_address: '보낸 주소',
      amount: '토큰 수량 (최소 단위, USDT 6자리면 1 USDT = 1000000)',
      tx_hash: '트랜잭션 hash',
      log_index: '트랜잭션 안에서 Transfer 로그의 위치 (한 tx 에 입금이 여러 개일 수 있다)',
      block_number: '블록 번호',
      block_hash: '블록 hash',
      block_time: '블록 시각 (입금 시각)',
      created_at: 'DB 에 기록된 시각',
    },
  },
  user_balances: {
    table:
      '유저 × 토큰별 현재 포인트. LedgerService 로만 바뀌고, 바뀔 때마다 ledger_entries 에 이력이 남는다',
    columns: {
      user_id: 'PK. 유저 (users.id)',
      currency_id: 'PK. 토큰 (currencies.id)',
      points: '현재 포인트 (소수 6자리)',
      updated_at: '마지막으로 바뀐 시각',
    },
  },
  ledger_entries: {
    table: '포인트 원장. 포인트가 바뀐 이력 1건 = 1행. 지우거나 고치지 않고 쌓기만 한다',
    columns: {
      id: 'PK',
      user_id: '유저 (users.id)',
      currency_id: '토큰 (currencies.id)',
      type: '바뀐 이유 (지금은 deposit 만 있다)',
      points: '바뀐 포인트 (늘면 +, 줄면 -)',
      points_after: '반영 후 포인트',
      transaction_id:
        '원인이 된 입금 (transactions.id). (type, transaction_id) 유니크로 두 번 반영되지 않는다',
      created_at: '기록 시각',
    },
  },
  sweeps: {
    table: 'sweep 실행 기록. sweep 트랜잭션 1건 = 1행',
    columns: {
      id: 'PK',
      chain_id: '체인 ID',
      factory_address: '사용한 SweepFactory 주소',
      treasury_address: '돈이 모인 주소',
      executor_address: '트랜잭션을 보내고 가스비를 낸 계정 (컨트랙트 owner)',
      tx_hash: 'sweep 트랜잭션 hash',
      status: 'pending(결과 대기) / success / failed. pending 은 sweep-reconcile 로 정리한다',
      nonce: '트랜잭션 nonce. 같은 nonce 를 다른 tx 가 쓰면 이 tx 는 버려진 것(dropped)',
      plan: '보낼 때의 대상 목록 (라벨/salt/입금 주소/토큰). 결과를 sweep_items 로 복원할 때 쓴다',
      block_number: '포함된 블록 번호 (성공 시)',
      gas_used: '사용한 가스 (성공 시)',
      fee_wei: '실제로 낸 가스비 (wei, 성공 시)',
      error: '실패 이유 (failed 일 때)',
      created_at: '트랜잭션을 보낸 시각',
      updated_at: '상태가 마지막으로 바뀐 시각',
    },
  },
  sweep_items: {
    table:
      'sweep 에서 실제로 옮긴 금액. 입금 주소 1개 × 토큰 1개 = 1행 (컨트랙트 Swept 이벤트 기준)',
    columns: {
      id: 'PK',
      sweep_id: 'sweeps.id',
      label: '입금 주소를 만든 라벨 (= users.id)',
      salt: 'CREATE2 salt',
      wallet_address: '돈을 꺼낸 입금 주소',
      wallet_deployed: '이 sweep 에서 입금 주소의 Clone 이 새로 배포됐는지',
      token_address: '토큰 주소',
      token_symbol: '토큰 심볼 (기록 시점)',
      token_decimals: '토큰 소수점 자릿수 (기록 시점)',
      amount: '옮긴 수량 (최소 단위)',
      created_at: '기록 시각',
    },
  },
};

export class AddTableComments1793548800000 implements MigrationInterface {
  name = 'AddTableComments1793548800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, { table: tableComment, columns }] of Object.entries(COMMENTS)) {
      await queryRunner.query(`COMMENT ON TABLE "${table}" IS ${quote(tableComment)}`);
      for (const [column, comment] of Object.entries(columns)) {
        await queryRunner.query(`COMMENT ON COLUMN "${table}"."${column}" IS ${quote(comment)}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, { columns }] of Object.entries(COMMENTS)) {
      await queryRunner.query(`COMMENT ON TABLE "${table}" IS NULL`);
      for (const column of Object.keys(columns)) {
        await queryRunner.query(`COMMENT ON COLUMN "${table}"."${column}" IS NULL`);
      }
    }
  }
}

/** SQL 문자열 리터럴로 감싼다 (작은따옴표 이스케이프) */
function quote(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}
