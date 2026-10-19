import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** 토큰 재발급 / 로그아웃 요청 */
export class RefreshTokenRequestDto {
  @ApiProperty({ description: '로그인 때 받은 refreshToken' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
