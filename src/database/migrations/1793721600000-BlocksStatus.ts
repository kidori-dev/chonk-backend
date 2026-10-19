import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * blocks.logs_scanned 를 블록 상태(status) 하나로 바꾼다.
 *
 *   unfinalized → finalized → scanned
 *   - unfinalized: polling-block 이 저장한 블록. 아직 reorg 로 바뀔 수 있다
 *   - finalized:   polling-deposit 이 노드의 finalized 블록과 맞춰 확정한 블록. 입금 확인 대기
 *   - scanned:     polling-deposit 이 입금(Transfer 로그)까지 확인한 블록
 */
export class BlocksStatus1793721600000 implements MigrationInterface {
  name = 'BlocksStatus1793721600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "blocks" ADD "status" character varying(12) NOT NULL DEFAULT 'unfinalized'`,
    );
    await queryRunner.query(`UPDATE "blocks" SET "status" = 'scanned' WHERE "logs_scanned" = true`);
    await queryRunner.query(`DROP INDEX "IDX_blocks_logs_not_scanned"`);
    await queryRunner.query(`ALTER TABLE "blocks" DROP COLUMN "logs_scanned"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_blocks_not_scanned" ON "blocks" ("chain_id", "status", "number") WHERE "status" <> 'scanned'`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "blocks" IS 'polling-block 이 저장한 최신 블록. 상태: unfinalized → finalized → scanned'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "blocks"."status" IS ` +
        `'unfinalized: 저장됨, 아직 reorg 로 바뀔 수 있음 (polling-block 이 되감을 수 있다) / ` +
        `finalized: 노드의 finalized 블록과 맞춰 확정됨, 입금 확인 대기 / ` +
        `scanned: polling-deposit 이 입금(Transfer 로그)까지 확인함'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_blocks_not_scanned"`);
    await queryRunner.query(
      `ALTER TABLE "blocks" ADD "logs_scanned" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`UPDATE "blocks" SET "logs_scanned" = true WHERE "status" = 'scanned'`);
    await queryRunner.query(`ALTER TABLE "blocks" DROP COLUMN "status"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_blocks_logs_not_scanned" ON "blocks" ("chain_id", "number") WHERE "logs_scanned" = false`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "blocks"."logs_scanned" IS 'polling-deposit 이 이 블록의 토큰 입금(Transfer 로그)을 확인했는지. finalized 된 블록만 확인한다'`,
    );
  }
}
