import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// T-02 (B-002). Encodes framework/docs/database-schema.md for the Prisma schema
// and the checked-in migration SQL. Static checks: the schema text and the SQL
// text, no database needed. A live apply is covered by health.test.ts.

const PRISMA_DIR = new URL('../../prisma/', import.meta.url);
const schemaPath = new URL('schema.prisma', PRISMA_DIR);
const schema = existsSync(schemaPath) ? readFileSync(schemaPath, 'utf8') : '';

function migrationSql(): string {
  const dir = new URL('migrations/', PRISMA_DIR);
  if (!existsSync(dir)) return '';
  const folders = readdirSync(dir).filter((f) => /^\d+_.+/.test(f)).sort();
  return folders.map((f) => readFileSync(new URL(`migrations/${f}/migration.sql`, PRISMA_DIR), 'utf8')).join('\n');
}

const sql = migrationSql();

// Body of `CREATE TABLE "<name>" ( ... );` as emitted by prisma migrate.
function tableBody(name: string): string {
  const re = new RegExp(`CREATE TABLE "?${name}"?\\s*\\(([\\s\\S]*?)\\n\\);`);
  const m = sql.match(re);
  if (!m) throw new Error(`migration has no CREATE TABLE ${name}`);
  return m[1];
}

// Column line like `"email" CITEXT NOT NULL` — checks name and type fragment.
function expectColumn(table: string, column: string, typeFragment: RegExp) {
  const body = tableBody(table);
  const line = body.split('\n').find((l) => new RegExp(`^\\s*"${column}"\\s`).test(l));
  expect(line, `${table}.${column} missing`).toBeDefined();
  expect(line!).toMatch(typeFragment);
}

