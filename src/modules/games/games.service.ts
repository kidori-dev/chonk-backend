import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { formatUnits, parseUnits } from 'ethers';
import {
  Between,
  DataSource,
  EntityManager,
  LessThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { BlocksService } from '../blocks/blocks.service';
import { BlockEntity } from '../blocks/entities/block.entity';
import { POINT_DECIMALS } from '../currencies/points';
import { UserBalancesService } from '../user-balances/user-balances.service';
import { PlaceBetDto } from './dto/games.dto';
import { Bet } from './entities/bet.entity';
import { GameRound } from './entities/game-round.entity';
import {
  BET_AHEAD,
  BET_OPEN_MS,
  BLOCK_GAMES,
  GAMES,
  Game,
  Outcome,
  PICKS,
  SETTLE_CONFIRMATIONS,
  judgeBlock,
  roundResult,
  spinChuru,
} from './rules';

/** polling-bet 이 한 번에 라운드를 기록하는 최대 블록 수 */
const ROUND_BATCH = 100;

/** game_rounds 가 비어 있을 때 처음에 채울 지난 블록 수 (게임 화면 히스토리용) */
const ROUND_BACKFILL = 20;

export interface PlaceBetResult {
  bet: Bet;
  /** 반영 후 포인트 */
  points: string;
}

/**
 * 게임 배팅. 걸 때 포인트를 빼고, 결과가 나오면 돌려준다.
 * - 블록 게임: 서버가 판정 블록(최신 블록 + 2)을 정하고, 판정 블록 뒤로 2블록이 더 이어지면 polling-bet 이 정산한다
 * - churu-match: 서버 난수로 바로 판정해 같은 트랜잭션에서 정산한다
 */
@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Bet)
    private readonly bets: Repository<Bet>,
    @InjectRepository(GameRound)
    private readonly rounds: Repository<GameRound>,
    private readonly blocks: BlocksService,
    private readonly userBalances: UserBalancesService,
  ) {}

  async placeBet(userId: string, game: string, dto: PlaceBetDto): Promise<PlaceBetResult> {
    if (!isGame(game)) {
      throw new NotFoundException(`없는 게임입니다: ${game}`);
    }
    const picks = PICKS[game];
    if (picks && !picks.includes(dto.pick ?? '')) {
      throw new BadRequestException(`pick 은 ${picks.join(', ')} 중 하나여야 합니다.`);
    }
    if (!picks && dto.pick !== undefined) {
      throw new BadRequestException('이 게임은 pick 을 보내지 않습니다.');
    }
    const amount = String(dto.amount);

    if (game === 'churu-match') {
      if (dto.targetBlockNumber !== undefined) {
        throw new BadRequestException('churu-match 는 targetBlockNumber 를 보내지 않습니다.');
      }
      return this.withBet(
        userId,
        { game, pick: null, amount },
        async (manager, bet) =>
          (await this.settle(manager, bet, spinChuru(), null))?.points ?? null,
      );
    }

    // 블록 게임: 지금 라운드(최신 블록 + 2)이고 마감 전이어야 한다
    const targetBlockNumber = await this.openRound();
    if (dto.targetBlockNumber !== targetBlockNumber) {
      throw new ConflictException(
        `배팅이 마감된 라운드입니다. 지금은 #${targetBlockNumber} 블록에 걸 수 있습니다.`,
      );
    }
    return this.withBet(
      userId,
      { game, pick: dto.pick ?? null, amount, chainId: this.blocks.chainId(), targetBlockNumber },
      async () => null,
    );
  }

  /** 유저의 배팅 기록 (최근 것부터) */
  findBets(
    userId: string,
    game: string | undefined,
    limit: number,
    offset: number,
  ): Promise<Bet[]> {
    return this.bets.find({
      where: { userId, ...(game ? { game: game as Game } : {}) },
      order: { id: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /** 블록 게임 라운드 결과 (최근 것부터) */
  findRounds(game: Game, limit: number, offset: number): Promise<GameRound[]> {
    return this.rounds.find({
      where: { chainId: this.blocks.chainId(), game },
      order: { blockNumber: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /** from ~ to 블록의 라운드 결과 (모든 블록 게임, 블록 번호 순) */
  findRoundsBetween(from: number, to: number): Promise<GameRound[]> {
    return this.rounds.find({
      where: { chainId: this.blocks.chainId(), blockNumber: Between(from, to) },
      order: { blockNumber: 'ASC' },
    });
  }

  /** 기록된 라운드 중 가장 최신 블록 번호. 없으면 null */
  async findLatestRoundNumber(): Promise<number | null> {
    const row = await this.rounds
      .createQueryBuilder('r')
      .select('MAX(r.block_number)', 'max')
      .where('r.chain_id = :chainId', { chainId: this.blocks.chainId() })
      .getRawOne<{ max: string | null }>();
    return row?.max ? Number(row.max) : null;
  }

  /**
   * 판정 블록 뒤로 SETTLE_CONFIRMATIONS 블록이 더 저장된 블록의 라운드 결과를 기록하고,
   * 같은 트랜잭션에서 그 블록에 건 배팅을 정산한다 (polling-bet).
   * 판정 블록의 해시는 blocks 에 저장된 값을 쓴다 (polling-block 이 reorg 를 되감아 체인과 맞춰 둔다).
   * 아직 기록 안 된 블록을 한 번에 ROUND_BATCH 개까지 처리하고, 처리한 블록 수와 정산한 배팅을 돌려준다.
   */
  async settlePending(): Promise<{ rounds: number; bets: Bet[] }> {
    const latest = await this.blocks.findLatestNumber();
    if (latest === null) {
      return { rounds: 0, bets: [] };
    }
    const upTo = latest - SETTLE_CONFIRMATIONS;
    const chainId = this.blocks.chainId();

    // 1) 라운드를 아직 기록하지 않은 블록 (처음이면 최근 ROUND_BACKFILL 블록부터)
    const lastRound = await this.findLatestRoundNumber();
    const from = lastRound === null ? upTo - ROUND_BACKFILL + 1 : lastRound + 1;
    const blocks =
      from <= upTo
        ? await this.blocks.findBetween(from, Math.min(upTo, from + ROUND_BATCH - 1))
        : [];

    // 2) 그보다 앞 블록에 걸렸는데 아직 정산 안 된 배팅 (판정 블록이 늦게 저장된 경우 등)
    const leftover = await this.bets.find({
      select: { targetBlockNumber: true },
      where: {
        status: 'pending',
        chainId,
        targetBlockNumber: LessThanOrEqual(Math.min(upTo, from - 1)),
      },
    });
    const leftoverTargets = [...new Set(leftover.map((b) => b.targetBlockNumber!))];
    const leftoverBlocks = await this.blocks.findByNumbers(leftoverTargets);
    for (const target of leftoverTargets) {
      if (!leftoverBlocks.some((b) => b.number === target)) {
        // polling-block 은 블록을 빠짐없이 저장하므로, 판정 블록이 없으면 blocks 를 지운 경우뿐이다
        this.logger.warn(
          `판정 블록 #${target} 이 blocks 에 없어 정산하지 못했습니다 (target-block 으로 저장하면 정산됩니다)`,
        );
      }
    }

    const settled: Bet[] = [];
    for (const block of [...leftoverBlocks, ...blocks].sort((a, b) => a.number - b.number)) {
      settled.push(
        ...(await this.dataSource.transaction((manager) => this.settleBlock(manager, block))),
      );
    }
    return { rounds: blocks.length, bets: settled };
  }

  /**
   * 블록 하나의 라운드 결과(블록 게임 4개)를 기록하고, 그 블록에 건 pending 배팅을 정산한다.
   * 이미 기록된 라운드가 있으면 그 해시를 쓴다 (기록과 정산이 항상 같은 해시를 보게).
   */
  private async settleBlock(manager: EntityManager, block: BlockEntity): Promise<Bet[]> {
    const chainId = block.chainId;
    await manager
      .createQueryBuilder()
      .insert()
      .into(GameRound)
      .values(
        BLOCK_GAMES.map((game) => ({
          chainId,
          game,
          blockNumber: block.number,
          blockHash: block.hash,
          result: roundResult(game, block.hash),
        })),
      )
      .orIgnore()
      .execute();
    const round = await manager.findOneByOrFail(GameRound, {
      chainId,
      game: BLOCK_GAMES[0],
      blockNumber: block.number,
    });

    const pending = await manager.find(Bet, {
      where: { status: 'pending', chainId, targetBlockNumber: block.number },
      order: { id: 'ASC' },
    });
    const settled: Bet[] = [];
    for (const bet of pending) {
      const outcome = judgeBlock(bet.game, round.blockHash, bet.pick);
      if (await this.settle(manager, bet, outcome, round.blockHash)) {
        settled.push(bet);
      }
    }
    return settled;
  }

  /**
   * 지금 배팅할 수 있는 라운드의 판정 블록 번호. 마감됐으면 409.
   * 최신 블록의 block_time 부터 BET_OPEN_MS 동안만 열린다. polling-block 이 멈추거나 밀려서
   * 최신 블록이 오래됐어도 마감으로 처리되니, 이미 나온 블록에 거는 일은 없다.
   */
  private async openRound(): Promise<number> {
    const latest = await this.blocks.findLatest();
    if (!latest) {
      throw new ConflictException('아직 저장된 블록이 없습니다.');
    }
    if (Date.now() >= latest.blockTime.getTime() + BET_OPEN_MS) {
      throw new ConflictException(
        `배팅이 마감되었습니다. 다음 블록이 나오면 #${latest.number + BET_AHEAD + 1} 배팅이 열립니다.`,
      );
    }
    return latest.number + BET_AHEAD;
  }

  /**
   * 배팅을 만들고 포인트를 뺀 뒤 next 를 같은 트랜잭션에서 실행한다.
   * next 가 포인트를 돌려주면(정산) 그 값이, 아니면 차감 후 포인트가 결과 포인트가 된다.
   */
  private async withBet(
    userId: string,
    values: Pick<Bet, 'game' | 'pick' | 'amount'> &
      Partial<Pick<Bet, 'chainId' | 'targetBlockNumber'>>,
    next: (manager: EntityManager, bet: Bet) => Promise<string | null>,
  ): Promise<PlaceBetResult> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const bet = await manager.save(manager.create(Bet, { userId, ...values }));

        const afterDebit = await this.userBalances.debit(manager, {
          userId,
          points: values.amount,
          type: 'bet',
          targetId: bet.id,
        });
        if (afterDebit === null) {
          throw new BadRequestException('포인트가 모자랍니다.');
        }

        const afterSettle = await next(manager, bet);
        return { bet, points: afterSettle ?? afterDebit };
      });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('이번 라운드에는 이미 배팅했습니다.');
      }
      throw err;
    }
  }

  /**
   * 배팅을 정산한다. 아직 pending 일 때만 바꾸고(두 번 정산 방지), 돌려줄 포인트가 있으면 bet_payout 으로 올린다.
   * 이미 정산된 배팅이면 null. 정산했으면 points = 돌려준 뒤 포인트 (돌려줄 게 없었으면 null).
   * bet 객체도 정산 결과로 바꿔 둔다.
   */
  private async settle(
    manager: EntityManager,
    bet: Bet,
    outcome: Outcome,
    blockHash: string | null,
  ): Promise<{ points: string | null } | null> {
    const payout = payoutOf(bet.amount, outcome.multiplier);
    const values = {
      status: 'settled' as const,
      blockHash,
      result: outcome.result,
      multiplier: outcome.multiplier,
      payout,
      settledAt: new Date(),
    };
    const updated = await manager.update(Bet, { id: bet.id, status: 'pending' }, values);
    if (!updated.affected) {
      return null;
    }
    Object.assign(bet, values);

    if (parseUnits(payout, POINT_DECIMALS) === 0n) {
      return { points: null };
    }
    const points = await this.userBalances.credit(manager, {
      userId: bet.userId,
      points: payout,
      type: 'bet_payout',
      targetId: bet.id,
    });
    return { points };
  }
}

function isGame(game: string): game is Game {
  return (GAMES as readonly string[]).includes(game);
}

/** 돌려줄 포인트 = amount × multiplier (소수 6자리 아래는 버린다) */
export function payoutOf(amount: string, multiplier: string): string {
  const value = (parseUnits(amount, POINT_DECIMALS) * parseUnits(multiplier, 4)) / 10n ** 4n;
  return formatUnits(value, POINT_DECIMALS);
}
