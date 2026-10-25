import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { errorMessage } from '../../common/errors';
import { BlocksService } from '../blocks/blocks.service';
import { RoundDto, toRoundDto } from './dto/games.dto';
import { GamesService } from './games.service';
import { BET_AHEAD, BET_OPEN_MS, BLOCK_GAMES, Game } from './rules';

/** 새 블록 / 새 라운드 결과를 확인하는 간격. DB 만 읽는다 (Alchemy 요청 없음) */
const CHECK_INTERVAL_MS = 1000;

/** 접속할 때 보내는 최근 블록 수 */
const RECENT_BLOCKS = 12;

/** rounds:subscribe 때 보내는 최근 라운드 수 */
const RECENT_ROUNDS = 20;

/** 'blocks' 이벤트 */
export interface BlocksEvent {
  /** 서버 시각 (ms). 브라우저 시계와의 차이를 맞추는 데 쓴다 */
  serverTime: number;
  /** 최근 블록 (최신이 앞). timestamp 는 ms */
  blocks: { number: number; hash: string; timestamp: number }[];
  /** 지금 배팅할 수 있는 라운드 */
  round: { targetBlockNumber: number; closesAt: number } | null;
}

/** 'rounds' 이벤트 / rounds:subscribe 응답 */
export interface RoundsEvent {
  game: Game;
  /** 최신이 앞 */
  rounds: RoundDto[];
}

/**
 * 게임 화면 실시간 데이터 (Socket.IO). 로그인 없이 붙을 수 있다.
 *
 * 서버 → 클라이언트
 * - blocks: 접속하면 한 번, 이후 새 블록이 저장될 때마다 (최근 블록 + 지금 라운드)
 * - rounds: 구독한 게임의 라운드 결과가 새로 기록될 때마다 (polling-bet 이 기록)
 *
 * 클라이언트 → 서버
 * - rounds:subscribe (game): 그 게임의 라운드 결과를 받는다. 응답으로 최근 라운드를 돌려준다 (한 번에 한 게임)
 *
 * blocks / game_rounds 는 다른 프로세스(polling-block, polling-bet)가 쓰므로, 1초마다 DB 를 확인해서 보낸다.
 * 접속자가 없으면 확인하지 않는다.
 */
@WebSocketGateway()
export class GamesGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GamesGateway.name);
  private timer: NodeJS.Timeout | undefined;
  private checking = false;
  private lastBlockHash = '';
  private lastRoundNumber: number | null = null;

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly blocks: BlocksService,
    private readonly games: GamesService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      client.emit('blocks', await this.blocksEvent());
    } catch (err) {
      this.logger.warn(`blocks 보내기 실패: ${errorMessage(err)}`);
    }
  }

  @SubscribeMessage('rounds:subscribe')
  async subscribeRounds(
    @ConnectedSocket() client: Socket,
    @MessageBody() game: string,
  ): Promise<RoundsEvent> {
    if (!(BLOCK_GAMES as readonly string[]).includes(game)) {
      throw new WsException(`블록 게임이 아닙니다: ${game}`);
    }
    // 한 번에 한 게임만 받는다
    for (const room of client.rooms) {
      if (room.startsWith('rounds:')) {
        await client.leave(room);
      }
    }
    await client.join(`rounds:${game}`);
    const rounds = await this.games.findRounds(game as Game, RECENT_ROUNDS, 0);
    return { game: game as Game, rounds: rounds.map(toRoundDto) };
  }

  /** 새 블록이 저장됐거나 라운드 결과가 새로 기록됐으면 보낸다 */
  private async check(): Promise<void> {
    if (this.checking || this.server.engine.clientsCount === 0) {
      return;
    }
    this.checking = true;
    try {
      const latest = await this.blocks.findLatest();
      if (latest && latest.hash !== this.lastBlockHash) {
        this.lastBlockHash = latest.hash;
        this.server.emit('blocks', await this.blocksEvent());
      }

      const latestRound = await this.games.findLatestRoundNumber();
      if (
        latestRound !== null &&
        this.lastRoundNumber !== null &&
        latestRound > this.lastRoundNumber
      ) {
        const rounds = await this.games.findRoundsBetween(this.lastRoundNumber + 1, latestRound);
        for (const game of BLOCK_GAMES) {
          const forGame = rounds.filter((r) => r.game === game).reverse();
          if (forGame.length > 0) {
            const event: RoundsEvent = { game, rounds: forGame.map(toRoundDto) };
            this.server.to(`rounds:${game}`).emit('rounds', event);
          }
        }
      }
      this.lastRoundNumber = latestRound;
    } catch (err) {
      this.logger.warn(`새 블록 확인 실패: ${errorMessage(err)}`);
    } finally {
      this.checking = false;
    }
  }

  private async blocksEvent(): Promise<BlocksEvent> {
    const blocks = await this.blocks.findRecent(RECENT_BLOCKS);
    const latest = blocks[0];
    return {
      serverTime: Date.now(),
      blocks: blocks.map((b) => ({
        number: b.number,
        hash: b.hash,
        timestamp: b.blockTime.getTime(),
      })),
      round: latest
        ? {
            targetBlockNumber: latest.number + BET_AHEAD,
            closesAt: latest.blockTime.getTime() + BET_OPEN_MS,
          }
        : null,
    };
  }
}
