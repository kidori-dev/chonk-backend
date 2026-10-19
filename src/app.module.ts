import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { UsersModule } from './modules/users/users.module';

/** API 서버 진입 모듈 (CLI 는 commands/cli.module.ts) */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    // @Cron 으로 주기 작업을 돌린다. 예) 만료된 리프레시 토큰 삭제
    ScheduleModule.forRoot(),
    // 요청 횟수 제한. ThrottlerGuard 를 붙인 API 에만 걸린다 (지금은 로그인)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    UsersModule,
    AuthModule,
    // GET /api/points, /api/points/history
    LedgerModule,
  ],
})
export class AppModule {}
