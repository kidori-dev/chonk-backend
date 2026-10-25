import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrenciesService } from '../currencies/currencies.service';
import { formatPoints } from '../currencies/points';
import { User } from '../users/entities/user.entity';
import { DepositAddressesService } from './deposit-addresses.service';
import { DepositAddressResponseDto } from './dto/deposit-address.response.dto';

/** 내 입금 주소 (Authorization: Bearer <accessToken> 필요) */
@ApiTags('deposit')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 유효하지 않음' })
@Controller('deposit-address')
export class DepositAddressesController {
  constructor(
    private readonly depositAddresses: DepositAddressesService,
    private readonly currencies: CurrenciesService,
  ) {}

  /** GET /api/deposit-address */
  @Get()
  @ApiOperation({
    summary: '내 입금 주소',
    description:
      '없으면 이때 발급한다 (가스비 없음, deposit_addresses 에 저장). ' +
      '등록된 토큰을 이 주소로 보내면 10블록 지난 뒤 확인되어(약 2~5분) 포인트가 적립된다.',
  })
  @ApiOkResponse({ type: DepositAddressResponseDto })
  @ApiServiceUnavailableResponse({
    description: '입금 컨트랙트(SweepFactory)가 아직 배포되지 않음',
  })
  async getMine(@CurrentUser() user: User): Promise<DepositAddressResponseDto> {
    if (!(await this.depositAddresses.findCurrentFactory())) {
      throw new ServiceUnavailableException(
        '아직 입금을 받을 수 없습니다 (입금 컨트랙트 배포 전).',
      );
    }
    const [depositAddress, currencies] = await Promise.all([
      this.depositAddresses.findOrIssue(user.id),
      this.currencies.findAll(),
    ]);
    return {
      address: depositAddress.address,
      chainId: depositAddress.chainId,
      currencies: currencies
        .filter((c) => c.isActive)
        .map((c) => ({
          symbol: c.symbol,
          address: c.address,
          decimals: c.decimals,
          pointRatio: formatPoints(c.pointRatio),
        })),
    };
  }
}
