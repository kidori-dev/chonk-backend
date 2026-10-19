import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AlchemyModule } from '../alchemy/alchemy.module';
import { SweepContractsModule } from '../sweep-contracts/sweep-contracts.module';
import { User } from '../users/entities/user.entity';
import { DepositAddressesService } from './deposit-addresses.service';
import { DepositAddress } from './entities/deposit-address.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DepositAddress, User]), AlchemyModule, SweepContractsModule],
  providers: [DepositAddressesService],
  exports: [DepositAddressesService],
})
export class DepositAddressesModule {}
