import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { AlchemyService } from '../alchemy/alchemy.service';
import { SweepContract } from '../sweep-contracts/entities/sweep-contract.entity';
import { SWEEP_FACTORY_ABI, toSalt } from '../sweep-contracts/sweep-factory';
import { SweepContractsService } from '../sweep-contracts/sweep-contracts.service';
import { User } from '../users/entities/user.entity';
import { DepositAddress } from './entities/deposit-address.entity';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IssueResult {
  depositAddress: DepositAddress;
  /** 이번에 새로 발급했으면 true, 이미 있던 주소면 false */
  created: boolean;
}

/**
 * 입금 주소 발급 / 조회.
 * 이 체인의 현재 SweepFactory(가장 최근 배포) 기준으로 유저당 주소 1개를 발급한다.
 */
@Injectable()
export class DepositAddressesService {
  constructor(
    @InjectRepository(DepositAddress)
    private readonly depositAddresses: Repository<DepositAddress>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly sweepContracts: SweepContractsService,
    private readonly alchemy: AlchemyService,
    private readonly config: ConfigService,
  ) {}

  /** 유저들에게 입금 주소를 발급한다. 이미 있으면 그 주소를 그대로 돌려준다 */
  async issue(userIds: string[]): Promise<IssueResult[]> {
    const factory = await this.currentFactory();

    const users = await this.users.findBy({ id: In(userIds) });
    const missing = userIds.filter((id) => !users.some((u) => u.id === id));
    if (missing.length > 0) {
      throw new NotFoundException(`없는 유저입니다: ${missing.join(', ')}`);
    }

    const results: IssueResult[] = [];
    for (const userId of userIds) {
      const existing = await this.depositAddresses.findOneBy({
        chainId: factory.chainId,
        factoryAddress: factory.factoryAddress,
        userId,
      });
      if (existing) {
        results.push({ depositAddress: existing, created: false });
        continue;
      }

      // 주소는 컨트랙트에 직접 물어본다 (가스비 없는 view 호출). 컨트랙트 계산과 항상 같다
      const salt = toSalt(userId);
      const address = await this.alchemy.call<string>(
        factory.factoryAddress,
        SWEEP_FACTORY_ABI,
        'predictAddress',
        [salt],
      );
      const saved = await this.depositAddresses.save(
        this.depositAddresses.create({
          userId,
          chainId: factory.chainId,
          factoryAddress: factory.factoryAddress,
          salt,
          address,
        }),
      );
      results.push({ depositAddress: saved, created: true });
    }
    return results;
  }

  /** 현재 factory 기준 입금 주소가 아직 없는 유저 id 목록 */
  async findUserIdsWithoutAddress(): Promise<string[]> {
    const factory = await this.currentFactory();
    const users = await this.users
      .createQueryBuilder('user')
      .leftJoin(
        DepositAddress,
        'da',
        'da.user_id = user.id AND da.chain_id = :chainId AND da.factory_address = :factory',
        { chainId: factory.chainId, factory: factory.factoryAddress },
      )
      .where('da.id IS NULL')
      .orderBy('user.created_at', 'ASC')
      .getMany();
    return users.map((u) => u.id);
  }

  /**
   * 현재 factory 기준 유저들의 입금 주소 (userIds 순서대로, 유저 정보 포함).
   * 입금 주소가 발급되지 않은 유저가 하나라도 있으면 에러.
   */
  async findByUserIds(userIds: string[]): Promise<DepositAddress[]> {
    const factory = await this.currentFactory();
    // uuid 형식이 아닌 값은 DB 에 물어보기 전에 걸러낸다 (발급 안 된 유저로 처리)
    const validIds = userIds.filter((id) => UUID_PATTERN.test(id));
    const found =
      validIds.length === 0
        ? []
        : await this.depositAddresses.find({
            where: {
              chainId: factory.chainId,
              factoryAddress: factory.factoryAddress,
              userId: In(validIds),
            },
            relations: { user: true },
          });

    const missing = userIds.filter((id) => !found.some((d) => d.userId === id));
    if (missing.length > 0) {
      throw new Error(
        `입금 주소가 발급되지 않은 유저입니다: ${missing.join(', ')} ` +
          '(deposit-address-issue 로 먼저 발급하세요)',
      );
    }
    return userIds.map((id) => found.find((d) => d.userId === id)!);
  }

  /**
   * 이 체인에 발급된 입금 주소 전체 (예전 factory 것 포함, 유저 정보 포함).
   * 입금 감지용. factory 를 새로 배포해도 예전 주소로 들어오는 입금은 계속 감지해야 한다.
   */
  findAllOnChain(): Promise<DepositAddress[]> {
    return this.depositAddresses.find({
      where: { chainId: this.config.get<number>('alchemy.chainId')! },
      relations: { user: true },
    });
  }

  /** 현재 factory 기준으로 발급된 입금 주소 전체 (유저 정보 포함, 발급 순) */
  async findAll(): Promise<DepositAddress[]> {
    const factory = await this.currentFactory();
    return this.depositAddresses.find({
      where: { chainId: factory.chainId, factoryAddress: factory.factoryAddress },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }

  /** 이 체인의 현재 SweepFactory (가장 최근 배포) */
  async currentFactory(): Promise<SweepContract> {
    const chainId = this.config.get<number>('alchemy.chainId')!;
    const [factory] = await this.sweepContracts.findByChain(chainId);
    if (!factory) {
      throw new Error(
        `체인 ${chainId} 에 배포된 SweepFactory 가 없습니다. 먼저 sweep-contract-deploy 를 실행하세요.`,
      );
    }
    return factory;
  }
}
