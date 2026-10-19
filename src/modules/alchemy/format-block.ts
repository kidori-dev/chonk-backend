import { Block } from 'ethers';

/** 블록을 로그 한 줄로 만든다. 예) #123 0xabc... txs=150 time=2026-10-18T13:26:47.000Z */
export function formatBlock(block: Block): string {
  const time = new Date(block.timestamp * 1000).toISOString();
  return `#${block.number} ${block.hash} txs=${block.transactions.length} time=${time}`;
}
