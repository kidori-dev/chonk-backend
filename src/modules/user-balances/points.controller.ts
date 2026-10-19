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
import { formatPoints } from '../currencies/points';
import { User } from '../users/entities/user.entity';
import { PointHistoryQueryDto } from './dto/point-history.query.dto';
import { PointHistoryResponseDto, PointsResponseDto } from './dto/points.response.dto';
import { UserBalancesService } from './user-balances.service';

/** 로그인한 유저 본인의 포인트 조회 (Authorization: Bearer <accessToken> 필요) */
@ApiTags('points')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 유효하지 않음' })
@Controller('points')
export class PointsController {
  constructor(private readonly userBalances: UserBalancesService) {}

  /** GET /api/points */
  @Get()
  @ApiOperation({ summary: '내 포인트', description: '입금이 없었으면 0' })
  @ApiOkResponse({ type: PointsResponseDto })
  async getPoints(@CurrentUser() user: User): Promise<PointsResponseDto> {
    return { points: formatPoints(await this.userBalances.findPoints(user.id)) };
  }

  /** GET /api/points/history?limit=20&offset=0 */
  @Get('history')
  @ApiOperation({ summary: '내 포인트 이력', description: '포인트가 바뀐 이력 (최근 것부터)' })
  @ApiOkResponse({ type: PointHistoryResponseDto })
  async getHistory(
    @CurrentUser() user: User,
    @Query() query: PointHistoryQueryDto,
  ): Promise<PointHistoryResponseDto> {
    const histories = await this.userBalances.findHistories(user.id, query.limit, query.offset);
    return {
      items: histories.map(({ history: h, transaction: t }) => ({
        type: h.type,
        points: formatPoints(h.points),
        pointsBefore: formatPoints(h.pointsBefore),
        pointsAfter: formatPoints(h.pointsAfter),
        targetId: h.targetId,
        symbol: t?.currency.symbol ?? null,
        tokenAmount: t ? formatPoints(formatUnits(t.amount, t.currency.decimals)) : null,
        txHash: t?.txHash ?? null,
        createdAt: h.createdAt,
      })),
    };
  }
}
