import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { User } from '../../modules/users/entities/user.entity';
import { AuthenticatedRequest } from '../guards/jwt-auth.guard';

/** JwtAuthGuard 가 찾아둔 로그인 유저. 예) me(@CurrentUser() user: User) */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
