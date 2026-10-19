import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';

export interface CreateUserInput {
  email: string;
  password: string;
  name?: string | null;
}

/** users 테이블 읽기/쓰기 + 비밀번호 해시 */
@Injectable()
export class UsersService {
  private static readonly SALT_ROUNDS = 10;

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const email = normalizeEmail(input.email);
    if (await this.users.existsBy({ email })) {
      throw new ConflictException(`이미 존재하는 이메일입니다: ${email}`);
    }

    return this.users.save(
      this.users.create({
        email,
        passwordHash: await bcrypt.hash(input.password, UsersService.SALT_ROUNDS),
        name: input.name ?? null,
      }),
    );
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  /** id 또는 이메일로 찾는다 (@ 가 있으면 이메일) */
  findByIdOrEmail(idOrEmail: string): Promise<User | null> {
    return idOrEmail.includes('@')
      ? this.users.findOneBy({ email: normalizeEmail(idOrEmail) })
      : this.users.findOneBy({ id: idOrEmail });
  }

  /** 로그인 검사용. 평소엔 빠지는 passwordHash 까지 같이 읽는다 */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.users.update(id, { lastLoginAt: new Date() });
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
