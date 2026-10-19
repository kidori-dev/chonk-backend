import { formatUnits, parseUnits } from 'ethers';

import { Currency } from './entities/currency.entity';

/** 포인트는 소수 6자리까지 쓴다 (user_balances.points, ledger_entries.points) */
export const POINT_DECIMALS = 6;

/**
 * 토큰 수량(최소 단위)을 포인트로 바꾼다. 포인트 = 토큰 개수 × point_ratio (소수 6자리 아래는 버린다)
 * 예) USDT(decimals 6) 100000000 = 100 USDT, point_ratio 1 → "100.0"
 */
export function toPoints(
  amount: string,
  currency: Pick<Currency, 'decimals' | 'pointRatio'>,
): string {
  const ratio = parseUnits(currency.pointRatio, POINT_DECIMALS);
  const points = (BigInt(amount) * ratio) / 10n ** BigInt(currency.decimals);
  return formatUnits(points, POINT_DECIMALS);
}

/** DB 의 포인트 값("150.500000")을 보기 좋게 만든다 → "150.5" (정확도를 위해 숫자가 아닌 문자열로 둔다) */
export function formatPoints(points: string): string {
  return points.includes('.') ? points.replace(/\.?0+$/, '') : points;
}
