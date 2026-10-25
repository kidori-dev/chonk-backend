import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 게임 배팅(bets) 테이블.
 *
 * - 블록 게임(coin, cat-race, block-match, dice): 지금 블록이 N 이면 N+2 블록에 건다.
 *   걸 때 포인트를 빼고, 판정 블록 뒤로 2블록이 더 이어지면 polling-bet 이 판정해 돌려준다.
 * - churu-match: 서버 난수로 바로 판정한다 (chain_id, target_block_number, block_hash 는 null).
 * - 한 유저는 한 게임의 한 라운드(판정 블록)에 한 번만 건다.
 *
 * user_balance_histories.type 에 bet(배팅으로 차감) / bet_payout(정산으로 지급) 이 추가된다. target_id = bets.id.
 */
export class CreateBets1794153600000 implements MigrationInterface {
  name = 'CreateBets1794153600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bets" (
        "id" bigint GENERATED ALWAYS AS IDENTITY,
        "user_id" uuid NOT NULL,
        "game" character varying(20) NOT NULL,
        "chain_id" integer,
        "target_block_number" bigint,
        "pick" character varying(20),
        "amount" numeric(38,6) NOT NULL,
        "status" character varying(12) NOT NULL DEFAULT 'pending',
        "block_hash" character varying(66),
        "result" character varying(40),
        "multiplier" numeric(10,4),
        "payout" numeric(38,6),
        "settled_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bets_user_round" UNIQUE ("user_id", "game", "chain_id", "target_block_number"),
        CONSTRAINT "CHK_bets_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_bets_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    // polling-bet: 정산할 배팅 찾기
    await queryRunner.query(
      `CREATE INDEX "IDX_bets_pending" ON "bets" ("chain_id", "target_block_number") WHERE "status" = 'pending'`,
    );
    // 내 배팅 기록 (게임별, 최근 것부터)
    await queryRunner.query(
      `CREATE INDEX "IDX_bets_user_game" ON "bets" ("user_id", "game", "id")`,
    );

    const comments: [string, string][] = [
      ['id', 'bigint identity'],
      ['user_id', '건 유저 (users.id)'],
      [
        'game',
        'coin(동전) / cat-race(고양이 경주) / block-match(블록 그림 맞추기) / dice(주사위) / churu-match(츄르 그림 맞추기)',
      ],
      ['chain_id', '판정 블록의 체인. churu-match 는 null'],
      [
        'target_block_number',
        '판정 블록 번호. 걸 때 서버가 정한다 (최신 블록 + 2). churu-match 는 null',
      ],
      [
        'pick',
        '고른 값 (coin: odd/even, cat-race: orange/black/calico/white, dice: low/seven/high). 고르는 것 없는 게임은 null',
      ],
      ['amount', '건 포인트 (걸 때 user_balances 에서 뺀다)'],
      ['status', 'pending: 결과 대기 / settled: 판정하고 payout 까지 반영함'],
      ['block_hash', '판정에 쓴 블록 해시 (검증용). churu-match 는 null'],
      [
        'result',
        "결과 값 (coin: 해시 마지막 글자, cat-race: 1등 고양이, block-match/churu-match: 그림 3개 'churu,fish,cat', dice: '3,4'). 정산 전 null",
      ],
      ['multiplier', '건 금액의 몇 배를 돌려받았는지 (꽝 0, 본전 1). 정산 전 null'],
      [
        'payout',
        '돌려받은 포인트 = amount × multiplier. 0 보다 크면 bet_payout 이력이 남는다. 정산 전 null',
      ],
      ['settled_at', '정산한 시각'],
      ['created_at', '건 시각'],
      ['updated_at', '마지막으로 바뀐 시각'],
    ];
    await queryRunner.query(
      `COMMENT ON TABLE "bets" IS '게임 배팅 1건 = 1행. 걸 때 포인트 차감(bet), 정산 때 payout 지급(bet_payout). 유저당 게임·라운드마다 1번'`,
    );
    for (const [column, comment] of comments) {
      await queryRunner.query(
        `COMMENT ON COLUMN "bets"."${column}" IS '${comment.replace(/'/g, "''")}'`,
      );
    }

    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."type" IS ` +
        `'바뀐 이유. deposit: 입금 / withdraw: 출금 / bet: 배팅으로 차감 / bet_payout: 배팅 정산으로 지급'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."target_id" IS ` +
        `'원인이 된 행의 id. type 에 따라 가리키는 테이블이 달라 FK 없음 (deposit → transactions.id, bet/bet_payout → bets.id). ` +
        `(type, target_id) 유니크로 두 번 반영되지 않는다'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bets"`);
    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."type" IS '바뀐 이유. deposit: 입금 / withdraw: 출금'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "user_balance_histories"."target_id" IS ` +
        `'원인이 된 행의 id. type 에 따라 가리키는 테이블이 달라 FK 없음 (deposit → transactions.id). ` +
        `(type, target_id) 유니크로 두 번 반영되지 않는다'`,
    );
  }
}
