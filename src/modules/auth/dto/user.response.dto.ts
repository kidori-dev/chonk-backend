import { ApiProperty } from '@nestjs/swagger';

import { User } from '../../users/entities/user.entity';

/** API 로 내보내는 유저 정보. 비밀번호 해시 등은 넣지 않는다 */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: '홍길동', nullable: true, type: String })
  name!: string | null;

  static from(user: User): UserResponseDto {
    return { id: user.id, email: user.email, name: user.name };
  }
}
