import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * sweep 실행 기록.
 * - sweeps: sweep 트랜잭션 1건 = 1행 (상태, tx hash, 가스비)
 * - sweep_items: 그 트랜잭션에서 실제로 옮긴 금액 1건 = 1행 (입금 주소, 자산, 수량)
 */
export class CreateSweeps1792771200000 implements MigrationInterface {
  name = 'CreateSweeps1792771200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sweeps" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chain_id" integer NOT NULL,
        "factory_address" character varying(42) NOT NULL,
        "treasury_address" character varying(42) NOT NULL,
        "executor_address" character varying(42) NOT NULL,
        "tx_hash" character varying(66) NOT NULL,
        "status" character varying(10) NOT NULL,
        "block_number" bigint,
        "gas_used" numeric(78,0),
        "fee_wei" numeric(78,0),
        "error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sweeps" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sweeps_chain_tx_hash" UNIQUE ("chain_id", "tx_hash")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sweep_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "sweep_id" uuid NOT NULL,
        "label" character varying(255) NOT NULL,
        "salt" character varying(66) NOT NULL,
        "wallet_address" character varying(42) NOT NULL,
        "wallet_deployed" boolean NOT NULL,
        "token_address" character varying(42) NOT NULL,
        "token_symbol" character varying(32) NOT NULL,
        "token_decimals" integer NOT NULL,
        "amount" numeric(78,0) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sweep_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sweep_items_sweep" FOREIGN KEY ("sweep_id")
          REFERENCES "sweeps" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_sweep_items_sweep_id" ON "sweep_items" ("sweep_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_sweep_items_label" ON "sweep_items" ("label")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sweep_items"`);
    await queryRunner.query(`DROP TABLE "sweeps"`);
  }
}
