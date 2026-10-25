import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 블록 게임 라운드 결과(game_rounds) 테이블.
 *
 * 블록 1개마다 블록 게임 4개(coin, cat-race, block-match, dice)의 결과를 남긴다.
 * polling-bet 이 판정 블록 뒤로 2블록이 더 저장되면 기록하고, 같은 트랜잭션에서 그 라운드의 배팅을 정산한다.
 * 게임 화면의 히스토리와 소켓(rounds 이벤트)이 이 결과를 보여준다.
 */
export class CreateGameRounds1794240000000 implements MigrationInterface {
  name = 'CreateGameRounds1794240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "game_rounds" (
        "chain_id" integer NOT NULL,
        "game" character varying(20) NOT NULL,
        "block_number" bigint NOT NULL,
        "block_hash" character varying(66) NOT NULL,
        "result" character varying(40) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_game_rounds" PRIMARY KEY ("chain_id", "game", "block_number")
      )
    `);
    // 소켓이 새로 기록된 라운드를 찾을 때 (게임 상관없이 블록 번호로)
    await queryRunner.query(
      `CREATE INDEX "IDX_game_rounds_block" ON "game_rounds" ("chain_id", "block_number")`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "game_rounds" IS '블록 게임 라운드 결과. 블록 1개 × 블록 게임 4개. polling-bet 이 판정 블록 + 2 블록이 저장되면 기록하고 배팅을 정산한다'`,
    );
    const comments: [string, string][] = [
      ['chain_id', '판정 블록의 체인'],
      ['game', 'coin(동전) / cat-race(고양이 경주) / block-match(블록 그림 맞추기) / dice(주사위)'],
      ['block_number', '판정 블록 번호 (= bets.target_block_number)'],
      ['block_hash', '판정에 쓴 블록 해시 (검증용)'],
      [
        'result',
        "결과 값 (coin: 해시 마지막 글자, cat-race: 1등 고양이, block-match: 그림 3개 'churu,fish,cat', dice: '3,4')",
      ],
      ['created_at', '기록한 시각 (= 그 라운드 배팅을 정산한 시각)'],
    ];
    for (const [column, comment] of comments) {
      await queryRunner.query(
        `COMMENT ON COLUMN "game_rounds"."${column}" IS '${comment.replace(/'/g, "''")}'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "game_rounds"`);
  }
}
