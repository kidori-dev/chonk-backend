import { ApiProperty } from '@nestjs/swagger';

/** 입금받는 토큰 1개 */
export class DepositCurrencyDto {
  @ApiProperty({ example: 'USDT' })
  symbol!: string;

  @ApiProperty({ example: '0xabc...', description: '토큰 컨트랙트 주소' })
  address!: string;

  @ApiProperty({ example: 6 })
  decimals!: number;

  @ApiProperty({ example: '1', description: '토큰 1개당 포인트' })
  pointRatio!: string;
}

/** GET /api/deposit-address */
export class DepositAddressResponseDto {
  @ApiProperty({
    example: '0xabc...',
    description: '내 입금 주소. 아래 토큰을 이 주소로 보내면 포인트가 적립된다',
  })
  address!: string;

  @ApiProperty({ example: 11155111, description: '입금 주소가 있는 체인' })
  chainId!: number;

  @ApiProperty({
    type: [DepositCurrencyDto],
    description: '입금받는 토큰 (이 밖의 토큰/ETH 는 적립되지 않는다)',
  })
  currencies!: DepositCurrencyDto[];
}
