import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserBalancesModule } from '../user-balances/user-balances.module';
import { Transaction } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), UserBalancesModule],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
