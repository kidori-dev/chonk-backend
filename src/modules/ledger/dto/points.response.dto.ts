import { ApiProperty } from '@nestjs/swagger';

/** 토큰 하나의 내 포인트 */
export class PointBalanceDto {
  @ApiProperty({ example: 'USDT' })
  symbol!: string;

  @ApiProperty({
    example: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    description: 'ERC-20 주소',
  })
  currencyAddress!: string;

  @ApiProperty({ example: '150.5', description: '포인트 (소수 6자리까지, 정확도를 위해 문자열)' })
  points!: string;

  @ApiProperty({ example: '1', description: '토큰 1개당 포인트' })
  pointRatio!: string;
}

/** GET /api/points */
export class PointsResponseDto {
  @ApiProperty({ type: [PointBalanceDto], description: '등록된 토큰별 포인트 (입금이 없으면 0)' })
  balances!: PointBalanceDto[];
}

/** 포인트 변경 이력 1건 */
export class PointHistoryItemDto {
  @ApiProperty({ example: 'deposit', description: '변경 이유 (지금은 입금만 있다)' })
  type!: string;

  @ApiProperty({ example: 'USDT' })
  symbol!: string;

  @ApiProperty({ example: '100', description: '바뀐 포인트' })
  points!: string;

  @ApiProperty({ example: '150.5', description: '반영 후 포인트' })
  pointsAfter!: string;

  @ApiProperty({ example: '100', nullable: true, type: String, description: '입금된 토큰 수량' })
  tokenAmount!: string | null;

  @ApiProperty({
    example: '0xabc...',
    nullable: true,
    type: String,
    description: '입금 트랜잭션 hash',
  })
  txHash!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

/** GET /api/points/history */
export class PointHistoryResponseDto {
  @ApiProperty({ type: [PointHistoryItemDto], description: '최근 것부터' })
  items!: PointHistoryItemDto[];
}
