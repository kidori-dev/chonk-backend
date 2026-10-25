import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** POST /api/auth/register */
export class RegisterRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // bcrypt 는 72바이트까지만 쓰므로 그보다 길면 받지 않는다
  @ApiProperty({ example: 'password1234', minLength: 8, maxLength: 72, format: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiPropertyOptional({ example: '홍길동', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
