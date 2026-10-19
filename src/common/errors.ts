/**
 * 로그에 남길 에러 메시지.
 * - ethers 에러는 전체 메시지가 길고 요청 URL 을 담고 있어서 짧은 메시지(shortMessage)를 쓴다
 * - RPC URL 의 API 키(…/v2/<키>)가 섞여 있으면 가린다 (키가 로그로 새지 않게)
 */
export function errorMessage(err: unknown): string {
  const message =
    (err as { shortMessage?: string }).shortMessage ?? (err as Error).message ?? String(err);
  return redactApiKey(message);
}

/** "https://eth-sepolia.g.alchemy.com/v2/abc123" → "https://eth-sepolia.g.alchemy.com/v2/***" */
export function redactApiKey(text: string): string {
  return text.replace(/(\/v2\/)[^/\s"'),]+/g, '$1***');
}
