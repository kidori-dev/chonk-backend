import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 입금 확인을 finalized 블록이 아니라 최신 블록에서 DEPOSIT_CONFIRMATIONS(기본 10) 블록 지난 블록에서 한다.
 *
 * - blocks.status(unfinalized / finalized) 삭제: 노드의 finalized 블록을 더는 확인하지 않는다.
 *   reorg 는 polling-block(parentHash 비교)과 polling-deposit(로그의 blockHash 비교)이 잡는다
 * - IDX_blocks_to_scan: 확인 대기 블록은 is_scanned = false 만으로 찾는다
 */
export class DepositConfirmations1794412800000 implements MigrationInterface {
  name = 'DepositConfirmations1794412800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 인덱스 조건에 status 가 들어 있어서 컬럼보다 먼저 지운다
    await queryRunner.query(`DROP INDEX "IDX_blocks_to_scan"`);
    await queryRunner.query(`ALTER TABLE "blocks" DROP COLUMN "status"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_blocks_to_scan" ON "blocks" ("chain_id", "number") WHERE "is_scanned" = false`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "blocks" IS 'polling-block 이 저장한 최신 블록. is_scanned 로 입금 확인 여부를 남긴다'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "blocks"."is_scanned" IS ` +
        `'polling-deposit 이 이 블록의 입금(Transfer 로그)을 확인했는지. 최신 블록에서 DEPOSIT_CONFIRMATIONS(기본 10) 블록 지난 블록만 확인한다. ` +
        `true 인 블록이 reorg 로 바뀌면 polling-block 이 멈춘다'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_blocks_to_scan"`);
    // 컬럼 순서는 되돌리지 않는다 (맨 뒤에 붙는다). 어느 블록이 finalized 였는지는 남아 있지 않아서
    // 입금 확인을 끝낸 블록을 finalized 로 둔다 (이전 방식은 finalized 블록만 확인했다)
    await queryRunner.query(
      `ALTER TABLE "blocks" ADD "status" character varying(12) NOT NULL DEFAULT 'unfinalized'`,
    );
    await queryRunner.query(`UPDATE "blocks" SET "status" = 'finalized' WHERE "is_scanned" = true`);
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
}
