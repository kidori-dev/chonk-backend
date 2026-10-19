import { MigrationInterface, QueryRunner } from 'typeorm';

/** 조회한 블록을 저장하는 blocks 테이블 */
export class CreateBlocks1792339200000 implements MigrationInterface {
  name = 'CreateBlocks1792339200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "blocks" (
        "number" bigint NOT NULL,
        "hash" character varying(66) NOT NULL,
        "parent_hash" character varying(66) NOT NULL,
        "tx_count" integer NOT NULL,
        "block_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_blocks" PRIMARY KEY ("number")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "blocks"`);
  }
}
