import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 컬럼 순서 정리 + blocks.updated_at 추가.
 *
 * 규칙: 키(id, chain_id 등) → 나머지 컬럼 → created_at → updated_at (마지막).
 * 나중에 ADD COLUMN 한 컬럼이 맨 뒤에 붙어 순서가 어긋난 테이블만 다시 만든다.
 * Postgres 는 컬럼 순서를 바꿀 수 없어서, 현재 정의(타입/기본값/제약/인덱스/FK/COMMENT)를 그대로 읽어
 * 새 순서로 테이블을 만들고 데이터를 옮긴다 (rebuildTable).
 */
const NEW_ORDER: Record<string, string[]> = {
  blocks: [
    'chain_id',
    'number',
    'hash',
    'parent_hash',
    'tx_count',
    'block_time',
    'status',
    'is_scanned',
    'created_at',
    'updated_at',
  ],
  currencies: [
    'id',
    'chain_id',
    'symbol',
    'decimals',
    'address',
    'point_ratio',
    'min_sweep_amount',
    'is_active',
    'created_at',
    'updated_at',
  ],
  refresh_tokens: [
    'id',
    'user_id',
    'token_hash',
    'expires_at',
    'revoked_at',
    'revoke_reason',
    'created_at',
  ],
  sweeps: [
    'id',
    'chain_id',
    'factory_address',
    'treasury_address',
    'executor_address',
    'nonce',
    'plan',
    'tx_hash',
    'status',
    'block_number',
    'gas_used',
    'fee_wei',
    'error',
    'created_at',
    'updated_at',
  ],
};

/** 되돌릴 때의 순서 (이 마이그레이션 전. blocks.updated_at 은 지우기 전이라 맨 뒤에 둔다) */
const OLD_ORDER: Record<string, string[]> = {
  blocks: [
    'number',
    'hash',
    'parent_hash',
    'tx_count',
    'block_time',
    'created_at',
    'chain_id',
    'status',
    'is_scanned',
    'updated_at',
  ],
  currencies: [
    'id',
    'chain_id',
    'symbol',
    'decimals',
    'address',
    'is_active',
    'created_at',
    'updated_at',
    'min_sweep_amount',
    'point_ratio',
  ],
  refresh_tokens: [
    'id',
    'user_id',
    'token_hash',
    'expires_at',
    'revoked_at',
    'created_at',
    'revoke_reason',
  ],
  sweeps: [
    'id',
    'chain_id',
    'factory_address',
    'treasury_address',
    'executor_address',
    'tx_hash',
    'status',
    'block_number',
    'gas_used',
    'fee_wei',
    'error',
    'created_at',
    'updated_at',
    'nonce',
    'plan',
  ],
};

export class ColumnOrder1794067200000 implements MigrationInterface {
  name = 'ColumnOrder1794067200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "blocks" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(`UPDATE "blocks" SET "updated_at" = "created_at"`);
    await queryRunner.query(
      `COMMENT ON COLUMN "blocks"."updated_at" IS '마지막으로 바뀐 시각 (status / is_scanned 변경 등)'`,
    );

    for (const [table, columns] of Object.entries(NEW_ORDER)) {
      await rebuildTable(queryRunner, table, columns);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, columns] of Object.entries(OLD_ORDER)) {
      await rebuildTable(queryRunner, table, columns);
    }
    await queryRunner.query(`ALTER TABLE "blocks" DROP COLUMN "updated_at"`);
  }
}

interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  default: string | null;
  /** '' 이면 identity 아님, 'a' = ALWAYS, 'd' = BY DEFAULT */
  identity: string;
  comment: string | null;
}

/**
 * table 을 columns 순서로 다시 만든다. 컬럼 정의, 제약(PK/UNIQUE/CHECK/FK), 인덱스,
 * 이 테이블을 가리키는 다른 테이블의 FK, COMMENT, identity 시퀀스 값을 그대로 옮긴다.
 */
