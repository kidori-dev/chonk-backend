import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

/** Postgres 연결. 테이블은 마이그레이션으로만 만든다 (synchronize 끔) */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
        synchronize: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
