import { Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { AlchemyModule } from '../modules/alchemy/alchemy.module';
import { BlocksModule } from '../modules/blocks/blocks.module';
import { CurrenciesModule } from '../modules/currencies/currencies.module';
import { DepositAddressesModule } from '../modules/deposit-addresses/deposit-addresses.module';
import { DepositsModule } from '../modules/deposits/deposits.module';
import { SweepContractsModule } from '../modules/sweep-contracts/sweep-contracts.module';
import { SweepsModule } from '../modules/sweeps/sweeps.module';
import { UsersModule } from '../modules/users/users.module';
import { BalancesCommand } from './balances.command';
import {
  CurrencyAddCommand,
  CurrencyDisableCommand,
  CurrencyEnableCommand,
  CurrencyListCommand,
  CurrencySetMinCommand,
  CurrencySetRatioCommand,
} from './currency.command';
import { DepositAddressIssueCommand } from './deposit-address-issue.command';
import { PollingBlockCommand } from './polling-block.command';
import { PollingDepositCommand } from './polling-deposit.command';
import { SweepContractDeployCommand } from './sweep-contract-deploy.command';
import { SweepReconcileCommand } from './sweep-reconcile.command';
import { SweepCommand } from './sweep.command';
import { TargetBlockCommand } from './target-block.command';
import { UserBalanceCommand } from './user-balance.command';
import { UserCreateCommand } from './user-create.command';
import { UserBalancesModule } from '../modules/user-balances/user-balances.module';

/** CLI 진입 모듈. 새 커맨드를 만들면 providers 에 추가한다. */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AlchemyModule,
    BlocksModule,
    UsersModule,
    SweepContractsModule,
    SweepsModule,
    DepositAddressesModule,
    CurrenciesModule,
    DepositsModule,
    UserBalancesModule,
  ],
  providers: [
    PollingBlockCommand,
    PollingDepositCommand,
    TargetBlockCommand,
    UserCreateCommand,
    UserBalanceCommand,
    SweepContractDeployCommand,
    SweepCommand,
    SweepReconcileCommand,
    DepositAddressIssueCommand,
    BalancesCommand,
    CurrencyAddCommand,
    CurrencyListCommand,
    CurrencyDisableCommand,
    CurrencyEnableCommand,
    CurrencySetMinCommand,
    CurrencySetRatioCommand,
  ],
})
export class CliModule {}
