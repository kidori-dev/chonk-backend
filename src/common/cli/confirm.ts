import { createInterface } from 'readline/promises';

/**
 * 터미널에서 질문하고, 정확히 "yes" 를 입력했을 때만 true.
 * 배포 / sweep 처럼 되돌릴 수 없는 작업 직전에 쓴다.
 */
export async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim() === 'yes';
  } finally {
    rl.close();
  }
}
