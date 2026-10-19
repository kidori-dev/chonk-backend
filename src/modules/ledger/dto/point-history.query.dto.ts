import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** GET /api/points/history 의 쿼리 */
export class PointHistoryQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: '가져올 개수' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, description: '건너뛸 개수 (다음 페이지)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
