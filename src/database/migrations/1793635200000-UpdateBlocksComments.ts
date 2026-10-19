import { MigrationInterface, QueryRunner } from 'typeorm';

/** polling-block 이 최신 블록을 저장하고, polling-deposit 이 finalized 블록만 확인하도록 바뀐 것에 맞춰 설명을 고친다 */
export class UpdateBlocksComments1793635200000 implements MigrationInterface {
  name = 'UpdateBlocksComments1793635200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `COMMENT ON TABLE "blocks" IS 'polling-block 이 저장한 최신 블록. reorg 로 빠진 블록은 지우고 다시 받는다'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "blocks"."parent_hash" IS '앞 블록 hash. 저장된 앞 블록과 다르면 reorg 로 보고 앞 블록을 지운 뒤 다시 받는다'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "blocks"."logs_scanned" IS 'polling-deposit 이 이 블록의 토큰 입금(Transfer 로그)을 확인했는지. finalized 된 블록만 확인한다'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `COMMENT ON TABLE "blocks" IS 'polling-block 이 저장한 확정 블록 (최신에서 DEPOSIT_CONFIRMATIONS 만큼 지난 블록)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "blocks"."parent_hash" IS '앞 블록 hash. 저장된 앞 블록과 다르면 reorg 로 보고 멈춘다'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "blocks"."logs_scanned" IS 'polling-deposit 이 이 블록의 토큰 입금(Transfer 로그)을 확인했는지'`,
    );
  }
}
