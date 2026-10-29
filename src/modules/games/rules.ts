import { randomInt } from 'crypto';

/**
 * 게임 규칙. 결과는 서버가 이 함수들로 정한다 (프론트는 같은 규칙으로 애니메이션만 보여준다).
 * 프론트(chonk-frontend/src/app/games/*)의 규칙과 반드시 같아야 한다. test/games-rules.spec.ts 참고.
 *
 * multiplier = 건 금액의 몇 배를 돌려받는지 (꽝 0, 본전 1). 예) 10 포인트에 2배면 20 을 돌려받는다
 */

export const GAMES = [
  'coin',
  'cat-race',
  'block-match',
  'dice',
  'ladder',
  'lottery',
  'churu-match',
] as const;
export type Game = (typeof GAMES)[number];

/** 블록 해시로 결과가 정해지는 게임. 나머지(churu-match)는 서버 난수로 바로 정해진다 */
export const BLOCK_GAMES: readonly Game[] = [
  'coin',
  'cat-race',
  'block-match',
  'dice',
  'ladder',
  'lottery',
];

/** 게임별로 고를 수 있는 값. null 이면 고르는 것 없이 금액만 건다 */
export const PICKS: Record<Game, readonly string[] | null> = {
  coin: ['odd', 'even'],
  'cat-race': ['orange', 'black', 'calico', 'white'],
  'block-match': null,
  dice: ['low', 'seven', 'high'],
  ladder: ['0', '1', '2', '3'],
  lottery: '0123456789abcdef'.split(''),
  'churu-match': null,
};

/** 걸 수 있는 금액 (포인트) */
export const BET_AMOUNTS = [10, 50, 100];

/** 지금 블록이 N 이면 N+2 블록에 건다 (N+1 이 나오면 마감) */
export const BET_AHEAD = 2;

/** 블록이 나오고(block_time 기준) 이 시간 동안만 배팅할 수 있다. 블록 간격 12초 중 마지막 3초는 마감 */
export const BET_OPEN_MS = 9_000;

/** 판정 블록 뒤로 이만큼 블록이 더 이어지면 정산한다 (짧은 reorg 로 해시가 바뀌는 것 대비) */
export const SETTLE_CONFIRMATIONS = 2;

export interface Outcome {
  /** 결과 값. 예) coin 'f', cat-race 'orange', block-match 'churu,fish,cat', dice '3,4', ladder '2', lottery 'a' */
  result: string;
  /** 건 금액의 몇 배를 돌려받는지 (소수 문자열) */
  multiplier: string;
}

/** 블록 게임 판정 */
export function judgeBlock(game: Game, hash: string, pick: string | null): Outcome {
  switch (game) {
    case 'coin':
      return judgeCoin(hash, pick!);
    case 'cat-race':
      return judgeCatRace(hash, pick!);
    case 'block-match':
      return judgeSymbols(hashSymbols(hash), BLOCK_PAYOUTS);
    case 'dice':
      return judgeDice(hash, pick!);
    case 'ladder':
      return judgeLadder(hash, pick!);
    case 'lottery':
      return judgeLottery(hash, pick!);
    default:
      throw new Error(`블록 게임이 아닙니다: ${game}`);
  }
}

/** 블록 게임 라운드 결과 (고른 값과 상관없이 블록 해시로 정해진다. game_rounds.result) */
export function roundResult(game: Game, hash: string): string {
  return judgeBlock(game, hash, PICKS[game]?.[0] ?? null).result;
}

/** churu-match: 서버 난수로 그림 3개를 뽑아 판정한다 */
export function spinChuru(): Outcome {
  return judgeSymbols(
    [0, 1, 2].map(() => CHURU_SYMBOLS[randomInt(CHURU_SYMBOLS.length)]),
    CHURU_PAYOUTS,
  );
}

// ---- 동전 던지기: 해시 마지막 글자가 홀수면 앞면(odd), 짝수면 뒷면(even). 맞히면 2배 ----

function judgeCoin(hash: string, pick: string): Outcome {
  const char = hash.slice(-1);
  const side = parseInt(char, 16) % 2 === 0 ? 'even' : 'odd';
  return { result: char, multiplier: side === pick ? '2' : '0' };
}

// ---- 고양이 경주: 해시 64글자를 읽으며 글자마다 고양이 한 마리가 한 칸 달린다. 1등을 맞히면 4배 ----

/** 0~3 치즈(orange), 4~7 까망(black), 8~b 삼색이(calico), c~f 하양(white) */
const CATS = ['orange', 'black', 'calico', 'white'];

