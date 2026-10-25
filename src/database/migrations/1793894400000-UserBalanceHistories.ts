import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 포인트를 토큰별이 아니라 유저당 하나로 쌓는다.
 *
 * - user_balances: (user_id, currency_id) → user_id 하나. 기존 토큰별 포인트는 합친다.
 *   토큰별 비율은 그대로 currencies.point_ratio 로 입금 때 포인트로 바꾼다.
 * - ledger_entries → user_balance_histories: 포인트 변경 이력.
 *   currency_id 를 없애고(토큰은 transaction 으로 알 수 있다) points_before 를 추가한다.
 *   transaction_id → target_id: type 에 따라 다른 테이블을 가리키므로(deposit → transactions, 이후 trade 등) FK 없이 둔다.
 *   기존 이력의 points_before / points_after 는 유저 기준으로 다시 계산한다.
 *
 * Postgres 는 컬럼 순서를 바꿀 수 없어서(ADD COLUMN 은 맨 뒤에 붙는다) 두 테이블 모두 새로 만들고 옮긴다.
 */
export class UserBalanceHistories1793894400000 implements MigrationInterface {
  name = 'UserBalanceHistories1793894400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // user_balances: 유저당 1행으로 합친다
    await queryRunner.query(`ALTER TABLE "user_balances" RENAME TO "user_balances_old"`);
    await queryRunner.query(
      `ALTER TABLE "user_balances_old" RENAME CONSTRAINT "PK_user_balances" TO "PK_user_balances_old"`,
    );
    await queryRunner.query(`
      CREATE TABLE "user_balances" (
        "user_id" uuid NOT NULL,
        "points" numeric(38,6) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_balances" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_user_balances_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      INSERT INTO "user_balances" ("user_id", "points", "created_at", "updated_at")
      SELECT b."user_id", SUM(b."points"),
        COALESCE((SELECT MIN(l."created_at") FROM "ledger_entries" l WHERE l."user_id" = b."user_id"), MIN(b."updated_at")),
        MAX(b."updated_at")
      FROM "user_balances_old" b GROUP BY b."user_id"
    `);
    await queryRunner.query(`DROP TABLE "user_balances_old"`);

    // ledger_entries → user_balance_histories (points_before / points_after 는 유저 기준으로 다시 계산)
    await queryRunner.query(`
      CREATE TABLE "user_balance_histories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "type" character varying(20) NOT NULL,
        "points" numeric(38,6) NOT NULL,
        "points_before" numeric(38,6) NOT NULL,
        "points_after" numeric(38,6) NOT NULL,
        "target_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_balance_histories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_balance_histories_type_target" UNIQUE ("type", "target_id"),
        CONSTRAINT "FK_user_balance_histories_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_balance_histories_user" ON "user_balance_histories" ("user_id", "created_at")`,
    );
    await queryRunner.query(`
      INSERT INTO "user_balance_histories"
        ("id", "user_id", "type", "points", "points_before", "points_after", "target_id", "created_at")
      SELECT "id", "user_id", "type", "points", "after" - "points", "after", "transaction_id", "created_at"
      FROM (
        SELECT *, SUM("points") OVER (PARTITION BY "user_id" ORDER BY "created_at", "id") AS "after"
        FROM "ledger_entries"
      ) e
    `);
    await queryRunner.query(`DROP TABLE "ledger_entries"`);

