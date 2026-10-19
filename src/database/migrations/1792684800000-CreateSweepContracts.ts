import { MigrationInterface, QueryRunner } from 'typeorm';

/** 배포한 SweepFactory 컨트랙트 정보 */
export class CreateSweepContracts1792684800000 implements MigrationInterface {
  name = 'CreateSweepContracts1792684800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sweep_contracts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chain_id" integer NOT NULL,
        "factory_address" character varying(42) NOT NULL,
        "implementation_address" character varying(42) NOT NULL,
        "owner_address" character varying(42) NOT NULL,
        "treasury_address" character varying(42) NOT NULL,
        "deploy_tx_hash" character varying(66) NOT NULL,
        "deploy_block_number" bigint NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sweep_contracts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sweep_contracts_chain_factory" UNIQUE ("chain_id", "factory_address")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sweep_contracts"`);
  }
}
