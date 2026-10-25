/**
 * PM2 로 API 서버와 폴링 커맨드를 한 번에 띄운다. 빌드한 dist/ 를 실행한다 (ts-node 아님).
 *
 *   npm run pm2:start    # 빌드 + 전부 시작 (이미 떠 있으면 다시 시작)
 *   npm run pm2:logs     # 로그 (하나만: npx pm2 logs polling-bet)
 *   npm run pm2:status   # 상태
 *   npm run pm2:stop     # 전부 멈춤
 *
 * .env 는 cwd(이 폴더)에서 읽는다.
 * polling-block / polling-deposit 은 반드시 1개씩만 띄운다 (여러 개면 Alchemy 요청이 그만큼 늘어난다).
 * polling-bet 은 여러 개여도 두 번 정산되지 않지만 1개면 충분하다.
 * API 서버는 Socket.IO 를 쓰므로 여러 개로 늘리려면 sticky session 이 필요하다. 지금은 1개.
 */
const common = {
  cwd: __dirname,
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  // 죽으면 바로 다시 띄우지 않고 점점 늘려 가며 기다린다 (키 오류 등으로 계속 죽을 때 Alchemy 를 두드리지 않게)
  exp_backoff_restart_delay: 1000,
  max_memory_restart: '500M',
};

module.exports = {
  apps: [
    { ...common, name: 'chonk-api', script: 'dist/main.js' },
    { ...common, name: 'polling-block', script: 'dist/cli.js', args: 'polling-block' },
    { ...common, name: 'polling-deposit', script: 'dist/cli.js', args: 'polling-deposit' },
    { ...common, name: 'polling-bet', script: 'dist/cli.js', args: 'polling-bet' },
  ],
};
