import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** GET /api/blocks 의 쿼리 */
export class RecentBlocksQueryDto {
  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 50, description: '가져올 개수' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 12;
}

export class BlockDto {
  @ApiProperty({ example: 9461234 })
  number!: number;

  @ApiProperty({ example: '0xabc...' })
  hash!: string;

  @ApiProperty({ example: 1792339200000, description: '블록 시각 (ms)' })
  timestamp!: number;
}

/** GET /api/blocks */
export class RecentBlocksResponseDto {
  @ApiProperty({
    example: 1792339201234,
    description:
      '서버 시각 (ms). 배팅 마감은 서버 시각 기준이라 브라우저 시계와의 차이를 맞추는 데 쓴다',
  })
  serverTime!: number;

  @ApiProperty({ type: [BlockDto], description: '최신이 앞' })
  blocks!: BlockDto[];
}
