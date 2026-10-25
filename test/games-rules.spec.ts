import { payoutOf } from '../src/modules/games/games.service';
import { catRaceWinner, diceOf, judgeBlock } from '../src/modules/games/rules';

/** 64글자 해시를 만든다. 끝에 tail 을 붙이고 나머지는 fill 로 채운다 */
function hash(tail: string, fill = '5'): string {
  return '0x' + fill.repeat(64 - tail.length) + tail;
}

describe('게임 규칙 (프론트 chonk-frontend/src/app/games/* 와 같아야 한다)', () => {
  it('coin: 마지막 글자 홀수 = odd, 짝수 = even, 맞히면 2배', () => {
    expect(judgeBlock('coin', hash('f'), 'odd')).toEqual({ result: 'f', multiplier: '2' });
    expect(judgeBlock('coin', hash('f'), 'even')).toEqual({ result: 'f', multiplier: '0' });
    expect(judgeBlock('coin', hash('a'), 'even')).toEqual({ result: 'a', multiplier: '2' });
  });

  it('cat-race: 가장 많이 나온 고양이, 동점이면 먼저 도착한 고양이가 1등. 맞히면 4배', () => {
    expect(catRaceWinner(hash('', '0'))).toBe('orange');
    // c(하양) 32개, 4(까망) 32개 동점 → 하양이 먼저 32칸에 도착
    expect(catRaceWinner('0x' + '4c'.repeat(31) + 'c4')).toBe('white');
    expect(judgeBlock('cat-race', hash('', '9'), 'calico')).toEqual({
      result: 'calico',
      multiplier: '4',
    });
    expect(judgeBlock('cat-race', hash('', '9'), 'black').multiplier).toBe('0');
  });

  it('block-match: 마지막 3글자 → 그림 3개 (0~3 츄르, 4~7 생선, 8~b 고양이, c~f 쥐)', () => {
    expect(judgeBlock('block-match', hash('012'), null)).toEqual({
      result: 'churu,churu,churu',
      multiplier: '12',
    });
    expect(judgeBlock('block-match', hash('456'), null).multiplier).toBe('6');
    expect(judgeBlock('block-match', hash('03f'), null).multiplier).toBe('1.5');
    expect(judgeBlock('block-match', hash('cf8'), null).multiplier).toBe('0.5');
    expect(judgeBlock('block-match', hash('048'), null)).toEqual({
      result: 'churu,fish,cat',
      multiplier: '0',
    });
  });

  it('dice: 끝에서부터 1바이트씩, 252 이상은 건너뛴다', () => {
    // ...01 fc 02 → 02 → 3, fc 건너뜀, 01 → 2
    expect(diceOf(hash('01fc02'))).toEqual([3, 2]);
    expect(judgeBlock('dice', hash('01fc02'), 'low')).toEqual({ result: '3,2', multiplier: '2.2' });
    // 0x03 → 4, 0x02 → 3 = 7
    expect(judgeBlock('dice', hash('0203'), 'seven')).toEqual({ result: '4,3', multiplier: '5' });
    expect(judgeBlock('dice', hash('0505'), 'high')).toEqual({ result: '6,6', multiplier: '2.2' });
    expect(judgeBlock('dice', hash('0505'), 'low').multiplier).toBe('0');
  });

  it('payout = amount × multiplier', () => {
    expect(payoutOf('10.000000', '1.5')).toBe('15.0');
    expect(payoutOf('100', '2.2')).toBe('220.0');
    expect(payoutOf('50', '0')).toBe('0.0');
  });
});
