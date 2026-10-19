import { ApiProperty } from '@nestjs/swagger';

/** 로그인 / 토큰 재발급 응답 */
export class TokenResponseDto {
  @ApiProperty({ description: 'API 호출 시 Authorization: Bearer <accessToken> 으로 보낸다' })
  accessToken!: string;

  @ApiProperty({ description: '액세스 토큰이 만료되면 POST /api/auth/refresh 로 보낸다 (1회용)' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 3600, description: '액세스 토큰 유효 기간(초)' })
  expiresIn!: number;

  @ApiProperty({ example: 1209600, description: '리프레시 토큰 유효 기간(초)' })
  refreshExpiresIn!: number;
}
