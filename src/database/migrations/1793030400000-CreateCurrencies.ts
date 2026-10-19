import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 취급하는 자산(currency) 목록. sweep / balances 는 여기 등록된 자산만 다룬다.
 * 네이티브 코인(ETH)은 address 가 0x0000000000000000000000000000000000000000 이다.
 */
export class CreateCurrencies1793030400000 implements MigrationInterface {
  name = 'CreateCurrencies1793030400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "currencies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chain_id" integer NOT NULL,
        "symbol" character varying(32) NOT NULL,
        "decimals" integer NOT NULL,
        "address" character varying(42) NOT NULL,
        "is_native" boolean NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_currencies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_currencies_chain_address" UNIQUE ("chain_id", "address"),
        CONSTRAINT "UQ_currencies_chain_symbol" UNIQUE ("chain_id", "symbol")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "currencies"`);
  }
}
