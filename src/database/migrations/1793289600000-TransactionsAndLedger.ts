import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 입금 처리 구조 변경 + 유저 잔고 원장.
 *
 * - blocks.logs_scanned: 이 블록의 ERC20 Transfer 로그를 polling-deposit 이 확인했는지.
 *   블록 여러 개를 모아 eth_getLogs 한 번으로 확인하고 한꺼번에 true 로 바꾼다.
 * - transactions: 감지한 우리 입금 트랜잭션 (deposits 를 대체한다. deposits 는 비어 있는 상태에서 지운다)
 * - user_balances: 유저 × 자산별 현재 잔고
 * - ledger_entries: 잔고가 바뀐 이력 (원장). transaction 하나는 한 번만 반영된다
 */
export class TransactionsAndLedger1793289600000 implements MigrationInterface {
  name = 'TransactionsAndLedger1793289600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "blocks" ADD "logs_scanned" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blocks_logs_not_scanned" ON "blocks" ("number") WHERE "logs_scanned" = false`,
    );

    await queryRunner.query(`DROP TABLE "deposits"`);

    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chain_id" integer NOT NULL,
        "type" character varying(16) NOT NULL,
        "user_id" uuid NOT NULL,
        "currency_id" uuid NOT NULL,
        "address" character varying(42) NOT NULL,
        "from_address" character varying(42) NOT NULL,
        "amount" numeric(78,0) NOT NULL,
        "tx_hash" character varying(66) NOT NULL,
        "log_index" integer NOT NULL,
        "block_number" bigint NOT NULL,
        "block_hash" character varying(66) NOT NULL,
        "block_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transactions_chain_tx_log" UNIQUE ("chain_id", "tx_hash", "log_index"),
        CONSTRAINT "FK_transactions_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_transactions_currency" FOREIGN KEY ("currency_id")
          REFERENCES "currencies" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_user_id" ON "transactions" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_balances" (
        "user_id" uuid NOT NULL,
        "currency_id" uuid NOT NULL,
        "balance" numeric(78,0) NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_balances" PRIMARY KEY ("user_id", "currency_id"),
        CONSTRAINT "FK_user_balances_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_balances_currency" FOREIGN KEY ("currency_id")
          REFERENCES "currencies" ("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ledger_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "currency_id" uuid NOT NULL,
        "type" character varying(20) NOT NULL,
        "amount" numeric(78,0) NOT NULL,
        "balance_after" numeric(78,0) NOT NULL,
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ledger_entries"`);
    await queryRunner.query(`DROP TABLE "user_balances"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP INDEX "IDX_blocks_logs_not_scanned"`);
    await queryRunner.query(`ALTER TABLE "blocks" DROP COLUMN "logs_scanned"`);
    // 이어서 CreateDeposits 를 되돌릴 때 DROP 할 대상이 있도록 빈 deposits 테이블만 만든다
    await queryRunner.query(`
      CREATE TABLE "deposits" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        CONSTRAINT "PK_deposits" PRIMARY KEY ("id")
      )
    `);
  }
}
