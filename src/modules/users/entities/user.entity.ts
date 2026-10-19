import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 로그인하는 유저 한 명 = 한 행 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 로그인 아이디. 소문자로 저장한다 */
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  /** bcrypt 해시. 실수로 응답에 섞이지 않게 기본 조회에서 빠진다 (select: false) */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  /** false 면 로그인과 API 사용이 막힌다 */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
