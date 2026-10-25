import { Module } from '@nestjs/common';

import { BlocksModule } from '../blocks/blocks.module';
import { GamesGateway } from './games.gateway';
import { GamesModule } from './games.module';

/** 게임 화면 소켓(Socket.IO). API 서버(AppModule)만 쓴다. CLI 는 GamesModule 만 쓴다 */
@Module({
  imports: [GamesModule, BlocksModule],
  providers: [GamesGateway],
})
export class GamesRealtimeModule {}