/** 가장 많이 나온 고양이가 1등. 동점이면 그 칸 수에 먼저 도착한 고양이 */
export function catRaceWinner(hash: string): string {
  const steps = hash
    .slice(2)
    .split('')
    .map((c) => Math.floor(parseInt(c, 16) / 4));
  const counts = [0, 0, 0, 0];
  steps.forEach((s) => counts[s]++);
  const max = Math.max(...counts);

  const running = [0, 0, 0, 0];
  for (const s of steps) {
    running[s]++;
    if (running[s] === max) {
      return CATS[s];
    }
  }
  throw new Error('도달할 수 없음');
}

function judgeCatRace(hash: string, pick: string): Outcome {
  const winner = catRaceWinner(hash);
  return { result: winner, multiplier: winner === pick ? '4' : '0' };
}

// ---- 그림 맞추기 (block-match: 해시 마지막 3글자 / churu-match: 서버 난수) ----

type SymbolPayouts = { churu3: string; same3: string; churu2: string; same2: string };

/** block-match 그림. 0~3 츄르, 4~7 생선, 8~b 고양이, c~f 쥐 */
const BLOCK_SYMBOLS = ['churu', 'fish', 'cat', 'mouse'];

/** 확률: 츄르 3개 1/64, 같은 그림 3개 3/64, 츄르 2개 9/64, 같은 그림 2개 27/64, 모두 다름 24/64 (기대값 0.89) */
export const BLOCK_PAYOUTS: SymbolPayouts = {
  churu3: '12',
  same3: '6',
  churu2: '1.5',
  same2: '0.5',
};

/** churu-match 그림 (5종, 같은 확률) */
const CHURU_SYMBOLS = ['churu', 'fish', 'cat', 'mouse', 'yarn'];

/** 확률: 츄르 3개 1/125, 같은 그림 3개 4/125, 츄르 2개 12/125, 같은 그림 2개 48/125 (기대값 0.90) */
export const CHURU_PAYOUTS: SymbolPayouts = { churu3: '20', same3: '5', churu2: '2', same2: '1' };

function hashSymbols(hash: string): string[] {
  return hash
    .slice(-3)
    .split('')
    .map((c) => BLOCK_SYMBOLS[Math.floor(parseInt(c, 16) / 4)]);
}

function judgeSymbols(symbols: string[], payouts: SymbolPayouts): Outcome {
  const churu = symbols.filter((s) => s === 'churu').length;
  const kinds = new Set(symbols).size;
  const multiplier =
    churu === 3
      ? payouts.churu3
      : kinds === 1
        ? payouts.same3
        : churu === 2
          ? payouts.churu2
          : kinds === 2
            ? payouts.same2
            : '0';
  return { result: symbols.join(','), multiplier };
}

// ---- 주사위: 해시 끝에서부터 1바이트씩 읽어(252 이상은 건너뜀) 주사위 2개. 합이 소(2~6) 2.2배 / 7 5배 / 대(8~12) 2.2배 ----

export function diceOf(hash: string): number[] {
  const hex = hash.slice(2);
  const dice: number[] = [];
  for (let i = hex.length - 2; i >= 0 && dice.length < 2; i -= 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    // 252 = 6의 배수 중 256 이하 최댓값. 넘는 값은 버려야 1~6 이 같은 확률로 나온다
    if (byte < 252) {
      dice.push((byte % 6) + 1);
    }
  }
  return dice;
}

function judgeDice(hash: string, pick: string): Outcome {
  const dice = diceOf(hash);
  // 32바이트 중 31개 이상이 252 이상인 경우(사실상 없음)는 무효로 보고 돌려준다
  if (dice.length < 2) {
    return { result: 'void', multiplier: '1' };
  }
  const sum = dice[0] + dice[1];
  const hit = sum <= 6 ? 'low' : sum === 7 ? 'seven' : 'high';
  const multiplier = hit !== pick ? '0' : hit === 'seven' ? '5' : '2.2';
  return { result: dice.join(','), multiplier };
}

// ---- 사다리: 해시 마지막 글자로 당첨 고양이(출발 칸)를 정한다. 맞히면 3.8배 ----
// 0~3 = 1번(0), 4~7 = 2번(1), 8~b = 3번(2), c~f = 4번(3). 각 1/4
// 프론트는 해시 앞 10글자로 사다리를 그리고, 당첨 출발 칸이 내려가 닿는 칸을 당첨 칸으로 보여준다 (연출일 뿐 결과와 무관)

/** 당첨되는 출발 칸 (0~3) */
export function ladderWinner(hash: string): number {
  return Math.floor(parseInt(hash.slice(-1), 16) / 4);
}

function judgeLadder(hash: string, pick: string): Outcome {
  const winner = String(ladderWinner(hash));
  return { result: winner, multiplier: winner === pick ? '3.8' : '0' };
}

// ---- 제비뽑기: 해시 마지막 글자(0~f) 하나를 맞히면 15배 (확률 1/16) ----

function judgeLottery(hash: string, pick: string): Outcome {
  const char = hash.slice(-1).toLowerCase();
  return { result: char, multiplier: char === pick ? '15' : '0' };
}
