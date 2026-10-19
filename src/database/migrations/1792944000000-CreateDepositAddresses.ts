import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 유저에게 발급한 입금 주소. 유저 1명 = SweepFactory 1개당 입금 주소 1개.
 * 주소 = SweepFactory.predictAddress(keccak256(user_id))
 */
export class CreateDepositAddresses1792944000000 implements MigrationInterface {
  name = 'CreateDepositAddresses1792944000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "deposit_addresses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "chain_id" integer NOT NULL,
        "factory_address" character varying(42) NOT NULL,
        "salt" character varying(66) NOT NULL,
        "address" character varying(42) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deposit_addresses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_deposit_addresses_user" UNIQUE ("chain_id", "factory_address", "user_id"),
        CONSTRAINT "UQ_deposit_addresses_address" UNIQUE ("chain_id", "address"),
        CONSTRAINT "FK_deposit_addresses_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "deposit_addresses"`);
  }
}
