import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { JwtPayload } from '../../modules/auth/auth.service';
import { User } from '../../modules/users/entities/user.entity';
import { UsersService } from '../../modules/users/users.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export type AuthenticatedRequest = Request & { user: User };

/**
 * 모든 API 에 전역으로 걸리는 인증 가드. (@Public() 이 붙은 API 는 통과)
 *
 * 1. Authorization: Bearer <토큰> 헤더에서 토큰을 꺼낸다
 * 2. 서명과 만료를 검사한다
 * 3. 토큰의 유저를 DB 에서 다시 읽어, 지워졌거나 비활성화·정지된 유저면 막는다 (정지 즉시 배팅도 막힌다)
 * 4. 통과하면 request.user 에 유저를 넣는다 (@CurrentUser() 로 꺼내 쓴다)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('토큰이 유효하지 않거나 만료되었습니다.');
    }

    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive || user.suspendedAt) {
      throw new UnauthorizedException('사용할 수 없는 계정입니다.');
    }

    request.user = user;
    return true;
  }
}

function extractBearerToken(request: Request): string | null {
  const [type, token] = request.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' && token ? token : null;
}
