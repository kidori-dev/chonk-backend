import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { LoginRequestDto } from './dto/login.request.dto';
import { LoginResponseDto } from './dto/login.response.dto';
import { RefreshTokenRequestDto } from './dto/refresh-token.request.dto';
import { TokenResponseDto } from './dto/token.response.dto';
import { UserResponseDto } from './dto/user.response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/auth/login */
  @Public()
  // 비밀번호 무작위 대입을 막는다: 같은 IP 에서 1분에 5번까지
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '로그인',
    description: '성공하면 액세스 토큰(JWT)과 리프레시 토큰을 내려준다.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: '이메일 또는 비밀번호가 올바르지 않음' })
  async login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
    const { tokens, user } = await this.auth.login(dto.email, dto.password);
    return { ...tokens, user: UserResponseDto.from(user) };
  }

  /** POST /api/auth/refresh */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '토큰 재발급',
    description:
      '리프레시 토큰으로 새 액세스 토큰과 새 리프레시 토큰을 받는다. 보낸 리프레시 토큰은 폐기된다.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiUnauthorizedResponse({ description: '리프레시 토큰이 없거나, 만료됐거나, 이미 사용됨' })
  refresh(@Body() dto: RefreshTokenRequestDto): Promise<TokenResponseDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  /** POST /api/auth/logout */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '로그아웃',
    description: '리프레시 토큰을 폐기한다. 액세스 토큰은 클라이언트에서 버린다.',
  })
  @ApiNoContentResponse()
  logout(@Body() dto: RefreshTokenRequestDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  /** GET /api/auth/me (Authorization: Bearer <토큰> 필요) */
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 정보' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: '토큰이 없거나 유효하지 않음' })
  me(@CurrentUser() user: User): UserResponseDto {
    return UserResponseDto.from(user);
  }
}
