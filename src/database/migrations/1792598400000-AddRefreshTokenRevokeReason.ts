import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 리프레시 토큰이 왜 폐기됐는지 남긴다.
 * 로그아웃(logout)으로 폐기된 토큰은 다시 들어와도 탈취(재사용)로 보지 않기 위해 필요하다.
 */
export class AddRefreshTokenRevokeReason1792598400000 implements MigrationInterface {
  name = 'AddRefreshTokenRevokeReason1792598400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "revoke_reason" character varying(20)`,
    );
    // 이미 폐기된 행은 사유를 알 수 없으니, 재사용 감지가 계속 걸리도록 rotated 로 채운다
    await queryRunner.query(
      `UPDATE "refresh_tokens" SET "revoke_reason" = 'rotated' WHERE "revoked_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "revoke_reason"`);
  }
}
