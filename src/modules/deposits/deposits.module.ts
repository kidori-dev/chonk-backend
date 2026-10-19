import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AlchemyModule } from '../alchemy/alchemy.module';
import { BlockEntity } from '../blocks/entities/block.entity';
import { CurrenciesModule } from '../currencies/currencies.module';
import { DepositAddressesModule } from '../deposit-addresses/deposit-addresses.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { DepositScannerService } from './deposit-scanner.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BlockEntity]),
    AlchemyModule,
    CurrenciesModule,
    DepositAddressesModule,
    TransactionsModule,
  ],
  providers: [DepositScannerService],
  exports: [DepositScannerService],
})
export class DepositsModule {}
