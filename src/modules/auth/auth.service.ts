import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { TokenResponseDto } from './dto/token.response.dto';
import { RefreshTokensService } from './refresh-tokens.service';

/**
 * 없는 이메일로 로그인할 때 시간을 맞추려고 비교하는 bcrypt 해시.
 * 비교 결과는 쓰지 않는다 (유저가 없으면 무조건 실패)
 */
const DUMMY_PASSWORD_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.a4fBvF7SvYyoZ5lHbHTJBq5RGqGm';

/** 액세스 토큰(JWT) 안에 들어가는 값. sub = 유저 id */
export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly config: ConfigService,
  ) {}

  /** 이메일/비밀번호를 확인하고 토큰을 발급한다 */
  async login(email: string, password: string): Promise<{ tokens: TokenResponseDto; user: User }> {
    const user = await this.users.findByEmailWithPassword(email);

    // 이메일이 없는지 비밀번호가 틀렸는지는 알려주지 않는다 (가입된 이메일 추측 방지).
    // 없는 이메일도 같은 시간이 걸리도록 가짜 해시로 비교한다 (응답 속도로 가입 여부를 알 수 없게)
    const passwordOk = await this.users.verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordOk) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }
    if (user.suspendedAt) {
      throw new UnauthorizedException('정지된 계정입니다.');
    }

    await this.users.touchLastLogin(user.id);
    return { tokens: await this.issueTokens(user), user };
  }

  /** 회원가입. 유저를 만들고 바로 로그인한 것처럼 토큰을 발급한다. 이미 있는 이메일이면 409 */
  async register(input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<{ tokens: TokenResponseDto; user: User }> {
    const user = await this.users.create(input);
    await this.users.touchLastLogin(user.id);
    return { tokens: await this.issueTokens(user), user };
  }

  /** 리프레시 토큰을 새 액세스 토큰 + 새 리프레시 토큰으로 바꾼다 (쓴 리프레시 토큰은 폐기) */
  async refresh(refreshToken: string): Promise<TokenResponseDto> {
    const userId = await this.refreshTokens.consume(refreshToken);

    const user = await this.users.findById(userId);
    if (!user || !user.isActive || user.suspendedAt) {
      throw new UnauthorizedException('사용할 수 없는 계정입니다.');
    }

    return this.issueTokens(user);
  }

  /** 리프레시 토큰을 폐기한다. 액세스 토큰은 만료될 때까지 남아 있으니 클라이언트에서도 버린다 */
  logout(refreshToken: string): Promise<void> {
    return this.refreshTokens.revoke(refreshToken);
  }

  private async issueTokens(user: User): Promise<TokenResponseDto> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      refreshToken: await this.refreshTokens.issue(user.id),
      tokenType: 'Bearer',
      expiresIn: this.config.get<number>('jwt.expiresInSeconds')!,
      refreshExpiresIn: this.config.get<number>('jwt.refreshExpiresInSeconds')!,
    };
  }
}
