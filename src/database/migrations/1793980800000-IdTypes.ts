import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * id 타입 정리.
 *
 * - 외부에 노출되지 않고 행이 계속 쌓이는 내부 테이블은 bigint identity (작고 순서대로 쌓여 인덱스가 가볍다)
 *   transactions, user_balance_histories, sweep_items
 *   (blocks 는 원래 (chain_id, number) 가 PK 라 id 가 없다)
 * - 나머지는 uuid 를 유지하고 기본값만 uuidv7() 로 바꾼다 (시간순 uuid. Postgres 18 내장 함수)
 *   users, currencies, deposit_addresses, refresh_tokens, sweep_contracts, sweeps
 *   기존 행의 id 는 그대로 둔다 (users.id 는 입금 주소 salt 라 바뀌면 안 된다)
 *
 * 컬럼 순서를 지키려고 컬럼을 새로 만들지 않고 ALTER COLUMN ... TYPE ... USING 으로 바꾼다.
 * user_balance_histories.target_id 도 transactions.id 를 따라 bigint 가 된다.
 */
const UUID_TABLES = [
  'users',
  'currencies',
  'deposit_addresses',
  'refresh_tokens',
  'sweep_contracts',
  'sweeps',
];

export class IdTypes1793980800000 implements MigrationInterface {
  name = 'IdTypes1793980800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of UUID_TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT uuidv7()`);
    }

    // 새 bigint id 를 먼저 채우고(created_at 순), target_id 를 새 transactions.id 로 옮긴 뒤 바꾼다
    for (const table of ['transactions', 'user_balance_histories', 'sweep_items']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "new_id" bigint`);
      await queryRunner.query(`
        UPDATE "${table}" x SET "new_id" = r."n"
        FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS "n" FROM "${table}") r
        WHERE r."id" = x."id"
      `);
    }
    await queryRunner.query(`ALTER TABLE "user_balance_histories" ADD "new_target_id" bigint`);
    await queryRunner.query(`
      UPDATE "user_balance_histories" h SET "new_target_id" = t."new_id"
      FROM "transactions" t WHERE h."type" = 'deposit' AND t."id" = h."target_id"
    `);
    await swapColumn(queryRunner, 'user_balance_histories', 'target_id', 'new_target_id', 'bigint');

    for (const table of ['transactions', 'user_balance_histories', 'sweep_items']) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "id" DROP DEFAULT`);
      await swapColumn(queryRunner, table, 'id', 'new_id', 'bigint');
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY`,
      );
      await queryRunner.query(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), MAX("id")) FROM "${table}"`,
      );
    }

    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."target_id" IS ` +
        `'원인이 된 행의 id. type 에 따라 가리키는 테이블이 달라 FK 없음 (deposit → transactions.id). ` +
        `(type, target_id) 유니크로 두 번 반영되지 않는다'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['transactions', 'user_balance_histories', 'sweep_items']) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "id" DROP IDENTITY`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "new_id" uuid NOT NULL DEFAULT gen_random_uuid()`,
      );
    }
    await queryRunner.query(`ALTER TABLE "user_balance_histories" ADD "new_target_id" uuid`);
    await queryRunner.query(`
      UPDATE "user_balance_histories" h SET "new_target_id" = t."new_id"
      FROM "transactions" t WHERE h."type" = 'deposit' AND t."id" = h."target_id"
    `);
    await swapColumn(queryRunner, 'user_balance_histories', 'target_id', 'new_target_id', 'uuid');

    for (const table of ['transactions', 'user_balance_histories', 'sweep_items']) {
      await swapColumn(queryRunner, table, 'id', 'new_id', 'uuid');
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
      );
    }

    for (const table of UUID_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
      );
    }
  }
}

/**
 * column 의 타입을 바꾸고 값을 from 컬럼 값으로 채운 뒤 from 을 지운다. 컬럼 위치는 그대로다.
 * (PK / UNIQUE 같은 인덱스는 Postgres 가 새 타입으로 다시 만든다)
 */
async function swapColumn(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  from: string,
  type: string,
): Promise<void> {
  await queryRunner.query(
    `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE ${type} USING "${from}"`,
  );
  await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "${from}"`);
}
