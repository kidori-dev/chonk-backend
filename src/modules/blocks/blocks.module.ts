import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BlocksService } from './blocks.service';
import { BlockEntity } from './entities/block.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BlockEntity])],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
