import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * blocks 에 chain_id 를 추가한다. 다른 체인의 블록 번호가 섞이지 않게 (chain_id, number) 를 PK 로 바꾼다.
 * (CHAIN_ID 를 바꾸면 polling-block / polling-deposit 이 다른 체인의 블록 번호부터 이어가던 문제)
 *
 * 이미 저장된 블록은 마이그레이션을 실행하는 시점의 .env CHAIN_ID 체인 블록으로 본다.
 */
export class AddBlocksChainId1793462400000 implements MigrationInterface {
  name = 'AddBlocksChainId1793462400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ count }] = (await queryRunner.query(
      `SELECT count(*)::int AS count FROM "blocks"`,
    )) as {
      count: number;
    }[];
    const chainId = Number(process.env.CHAIN_ID);
    if (count > 0 && !Number.isInteger(chainId)) {
      throw new Error('blocks 에 기존 행이 있어 .env 의 CHAIN_ID 가 필요합니다.');
    }

    await queryRunner.query(`ALTER TABLE "blocks" ADD "chain_id" integer`);
    await queryRunner.query(`UPDATE "blocks" SET "chain_id" = $1`, [chainId]);
    await queryRunner.query(`ALTER TABLE "blocks" ALTER COLUMN "chain_id" SET NOT NULL`);

    await queryRunner.query(`ALTER TABLE "blocks" DROP CONSTRAINT "PK_blocks"`);
    await queryRunner.query(
      `ALTER TABLE "blocks" ADD CONSTRAINT "PK_blocks" PRIMARY KEY ("chain_id", "number")`,
    );

    await queryRunner.query(`DROP INDEX "IDX_blocks_logs_not_scanned"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_blocks_logs_not_scanned" ON "blocks" ("chain_id", "number") WHERE "logs_scanned" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_blocks_logs_not_scanned"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_blocks_logs_not_scanned" ON "blocks" ("number") WHERE "logs_scanned" = false`,
    );
    await queryRunner.query(`ALTER TABLE "blocks" DROP CONSTRAINT "PK_blocks"`);
    await queryRunner.query(
      `ALTER TABLE "blocks" ADD CONSTRAINT "PK_blocks" PRIMARY KEY ("number")`,
    );
    await queryRunner.query(`ALTER TABLE "blocks" DROP COLUMN "chain_id"`);
  }
}
