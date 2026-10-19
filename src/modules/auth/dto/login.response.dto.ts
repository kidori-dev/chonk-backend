import { ApiProperty } from '@nestjs/swagger';

import { TokenResponseDto } from './token.response.dto';
import { UserResponseDto } from './user.response.dto';

/** 로그인 응답 = 토큰 + 유저 정보 */
export class LoginResponseDto extends TokenResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
