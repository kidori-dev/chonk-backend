import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

import type { Game } from '../rules';

/** pg 는 bigint 를 문자열로 돌려주므로 블록 번호를 숫자로 바꿔서 쓴다 */
const bigintToNumber = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

/**
 * 블록 게임 라운드 결과 1개 = 1행 (블록 1개 × 블록 게임 4개).
 * polling-bet 이 판정 블록 뒤로 2블록이 더 저장되면 기록하고, 같은 트랜잭션에서 그 라운드의 배팅을 정산한다.
 * 한 번 기록하면 바꾸지 않는다. 게임 화면의 히스토리가 이 결과를 보여준다.
 */
@Entity('game_rounds')
export class GameRound {
  @PrimaryColumn({ name: 'chain_id', type: 'integer' })
  chainId!: number;

  @PrimaryColumn({ type: 'varchar', length: 20 })
  game!: Game;

  @PrimaryColumn({ name: 'block_number', type: 'bigint', transformer: bigintToNumber })
  blockNumber!: number;

  /** 판정에 쓴 블록 해시 */
  @Column({ name: 'block_hash', type: 'varchar', length: 66 })
  blockHash!: string;

  /** 결과 값 (coin: 해시 마지막 글자, cat-race: 1등 고양이, block-match: 'churu,fish,cat', dice: '3,4') */
  @Column({ type: 'varchar', length: 40 })
  result!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
