import { ApiProperty } from '@nestjs/swagger';

/** GET /api/points */
export class PointsResponseDto {
  @ApiProperty({ example: '150.5', description: '포인트 (소수 6자리까지, 정확도를 위해 문자열)' })
  points!: string;
}

/** 포인트 변경 이력 1건 */
export class PointHistoryItemDto {
  @ApiProperty({
    example: 'deposit',
    enum: ['deposit', 'withdraw', 'bet', 'bet_payout', 'churu'],
    description:
      '변경 이유 (deposit: 입금, withdraw: 출금, bet: 배팅으로 차감, bet_payout: 배팅 정산으로 지급, churu: 츄르 주기로 차감)',
  })
  type!: string;

  @ApiProperty({ example: '100', description: '바뀐 포인트 (늘면 +, 줄면 -)' })
  points!: string;

  @ApiProperty({ example: '50.5', description: '반영 전 포인트' })
  pointsBefore!: string;

  @ApiProperty({ example: '150.5', description: '반영 후 포인트' })
  pointsAfter!: string;

  @ApiProperty({
    example: '42',
    nullable: true,
    type: String,
    description:
      '원인이 된 행의 id (deposit → 입금 transactions.id, bet / bet_payout → bets.id, churu → null)',
  })
  targetId!: string | null;

  @ApiProperty({ example: 'USDT', nullable: true, type: String, description: '입금된 토큰' })
  symbol!: string | null;

  @ApiProperty({ example: '100', nullable: true, type: String, description: '입금된 토큰 수량' })
  tokenAmount!: string | null;

  @ApiProperty({
    example: '0xabc...',
    nullable: true,
    type: String,
    description: '입금 트랜잭션 hash',
  })
  txHash!: string | null;

  @ApiProperty({
    example: 'coin',
    nullable: true,
    type: String,
    description: '배팅 이력(bet / bet_payout)의 게임',
  })
  game!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

/** GET /api/points/history */
export class PointHistoryResponseDto {
  @ApiProperty({ type: [PointHistoryItemDto], description: '최근 것부터' })
  items!: PointHistoryItemDto[];
}
