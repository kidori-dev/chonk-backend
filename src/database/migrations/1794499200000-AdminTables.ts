import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 관리자 화면(chonk-admin-backend)용 테이블과 유저 정지.
 *
 * - users.suspended_at / suspended_reason: 관리자가 정지한 유저. is_active(계정 사용 여부)와는 따로 둔다.
 *   정지된 유저는 로그인·토큰 재발급·API(배팅 포함)가 막힌다
 * - admins: 관리자 계정. 일반 유저(users)와 로그인이 분리돼 있다
 * - admin_point_adjustments: 관리자가 직접 지급/차감한 포인트 1건 = 1행 (사유 포함)
 * - user_balance_histories.type 에 admin(관리자 지급/차감) 이 추가된다. target_id = admin_point_adjustments.id
 * - refresh_tokens.revoke_reason 에 suspended / password_reset 이 추가된다 (컬럼은 그대로)
 */
export class AdminTables1794499200000 implements MigrationInterface {
  name = 'AdminTables1794499200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "suspended_at" TIMESTAMP WITH TIME ZONE, ADD "suspended_reason" character varying(200)`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "users"."suspended_at" IS '관리자가 정지한 시각. null 이 아니면 로그인·토큰 재발급·API(배팅 포함)가 막힌다'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "users"."suspended_reason" IS '정지 사유 (관리자 입력). 정지 해제하면 null'`,
    );

    await queryRunner.query(`
      CREATE TABLE "admins" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "name" character varying(100),
        "is_active" boolean NOT NULL DEFAULT true,
        "last_login_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admins" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admins_email" UNIQUE ("email")
      )
    `);
    await comments(
      queryRunner,
      'admins',
      '관리자 계정 (chonk-admin-backend 로그인). 일반 유저(users)와 따로',
      [
        ['email', '로그인 아이디. 소문자로 저장'],
        ['password_hash', 'bcrypt 해시'],
        ['name', '이름 (화면 표시용)'],
        ['is_active', 'false 면 로그인과 관리자 API 사용이 막힌다'],
        ['last_login_at', '마지막 로그인 시각'],
        ['created_at', '만든 시각'],
        ['updated_at', '마지막으로 바뀐 시각'],
      ],
    );

    await queryRunner.query(`
      CREATE TABLE "admin_point_adjustments" (
        "id" bigint GENERATED ALWAYS AS IDENTITY,
        "user_id" uuid NOT NULL,
        "admin_id" uuid NOT NULL,
        "points" numeric(38,6) NOT NULL,
        "reason" character varying(200) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_point_adjustments" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_admin_point_adjustments_points" CHECK ("points" <> 0),
        CONSTRAINT "FK_admin_point_adjustments_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_admin_point_adjustments_admin" FOREIGN KEY ("admin_id") REFERENCES "admins" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_point_adjustments_user" ON "admin_point_adjustments" ("user_id", "id")`,
    );
    await comments(
      queryRunner,
      'admin_point_adjustments',
      '관리자가 직접 지급/차감한 포인트 1건 = 1행. user_balance_histories(type = admin, target_id = 이 id) 와 같이 남는다',
      [
        ['id', 'bigint identity'],
        ['user_id', '대상 유저 (users.id)'],
        ['admin_id', '처리한 관리자 (admins.id)'],
        ['points', '바꾼 포인트. 지급 +, 차감 -'],
        ['reason', '사유 (관리자 입력)'],
        ['created_at', '처리한 시각'],
      ],
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."type" IS ` +
        `'바뀐 이유. deposit: 입금 / withdraw: 출금 / bet: 배팅으로 차감 / bet_payout: 배팅 정산으로 지급 / churu: 고양이에게 츄르 주기로 차감 / admin: 관리자 지급·차감'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."target_id" IS ` +
        `'원인이 된 행의 id. type 에 따라 가리키는 테이블이 달라 FK 없음 (deposit → transactions.id, bet/bet_payout → bets.id, churu → null, admin → admin_point_adjustments.id). ` +
        `(type, target_id) 유니크로 두 번 반영되지 않는다'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."type" IS ` +
        `'바뀐 이유. deposit: 입금 / withdraw: 출금 / bet: 배팅으로 차감 / bet_payout: 배팅 정산으로 지급 / churu: 고양이에게 츄르 주기로 차감'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."target_id" IS ` +
        `'원인이 된 행의 id. type 에 따라 가리키는 테이블이 달라 FK 없음 (deposit → transactions.id, bet/bet_payout → bets.id, churu → null). ` +
        `(type, target_id) 유니크로 두 번 반영되지 않는다'`,
    );
    await queryRunner.query(`DROP TABLE "admin_point_adjustments"`);
    await queryRunner.query(`DROP TABLE "admins"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "suspended_reason", DROP COLUMN "suspended_at"`,
    );
  }
}

async function comments(
  queryRunner: QueryRunner,
  table: string,
  tableComment: string,
  columns: [string, string][],
): Promise<void> {
  await queryRunner.query(`COMMENT ON TABLE "${table}" IS '${tableComment.replace(/'/g, "''")}'`);
  for (const [column, comment] of columns) {
    await queryRunner.query(
      `COMMENT ON COLUMN "${table}"."${column}" IS '${comment.replace(/'/g, "''")}'`,
    );
  }
}
