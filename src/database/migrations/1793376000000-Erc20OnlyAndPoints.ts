import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERC-20 만 취급하고, 유저 잔고는 포인트로 쌓는다.
 *
 * - currencies: 네이티브 코인(ETH)을 받지 않으므로 is_native 를 없애고,
 *   point_ratio(토큰 1개당 포인트, 예: 1 USDT = 1 포인트)를 추가한다
 * - user_balances.balance → points (소수 6자리 포인트)
 * - ledger_entries.amount / balance_after → points / points_after (포인트 기준)
 */
export class Erc20OnlyAndPoints1793376000000 implements MigrationInterface {
  name = 'Erc20OnlyAndPoints1793376000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "currencies" WHERE "is_native" = true`);
    await queryRunner.query(`ALTER TABLE "currencies" DROP COLUMN "is_native"`);
    await queryRunner.query(
      `ALTER TABLE "currencies" ADD "point_ratio" numeric(38,6) NOT NULL DEFAULT 1`,
    );

    await queryRunner.query(`ALTER TABLE "user_balances" RENAME COLUMN "balance" TO "points"`);
    await queryRunner.query(`ALTER TABLE "user_balances" ALTER COLUMN "points" TYPE numeric(38,6)`);

    await queryRunner.query(`ALTER TABLE "ledger_entries" RENAME COLUMN "amount" TO "points"`);
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" RENAME COLUMN "balance_after" TO "points_after"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" ALTER COLUMN "points" TYPE numeric(38,6)`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" ALTER COLUMN "points_after" TYPE numeric(38,6)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" ALTER COLUMN "points_after" TYPE numeric(78,0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" ALTER COLUMN "points" TYPE numeric(78,0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" RENAME COLUMN "points_after" TO "balance_after"`,
    );
    await queryRunner.query(`ALTER TABLE "ledger_entries" RENAME COLUMN "points" TO "amount"`);
    await queryRunner.query(`ALTER TABLE "user_balances" ALTER COLUMN "points" TYPE numeric(78,0)`);
    await queryRunner.query(`ALTER TABLE "user_balances" RENAME COLUMN "points" TO "balance"`);
    await queryRunner.query(`ALTER TABLE "currencies" DROP COLUMN "point_ratio"`);
    await queryRunner.query(
      `ALTER TABLE "currencies" ADD "is_native" boolean NOT NULL DEFAULT false`,
    );
  }
}
