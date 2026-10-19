import { MigrationInterface, QueryRunner } from 'typeorm';

/** 자산별 최소 sweep 금액 (최소 단위). 잔액이 이보다 적으면 가스비가 아까우니 sweep 하지 않는다 */
export class AddCurrencyMinSweepAmount1793116800000 implements MigrationInterface {
  name = 'AddCurrencyMinSweepAmount1793116800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "currencies" ADD "min_sweep_amount" numeric(78,0) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "currencies" DROP COLUMN "min_sweep_amount"`);
  }
}
