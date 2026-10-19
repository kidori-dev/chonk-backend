import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 감지한 입금. 입금 1건(ERC20 Transfer 로그 1개 또는 ETH 송금 트랜잭션 1개) = 1행.
 * ETH 송금은 로그가 없으므로 log_index 를 -1 로 둔다. (chain_id, tx_hash, log_index) 로 중복을 막는다.
 */
export class CreateDeposits1793203200000 implements MigrationInterface {
  name = 'CreateDeposits1793203200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "deposits" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chain_id" integer NOT NULL,
        "user_id" uuid NOT NULL,
        "deposit_address" character varying(42) NOT NULL,
        "currency_id" uuid NOT NULL,
        "amount" numeric(78,0) NOT NULL,
        "from_address" character varying(42) NOT NULL,
        "tx_hash" character varying(66) NOT NULL,
        "log_index" integer NOT NULL,
        "block_number" bigint NOT NULL,
        "block_hash" character varying(66) NOT NULL,
        "block_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deposits" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_deposits_chain_tx_log" UNIQUE ("chain_id", "tx_hash", "log_index"),
        CONSTRAINT "FK_deposits_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_deposits_currency" FOREIGN KEY ("currency_id")
          REFERENCES "currencies" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_deposits_user_id" ON "deposits" ("user_id")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_deposits_block_number" ON "deposits" ("chain_id", "block_number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "deposits"`);
  }
}
