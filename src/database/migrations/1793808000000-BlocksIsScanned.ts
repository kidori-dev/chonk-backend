import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * blocks.status 에서 'scanned' 를 떼어내 is_scanned 플래그로 분리한다.
 * - status:     체인 기준 상태 (unfinalized / finalized)
 * - is_scanned: polling-deposit 이 입금(Transfer 로그)을 확인했는지
 */
export class BlocksIsScanned1793808000000 implements MigrationInterface {
  name = 'BlocksIsScanned1793808000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "blocks" ADD "is_scanned" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(
      `UPDATE "blocks" SET "is_scanned" = true, "status" = 'finalized' WHERE "status" = 'scanned'`,
    );

    await queryRunner.query(`DROP INDEX "IDX_blocks_not_scanned"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_blocks_to_scan" ON "blocks" ("chain_id", "number") WHERE "status" = 'finalized' AND "is_scanned" = false`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "blocks" IS 'polling-block 이 저장한 최신 블록. status(unfinalized → finalized) + is_scanned(입금 확인 여부)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "blocks"."status" IS ` +
        `'unfinalized: 저장됨, 아직 reorg 로 바뀔 수 있음 (polling-block 이 되감을 수 있다) / ` +
        `finalized: 노드의 finalized 블록과 맞춰 확정됨 (polling-deposit 이 바꾼다)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "blocks"."is_scanned" IS 'polling-deposit 이 이 블록의 입금(Transfer 로그)을 확인했는지. finalized 블록만 확인한다'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_blocks_to_scan"`);
    await queryRunner.query(`UPDATE "blocks" SET "status" = 'scanned' WHERE "is_scanned" = true`);
    await queryRunner.query(`ALTER TABLE "blocks" DROP COLUMN "is_scanned"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_blocks_not_scanned" ON "blocks" ("chain_id", "status", "number") WHERE "status" <> 'scanned'`,
    );
  }
}
