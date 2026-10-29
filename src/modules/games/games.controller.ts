import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { formatPoints } from '../currencies/points';
import { User } from '../users/entities/user.entity';
import {
  BetDto,
  BetsQueryDto,
  BetsResponseDto,
  PlaceBetDto,
  PlaceBetResponseDto,
  RoundsQueryDto,
  RoundsResponseDto,
  toRoundDto,
} from './dto/games.dto';
import { Bet } from './entities/bet.entity';
import { GamesService } from './games.service';
import { BLOCK_GAMES, Game } from './rules';

/** 게임 배팅 (Authorization: Bearer <accessToken> 필요) */
@ApiTags('games')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 유효하지 않음' })
@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  /** GET /api/games/bets?game=coin&limit=20&offset=0 */
  @Get('bets')
  @ApiOperation({ summary: '내 배팅 기록', description: '최근 것부터. pending 은 아직 결과 대기' })
  @ApiOkResponse({ type: BetsResponseDto })
  async getBets(@CurrentUser() user: User, @Query() query: BetsQueryDto): Promise<BetsResponseDto> {
    const bets = await this.games.findBets(user.id, query.game, query.limit, query.offset);
    return { items: bets.map(toBetDto) };
  }

  /** GET /api/games/:game/rounds?limit=20&offset=0 */
  @Public()
  @Get(':game/rounds')
  @ApiOperation({
    summary: '라운드 결과 (블록 게임)',
    description:
      '판정 블록 뒤로 2블록이 더 나와 확정된 라운드 결과. 최신이 앞. 새 결과는 소켓 rounds 이벤트로도 온다',
  })
  @ApiOkResponse({ type: RoundsResponseDto })
  async getRounds(
    @Param('game') game: string,
    @Query() query: RoundsQueryDto,
  ): Promise<RoundsResponseDto> {
    if (!(BLOCK_GAMES as readonly string[]).includes(game)) {
      throw new NotFoundException(`블록 게임이 아닙니다: ${game}`);
    }
    const rounds = await this.games.findRounds(game as Game, query.limit, query.offset);
    return { game, rounds: rounds.map(toRoundDto) };
  }

  /** POST /api/games/:game/bets */
  @Post(':game/bets')
  @HttpCode(200)
  @ApiOperation({
    summary: '배팅',
    description:
      '블록 게임(coin, cat-race, block-match, dice, ladder, lottery)은 targetBlockNumber = 최신 블록 + 2 에 건다. ' +
      '블록이 나오고 9초 안에만 걸 수 있고, 결과는 판정 블록 뒤로 2블록이 더 나오면 정산된다. ' +
      'churu-match 는 바로 결과가 나온다 (status = settled).',
  })
  @ApiOkResponse({ type: PlaceBetResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 pick / amount, 포인트 부족' })
  @ApiConflictResponse({ description: '마감된 라운드, 이번 라운드에 이미 배팅함' })
  async placeBet(
    @CurrentUser() user: User,
    @Param('game') game: string,
    @Body() dto: PlaceBetDto,
  ): Promise<PlaceBetResponseDto> {
    const { bet, points } = await this.games.placeBet(user.id, game, dto);
    return { bet: toBetDto(bet), points: formatPoints(points) };
  }
}

function toBetDto(bet: Bet): BetDto {
  return {
    id: bet.id,
    game: bet.game,
    targetBlockNumber: bet.targetBlockNumber,
    pick: bet.pick,
    amount: formatPoints(bet.amount),
    status: bet.status,
    blockHash: bet.blockHash,
    result: bet.result,
    multiplier: bet.multiplier === null ? null : formatPoints(bet.multiplier),
    payout: bet.payout === null ? null : formatPoints(bet.payout),
    createdAt: bet.createdAt,
    settledAt: bet.settledAt,
  };
}
