import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { BlocksService } from './blocks.service';
import { RecentBlocksQueryDto, RecentBlocksResponseDto } from './dto/blocks.dto';

/**
 * 블록 게임 화면용 최근 블록. polling-block 이 저장한 blocks 를 읽기만 한다 (Alchemy 요청 없음).
 * 프론트는 이 API 를 1초마다 불러 새 블록을 확인한다.
 */
@ApiTags('blocks')
@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  /** GET /api/blocks?limit=12 */
  @Public()
  @Get()
  @ApiOperation({ summary: '최근 블록', description: '최신이 앞. 로그인 없이 볼 수 있다' })
  @ApiOkResponse({ type: RecentBlocksResponseDto })
  async getRecent(@Query() query: RecentBlocksQueryDto): Promise<RecentBlocksResponseDto> {
    const blocks = await this.blocks.findRecent(query.limit);
    return {
      serverTime: Date.now(),
      blocks: blocks.map((b) => ({
        number: b.number,
        hash: b.hash,
        timestamp: b.blockTime.getTime(),
      })),
    };
  }
}