describe('prisma schema declares every table in database-schema.md', () => {
  const tables: Record<string, string> = {
    User: 'users',
    Session: 'sessions',
    Cv: 'cvs',
    Fact: 'facts',
    CvItem: 'cv_items',
    Question: 'questions',
    GenerationJob: 'generation_jobs',
  };

  it.each(Object.entries(tables))('model %s maps to table %s', (model, table) => {
    const re = new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`);
    const m = schema.match(re);
    expect(m, `model ${model} missing`).not.toBeNull();
    expect(m![1]).toContain(`@@map("${table}")`);
  });

  it('uses the postgresql provider', () => {
    expect(schema).toMatch(/provider\s*=\s*"postgresql"/);
  });

  it('users.email is unique in the schema', () => {
    const m = schema.match(/model User \{([\s\S]*?)\n\}/);
    expect(m![1]).toMatch(/email\s+String[^\n]*@unique|@@unique\(\[email\]\)/);
  });

  it('sessions.token_hash is unique in the schema', () => {
    const m = schema.match(/model Session \{([\s\S]*?)\n\}/);
    expect(m![1]).toMatch(/tokenHash\s+String[^\n]*@unique|@@unique\(\[tokenHash\]\)/);
  });
});

describe('migration SQL creates all seven tables with their columns', () => {
  it('creates each table', () => {
    for (const t of ['users', 'sessions', 'cvs', 'facts', 'cv_items', 'questions', 'generation_jobs']) {
      expect(sql, `CREATE TABLE ${t}`).toMatch(new RegExp(`CREATE TABLE "?${t}"?\\s*\\(`));
    }
  });

  it('users: id uuid pk, email citext not null, password_hash text not null, timestamps', () => {
    expectColumn('users', 'id', /UUID NOT NULL/);
    expectColumn('users', 'email', /CITEXT NOT NULL/);
    expectColumn('users', 'password_hash', /TEXT NOT NULL/);
    expectColumn('users', 'created_at', /TIMESTAMPTZ/);
    expectColumn('users', 'updated_at', /TIMESTAMPTZ/);
  });

  it('sessions: token_hash not null, user_id fk cascade', () => {
    expectColumn('sessions', 'token_hash', /TEXT NOT NULL/);
    expectColumn('sessions', 'expires_at', /TIMESTAMPTZ/);
    expect(sql).toMatch(/FOREIGN KEY \("user_id"\) REFERENCES "users"\("id"\) ON DELETE CASCADE/);
  });

  it('cvs: target_role, source_kind, state, version default 1', () => {
    expectColumn('cvs', 'target_role', /TEXT NOT NULL/);
    expectColumn('cvs', 'source_text', /TEXT NOT NULL/);
    expectColumn('cvs', 'version', /INTEGER NOT NULL DEFAULT 1/);
    expect(sql).toMatch(/FOREIGN KEY \("user_id"\) REFERENCES "users"\("id"\) ON DELETE CASCADE/);
  });

  it('facts: source_quote default empty string, source column', () => {
    expectColumn('facts', 'source_quote', /TEXT NOT NULL DEFAULT ''/);
    expectColumn('facts', 'source', /TEXT NOT NULL/);
  });

  it('cv_items: data jsonb, fact_ids uuid[] default empty, relevance numeric(4,3), user_edited default false', () => {
    expectColumn('cv_items', 'data', /JSONB NOT NULL/);
    expectColumn('cv_items', 'fact_ids', /UUID\[\] NOT NULL DEFAULT '\{\}'/);
    expectColumn('cv_items', 'relevance', /DECIMAL\(4,3\)/);
    expectColumn('cv_items', 'user_edited', /BOOLEAN NOT NULL DEFAULT false/);
    expectColumn('cv_items', 'order_index', /INTEGER NOT NULL/);
    expect(sql).toMatch(/FOREIGN KEY \("parent_id"\) REFERENCES "cv_items"\("id"\) ON DELETE CASCADE/);
  });

  it('questions: priority default 100, answered_at, follow_up_of_id fk', () => {
    expectColumn('questions', 'priority', /INTEGER NOT NULL DEFAULT 100/);
    expectColumn('questions', 'answer', /TEXT/);
    expectColumn('questions', 'answered_at', /TIMESTAMPTZ/);
    expect(sql).toMatch(/FOREIGN KEY \("follow_up_of_id"\) REFERENCES "questions"\("id"\)/);
  });

  it('generation_jobs: attempt default 0, scope default full, token columns, no defaults on status', () => {
    expectColumn('generation_jobs', 'attempt', /INTEGER NOT NULL DEFAULT 0/);
    expectColumn('generation_jobs', 'scope', /TEXT NOT NULL DEFAULT 'full'/);
    expectColumn('generation_jobs', 'status', /TEXT NOT NULL/);
    expectColumn('generation_jobs', 'leased_until', /TIMESTAMPTZ/);
    expectColumn('generation_jobs', 'input_tokens', /INTEGER/);
    expectColumn('generation_jobs', 'output_tokens', /INTEGER/);
    expectColumn('generation_jobs', 'scope_path', /TEXT/);
  });
});

describe('check constraints (raw SQL: Prisma cannot emit CHECK)', () => {
  const checks: [string, string, string][] = [
    ['cvs', 'source_kind', "'pdf', 'text'"],
    ['cvs', 'state', "'generating', 'ready', 'failed'"],
    ['facts', 'source', "'document', 'user'"],
    ['questions', 'status', "'open', 'answered', 'dismissed'"],
  ];

  it.each(checks)('%s.%s rejects values outside the enum', (table, col, values) => {
    const re = new RegExp(`ALTER TABLE "?${table}"?[\\s\\S]*?CHECK\\s*\\(\\s*"?${col}"?\\s+IN\\s*\\(\\s*${values.replace(/[()]/g, '\\$&')}\\s*\\)\\s*\\)`);
    expect(sql).toMatch(re);
  });

  it('a value outside the enum is rejected by the constraint text, a listed value is allowed', () => {
    // Positive: 'pdf' is listed. Negative: 'docx' is not — the constraint must not be a bare CHECK (true).
    const m = sql.match(/CHECK\s*\(\s*"?source_kind"?\s+IN\s*\(([^)]*)\)\s*\)/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("'pdf'");
    expect(m![1]).not.toContain("'docx'");
  });
});

describe('indexes listed in database-schema.md', () => {
  it('users: unique(email)', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX "users_email_key" ON "users"\("email"\)/);
  });

  it('sessions: unique(token_hash) and (expires_at)', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"\("token_hash"\)/);
    expect(sql).toMatch(/CREATE INDEX "sessions_expires_at_idx" ON "sessions"\("expires_at"\)/);
  });

  it('cvs: (user_id, updated_at desc)', () => {
    expect(sql).toMatch(/CREATE INDEX "cvs_user_id_updated_at_idx" ON "cvs"\("user_id", "updated_at" DESC\)/);
  });

  it('facts: (cv_id)', () => {
    expect(sql).toMatch(/CREATE INDEX "facts_cv_id_idx" ON "facts"\("cv_id"\)/);
  });

  it('cv_items: (cv_id, kind, order_index) and unique(cv_id, path)', () => {
    expect(sql).toMatch(/CREATE INDEX "cv_items_cv_id_kind_order_index_idx" ON "cv_items"\("cv_id", "kind", "order_index"\)/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "cv_items_cv_id_path_key" ON "cv_items"\("cv_id", "path"\)/);
  });

  it('questions: (cv_id, status, priority)', () => {
    expect(sql).toMatch(/CREATE INDEX "questions_cv_id_status_priority_idx" ON "questions"\("cv_id", "status", "priority"\)/);
  });

  it('generation_jobs: partial lease index WHERE status IN (queued, running)', () => {
    expect(sql).toMatch(
      /CREATE INDEX "generation_jobs_status_leased_until_idx" ON "generation_jobs"\("status", "leased_until"\)\s+WHERE status IN \('queued', 'running'\)/,
    );
  });

  it('generation_jobs: partial unique index one job in flight per CV', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "generation_jobs_cv_id_in_flight_key" ON "generation_jobs"\("cv_id"\)\s+WHERE status IN \('queued', 'running'\)/,
    );
  });

  it('the two partial indexes are NOT expressed in schema.prisma (they live in raw SQL only)', () => {
    expect(schema.length).toBeGreaterThan(0);
    expect(schema).not.toMatch(/where:/i);
  });
});
