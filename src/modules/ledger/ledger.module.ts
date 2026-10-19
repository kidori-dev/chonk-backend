import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CurrenciesModule } from '../currencies/currencies.module';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { UserBalance } from './entities/user-balance.entity';
import { LedgerService } from './ledger.service';
import { PointsController } from './points.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserBalance, LedgerEntry]), CurrenciesModule],
  controllers: [PointsController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
