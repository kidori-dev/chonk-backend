import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 폐기 사유
 * - rotated: 재발급에 사용됨
 * - logout: 로그아웃
 * - reuse_detected: 다른 토큰의 재사용(탈취)이 감지돼 함께 폐기됨
 */
export type RevokeReason = 'rotated' | 'logout' | 'reuse_detected';

/**
 * 발급한 리프레시 토큰 한 개 = 한 행.
 * 토큰 원문은 저장하지 않고 SHA-256 해시만 저장한다 (DB 가 유출돼도 토큰을 쓸 수 없게).
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /** 사용(교체)됐거나 로그아웃된 시각. null 이면 아직 쓸 수 있다 */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoke_reason', type: 'varchar', length: 20, nullable: true })
  revokeReason!: RevokeReason | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