    await comment(
      queryRunner,
      'user_balances',
      null,
      '유저별 현재 포인트 (유저당 1행). UserBalancesService 로만 바뀌고, 바뀔 때마다 user_balance_histories 에 이력이 남는다',
    );
    await comment(queryRunner, 'user_balances', 'user_id', 'PK. 유저 (users.id)');
    await comment(
      queryRunner,
      'user_balances',
      'points',
      '현재 포인트 (소수 6자리). 입금되면 토큰 개수 × currencies.point_ratio 만큼 오른다',
    );
    await comment(
      queryRunner,
      'user_balances',
      'created_at',
      '행이 만들어진 시각 (첫 포인트 적립 시각)',
    );
    await comment(queryRunner, 'user_balances', 'updated_at', '마지막으로 바뀐 시각');
    await comment(
      queryRunner,
      'user_balance_histories',
      null,
      '포인트 변경 이력. 1건 = 1행. 지우거나 고치지 않고 쌓기만 한다',
    );
    await comment(queryRunner, 'user_balance_histories', 'id', 'PK');
    await comment(queryRunner, 'user_balance_histories', 'user_id', '유저 (users.id)');
    await comment(
      queryRunner,
      'user_balance_histories',
      'type',
      '바뀐 이유. deposit: 입금 / withdraw: 출금',
    );
    await comment(queryRunner, 'user_balance_histories', 'points', '바뀐 포인트 (늘면 +, 줄면 -)');
    await comment(queryRunner, 'user_balance_histories', 'points_before', '반영 전 포인트');
    await comment(queryRunner, 'user_balance_histories', 'points_after', '반영 후 포인트');
    await comment(
      queryRunner,
      'user_balance_histories',
      'target_id',
      '원인이 된 행의 id. type 에 따라 가리키는 테이블이 달라 FK 없음 (deposit → transactions.id). (type, target_id) 유니크로 두 번 반영되지 않는다',
    );
    await comment(queryRunner, 'user_balance_histories', 'created_at', '기록 시각');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // user_balance_histories → ledger_entries (입금 이력만. 토큰은 transaction 에서 다시 채우고, points_after 는 토큰별로 다시 계산)
    await queryRunner.query(`
      CREATE TABLE "ledger_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "currency_id" uuid NOT NULL,
        "type" character varying(20) NOT NULL,
        "points" numeric(38,6) NOT NULL,
        "points_after" numeric(38,6) NOT NULL,
        "transaction_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ledger_entries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ledger_entries_type_transaction" UNIQUE ("type", "transaction_id"),
        CONSTRAINT "FK_ledger_entries_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_ledger_entries_currency" FOREIGN KEY ("currency_id")
          REFERENCES "currencies" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_ledger_entries_transaction" FOREIGN KEY ("transaction_id")
          REFERENCES "transactions" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entries_user" ON "ledger_entries" ("user_id", "created_at")`,
    );
    await queryRunner.query(`
      INSERT INTO "ledger_entries"
        ("id", "user_id", "currency_id", "type", "points", "points_after", "transaction_id", "created_at")
      SELECT "id", "user_id", "currency_id", "type", "points",
        SUM("points") OVER (PARTITION BY "user_id", "currency_id" ORDER BY "created_at", "id"),
        "target_id", "created_at"
      FROM (
        SELECT h.*, t."currency_id"
        FROM "user_balance_histories" h JOIN "transactions" t ON t."id" = h."target_id" AND h."type" = 'deposit'
      ) e
    `);
    await queryRunner.query(`DROP TABLE "user_balance_histories"`);

    // user_balances: 토큰별로 다시 나눈다
    await queryRunner.query(`DROP TABLE "user_balances"`);
    await queryRunner.query(`
      CREATE TABLE "user_balances" (
        "user_id" uuid NOT NULL,
        "currency_id" uuid NOT NULL,
        "points" numeric(38,6) NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_balances" PRIMARY KEY ("user_id", "currency_id"),
        CONSTRAINT "FK_user_balances_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_balances_currency" FOREIGN KEY ("currency_id")
          REFERENCES "currencies" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      INSERT INTO "user_balances" ("user_id", "currency_id", "points", "updated_at")
      SELECT "user_id", "currency_id", SUM("points"), MAX("created_at")
      FROM "ledger_entries" GROUP BY "user_id", "currency_id"
    `);

    // 되돌린 두 테이블의 COMMENT (AddTableComments 와 같은 내용)
    await comment(
      queryRunner,
      'user_balances',
      null,
      '유저 × 토큰별 현재 포인트. LedgerService 로만 바뀌고, 바뀔 때마다 ledger_entries 에 이력이 남는다',
    );
    await comment(queryRunner, 'user_balances', 'user_id', 'PK. 유저 (users.id)');
    await comment(queryRunner, 'user_balances', 'currency_id', 'PK. 토큰 (currencies.id)');
    await comment(queryRunner, 'user_balances', 'points', '현재 포인트 (소수 6자리)');
    await comment(queryRunner, 'user_balances', 'updated_at', '마지막으로 바뀐 시각');
    await comment(
      queryRunner,
      'ledger_entries',
      null,
      '포인트 원장. 포인트가 바뀐 이력 1건 = 1행. 지우거나 고치지 않고 쌓기만 한다',
    );
    await comment(queryRunner, 'ledger_entries', 'id', 'PK');
    await comment(queryRunner, 'ledger_entries', 'user_id', '유저 (users.id)');
    await comment(queryRunner, 'ledger_entries', 'currency_id', '토큰 (currencies.id)');
    await comment(queryRunner, 'ledger_entries', 'type', '바뀐 이유 (지금은 deposit 만 있다)');
    await comment(queryRunner, 'ledger_entries', 'points', '바뀐 포인트 (늘면 +, 줄면 -)');
    await comment(queryRunner, 'ledger_entries', 'points_after', '반영 후 포인트');
    await comment(
      queryRunner,
      'ledger_entries',
      'transaction_id',
      '원인이 된 입금 (transactions.id). (type, transaction_id) 유니크로 두 번 반영되지 않는다',
    );
    await comment(queryRunner, 'ledger_entries', 'created_at', '기록 시각');
  }
}

async function comment(
  queryRunner: QueryRunner,
  table: string,
  column: string | null,
  text: string,
): Promise<void> {
  const target = column ? `COLUMN "${table}"."${column}"` : `TABLE "${table}"`;
  await queryRunner.query(`COMMENT ON ${target} IS '${text.replace(/'/g, "''")}'`);
}
