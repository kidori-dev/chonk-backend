import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SweepItem } from './entities/sweep-item.entity';
import { Sweep } from './entities/sweep.entity';
import { SweepsService } from './sweeps.service';

@Module({
  imports: [TypeOrmModule.forFeature([Sweep, SweepItem])],
  providers: [SweepsService],
  exports: [SweepsService],
})
export class SweepsModule {}
