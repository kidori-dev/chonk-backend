import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BlocksModule } from '../blocks/blocks.module';
import { UserBalancesModule } from '../user-balances/user-balances.module';
import { Bet } from './entities/bet.entity';
import { GameRound } from './entities/game-round.entity';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [TypeOrmModule.forFeature([Bet, GameRound]), BlocksModule, UserBalancesModule],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