async function rebuildTable(
  queryRunner: QueryRunner,
  table: string,
  columns: string[],
): Promise<void> {
  const q = (sql: string, params?: unknown[]) => queryRunner.query(sql, params);

  // 1) 현재 정의 읽기
  const current = (await q(
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS notnull,
       pg_get_expr(d.adbin, d.adrelid) AS default, a.attidentity AS identity,
       col_description(a.attrelid, a.attnum) AS comment
     FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped`,
    [table],
  )) as ColumnInfo[];
  const byName = new Map(current.map((c) => [c.name, c]));
  if (current.length !== columns.length || columns.some((c) => !byName.has(c))) {
    throw new Error(
      `${table} 컬럼이 예상과 다릅니다. 현재: ${current.map((c) => c.name).join(', ')}`,
    );
  }

  const constraints = (await q(
    `SELECT conname AS name, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = $1::regclass AND contype IN ('p', 'u', 'c', 'f')
     ORDER BY CASE contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 ELSE 3 END, conname`,
    [table],
  )) as { name: string; def: string }[];
  const indexes = (await q(
    `SELECT indexname AS name, indexdef AS def FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1
       AND indexname NOT IN (SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass)`,
    [table],
  )) as { name: string; def: string }[];
  const inboundFks = (await q(
    `SELECT conrelid::regclass::text AS "table", conname AS name, pg_get_constraintdef(oid) AS def
     FROM pg_constraint WHERE contype = 'f' AND confrelid = $1::regclass AND conrelid <> confrelid`,
    [table],
  )) as { table: string; name: string; def: string }[];
  const [{ comment: tableComment }] = (await q(
    `SELECT obj_description($1::regclass, 'pg_class') AS comment`,
    [table],
  )) as { comment: string | null }[];

  // 2) 옛 테이블에서 제약/인덱스를 떼어 이름을 비우고, 이름을 바꿔 둔다
  for (const fk of inboundFks) {
    await q(`ALTER TABLE ${fk.table} DROP CONSTRAINT "${fk.name}"`);
  }
  for (const c of [...constraints].reverse()) {
    await q(`ALTER TABLE "${table}" DROP CONSTRAINT "${c.name}"`);
  }
  for (const i of indexes) {
    await q(`DROP INDEX "${i.name}"`);
  }
  await q(`ALTER TABLE "${table}" RENAME TO "${table}__old"`);

  // 3) 새 순서로 만들고 데이터 옮기기
  const defs = columns.map((name) => {
    const c = byName.get(name)!;
    let def = `"${name}" ${c.type}`;
    if (c.identity) {
      def += ` GENERATED ${c.identity === 'a' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`;
    } else if (c.default !== null) {
      def += ` DEFAULT ${c.default}`;
    }
    return c.notnull ? `${def} NOT NULL` : def;
  });
  await q(`CREATE TABLE "${table}" (${defs.join(', ')})`);
  const list = columns.map((c) => `"${c}"`).join(', ');
  const hasIdentity = current.some((c) => c.identity);
  await q(
    `INSERT INTO "${table}" (${list}) ${hasIdentity ? 'OVERRIDING SYSTEM VALUE ' : ''}` +
      `SELECT ${list} FROM "${table}__old"`,
  );
  await q(`DROP TABLE "${table}__old"`);

  // 4) 제약/인덱스/FK/COMMENT/시퀀스 되살리기
  for (const c of constraints) {
    await q(`ALTER TABLE "${table}" ADD CONSTRAINT "${c.name}" ${c.def}`);
  }
  for (const i of indexes) {
    await q(i.def);
  }
  for (const fk of inboundFks) {
    await q(`ALTER TABLE ${fk.table} ADD CONSTRAINT "${fk.name}" ${fk.def}`);
  }
  if (tableComment !== null) {
    await q(`COMMENT ON TABLE "${table}" IS ${quote(tableComment)}`);
  }
  for (const c of current) {
    if (c.comment !== null) {
      await q(`COMMENT ON COLUMN "${table}"."${c.name}" IS ${quote(c.comment)}`);
    }
    if (c.identity) {
      await q(
        `SELECT setval(pg_get_serial_sequence('"${table}"', '${c.name}'), MAX("${c.name}")) FROM "${table}"`,
      );
    }
  }
}

/** SQL 문자열 리터럴로 감싼다 (작은따옴표 이스케이프) */
function quote(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}
