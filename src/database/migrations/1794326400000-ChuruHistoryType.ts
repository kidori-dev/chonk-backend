import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chonk 고양이에게 츄르 주기 (POST /api/points/churu).
 *
 * 테이블은 그대로고 user_balance_histories.type 에 churu(츄르 주기로 차감) 가 추가된다.
 * 원인이 되는 행이 없어서 target_id 는 null (null 은 (type, target_id) 유니크에 걸리지 않는다).
 */
export class ChuruHistoryType1794326400000 implements MigrationInterface {
  name = 'ChuruHistoryType1794326400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."type" IS ` +
        `'바뀐 이유. deposit: 입금 / withdraw: 출금 / bet: 배팅으로 차감 / bet_payout: 배팅 정산으로 지급 / churu: 고양이에게 츄르 주기로 차감'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."target_id" IS ` +
        `'원인이 된 행의 id. type 에 따라 가리키는 테이블이 달라 FK 없음 (deposit → transactions.id, bet/bet_payout → bets.id, churu → null). ` +
        `(type, target_id) 유니크로 두 번 반영되지 않는다'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."type" IS ` +
        `'바뀐 이유. deposit: 입금 / withdraw: 출금 / bet: 배팅으로 차감 / bet_payout: 배팅 정산으로 지급'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."target_id" IS ` +
        `'원인이 된 행의 id. type 에 따라 가리키는 테이블이 달라 FK 없음 (deposit → transactions.id, bet/bet_payout → bets.id). ` +
        `(type, target_id) 유니크로 두 번 반영되지 않는다'`,
    );
  }
}
