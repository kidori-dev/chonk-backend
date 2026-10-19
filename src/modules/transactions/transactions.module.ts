import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerModule } from '../ledger/ledger.module';
import { Transaction } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), LedgerModule],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
