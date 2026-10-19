import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SweepContract } from './entities/sweep-contract.entity';
import { SweepContractsService } from './sweep-contracts.service';

@Module({
  imports: [TypeOrmModule.forFeature([SweepContract])],
  providers: [SweepContractsService],
  exports: [SweepContractsService],
})
export class SweepContractsModule {}
