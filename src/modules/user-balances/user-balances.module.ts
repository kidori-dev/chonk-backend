import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserBalance } from './entities/user-balance.entity';
import { UserBalanceHistory } from './entities/user-balance-history.entity';
import { PointsController } from './points.controller';
import { UserBalancesService } from './user-balances.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserBalance, UserBalanceHistory])],
  controllers: [PointsController],
  providers: [UserBalancesService],
  exports: [UserBalancesService],
})
export class UserBalancesModule {}
