import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { formatUnits } from 'ethers';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrenciesService } from '../currencies/currencies.service';
import { formatPoints } from '../currencies/points';
import { User } from '../users/entities/user.entity';
import { PointHistoryQueryDto } from './dto/point-history.query.dto';
import { PointHistoryResponseDto, PointsResponseDto } from './dto/points.response.dto';
import { LedgerService } from './ledger.service';

/** 로그인한 유저 본인의 포인트 조회 (Authorization: Bearer <accessToken> 필요) */
@ApiTags('points')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 유효하지 않음' })
@Controller('points')
export class PointsController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly currencies: CurrenciesService,
  ) {}

  /** GET /api/points */
  @Get()
  @ApiOperation({ summary: '내 포인트', description: '등록된 토큰별 포인트. 입금이 없던 토큰은 0' })
  @ApiOkResponse({ type: PointsResponseDto })
  async getPoints(@CurrentUser() user: User): Promise<PointsResponseDto> {
    const [currencies, balances] = await Promise.all([
      this.currencies.findAll(),
      this.ledger.findBalances(user.id),
    ]);
    return {
      balances: currencies.map((c) => ({
        symbol: c.symbol,
        currencyAddress: c.address,
        points: formatPoints(balances.find((b) => b.currencyId === c.id)?.points ?? '0'),
        pointRatio: formatPoints(c.pointRatio),
      })),
    };
  }

  /** GET /api/points/history?limit=20&offset=0 */
  @Get('history')
  @ApiOperation({ summary: '내 포인트 이력', description: '포인트가 바뀐 이력 (최근 것부터)' })
  @ApiOkResponse({ type: PointHistoryResponseDto })
  async getHistory(
    @CurrentUser() user: User,
    @Query() query: PointHistoryQueryDto,
  ): Promise<PointHistoryResponseDto> {
    const entries = await this.ledger.findEntries(user.id, query.limit, query.offset);
    return {
      items: entries.map((e) => ({
        type: e.type,
        symbol: e.currency.symbol,
        points: formatPoints(e.points),
        pointsAfter: formatPoints(e.pointsAfter),
        tokenAmount: e.transaction
          ? formatPoints(formatUnits(e.transaction.amount, e.currency.decimals))
          : null,
        txHash: e.transaction?.txHash ?? null,
        createdAt: e.createdAt,
      })),
    };
  }
}
