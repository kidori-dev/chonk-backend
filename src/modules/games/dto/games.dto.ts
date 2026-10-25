import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { GameRound } from '../entities/game-round.entity';
import { BET_AMOUNTS, BLOCK_GAMES, GAMES } from '../rules';

/** POST /api/games/:game/bets */
export class PlaceBetDto {
  @ApiPropertyOptional({
    example: 9461236,
    description:
      '판정 블록 번호 = 지금 최신 블록 + 2. 블록 게임만 필요하다 (churu-match 는 비운다)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetBlockNumber?: number;

  @ApiPropertyOptional({
    example: 'odd',
    description:
      '고른 값. coin: odd/even, cat-race: orange/black/calico/white, dice: low/seven/high. block-match, churu-match 는 비운다',
  })
  @IsOptional()
  @IsString()
  pick?: string;

  @ApiProperty({ example: 10, enum: BET_AMOUNTS, description: '걸 포인트' })
  @IsIn(BET_AMOUNTS)
  amount!: number;
}

/** GET /api/games/bets 의 쿼리 */
export class BetsQueryDto {
  @ApiPropertyOptional({ enum: GAMES, description: '이 게임만 (비우면 전체)' })
  @IsOptional()
  @IsIn(GAMES)
  game?: string;

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

/** 배팅 1건 */
export class BetDto {
  @ApiProperty({ example: '42' })
  id!: string;

  @ApiProperty({ example: 'coin', enum: GAMES })
  game!: string;

  @ApiProperty({ example: 9461236, nullable: true, type: Number, description: '판정 블록 번호' })
  targetBlockNumber!: number | null;

  @ApiProperty({ example: 'odd', nullable: true, type: String })
  pick!: string | null;

  @ApiProperty({ example: '10', description: '건 포인트' })
  amount!: string;

  @ApiProperty({ example: 'settled', enum: ['pending', 'settled'] })
  status!: string;

  @ApiProperty({ example: '0xabc...', nullable: true, type: String, description: '판정 블록 해시' })
  blockHash!: string | null;

  @ApiProperty({
    example: 'f',
    nullable: true,
    type: String,
    description:
      "결과 값 (coin: 해시 마지막 글자, cat-race: 1등 고양이, 그림 맞추기: 'churu,fish,cat', dice: '3,4')",
  })
  result!: string | null;

  @ApiProperty({ example: '2', nullable: true, type: String, description: '돌려받은 배수 (꽝 0)' })
  multiplier!: string | null;

  @ApiProperty({ example: '20', nullable: true, type: String, description: '돌려받은 포인트' })
  payout!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ nullable: true, type: Date })
  settledAt!: Date | null;
}

/** POST /api/games/:game/bets */
export class PlaceBetResponseDto {
  @ApiProperty({ type: BetDto })
  bet!: BetDto;

  @ApiProperty({ example: '990', description: '반영 후 내 포인트' })
  points!: string;
}

/** GET /api/games/bets */
export class BetsResponseDto {
  @ApiProperty({ type: [BetDto], description: '최근 것부터' })
  items!: BetDto[];
}

/** GET /api/games/:game/rounds 의 쿼리 */
export class RoundsQueryDto {
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

/** 블록 게임 라운드 결과 1개 */
export class RoundDto {
  @ApiProperty({ example: 9461236, description: '판정 블록 번호' })
  blockNumber!: number;

  @ApiProperty({ example: '0xabc...', description: '판정 블록 해시' })
  blockHash!: string;

  @ApiProperty({
    example: 'f',
    description:
      "결과 값 (coin: 해시 마지막 글자, cat-race: 1등 고양이, block-match: 'churu,fish,cat', dice: '3,4')",
  })
  result!: string;

  @ApiProperty({ description: '기록(정산)한 시각' })
  createdAt!: Date;
}

/** GET /api/games/:game/rounds */
export class RoundsResponseDto {
  @ApiProperty({ example: 'coin', enum: BLOCK_GAMES })
  game!: string;

  @ApiProperty({ type: [RoundDto], description: '최신이 앞' })
  rounds!: RoundDto[];
}

export function toRoundDto(round: GameRound): RoundDto {
  return {
    blockNumber: round.blockNumber,
    blockHash: round.blockHash,
    result: round.result,
    createdAt: round.createdAt,
  };
}
