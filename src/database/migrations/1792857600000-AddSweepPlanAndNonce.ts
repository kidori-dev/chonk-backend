import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * pending 으로 남은 sweep 을 나중에 정리(sweep-reconcile)할 수 있도록 두 값을 같이 저장한다.
 * - nonce: 같은 nonce 를 다른 트랜잭션이 썼는지 보고 버려진(dropped) 트랜잭션을 가려낸다
 * - plan: 어느 라벨/입금 주소/자산을 대상으로 보냈는지. 영수증 이벤트를 sweep_items 로 바꿀 때 쓴다
 */
export class AddSweepPlanAndNonce1792857600000 implements MigrationInterface {
  name = 'AddSweepPlanAndNonce1792857600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sweeps" ADD "nonce" integer`);
    await queryRunner.query(`ALTER TABLE "sweeps" ADD "plan" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sweeps" DROP COLUMN "plan"`);
    await queryRunner.query(`ALTER TABLE "sweeps" DROP COLUMN "nonce"`);
  }
}
