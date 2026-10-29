import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// T-25 (CVB-28). ADR-014, E-002. Grep-shaped guard: a test source that writes a NON-TERMINAL
// generation_jobs row directly, instead of through openJobTestSuite().enqueue in
// api/src/core/jobs/test-lock.ts, fails here, and the message names the file and line.
// Only *.test.ts files are read: production code (persist.ts, worker.ts) writes rows by design.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_ROOTS = [join(repoRoot, 'api', 'src'), join(repoRoot, 'tests')];
// This file is the detector. Its fixtures are in-memory strings, so it is excluded from the scan.
const SELF = 'job-writes.guard.test.ts';

const FOUR_SUITES = [
  'api/src/core/jobs/jobs.test.ts',
  'api/src/core/jobs/boundaries.test.ts',
  'tests/contract/jobs.test.ts',
  'tests/contract/cvs-create.test.ts',
];

// Direct writes: Prisma model calls and raw SQL.
const WRITE = /\.generationJob\.(?:create|createMany|upsert|update|updateMany)\s*\(|\b(?:INSERT\s+INTO|UPDATE)\s+"?generation_jobs"?\b/gi;
const NON_TERMINAL = /(['"`])(queued|running)\1/;
const TERMINAL = /(['"`])(succeeded|failed)\1/;

export interface Violation {
  file: string;
  line: number;
  reason: string;
}

// The text of one write statement: from the match to the end of its call or SQL statement.
function statementAfter(text: string, from: number): string {
  const rest = text.slice(from, from + 400);
  const cut = rest.search(/\}\s*\)|;|`/);
  return cut === -1 ? rest : rest.slice(0, cut);
}

function reasonFor(statement: string): string | null {
  if (NON_TERMINAL.test(statement)) return 'writes a queued or running generation_jobs row directly';
  if (TERMINAL.test(statement)) return null;
  return 'writes a generation_jobs row whose status is not a terminal literal (dynamic or missing)';
}

export function findUnsafeJobWrites(files: { path: string; text: string }[]): Violation[] {
  const violations: Violation[] = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(WRITE)) {
      const start = m.index ?? 0;
      const reason = reasonFor(statementAfter(text, start + m[0].length));
      if (reason) violations.push({ file: path, line: text.slice(0, start).split('\n').length, reason });
    }
  }
  return violations;
}

function testSources(): { path: string; text: string }[] {
  return SCAN_ROOTS.flatMap((root) =>
    readdirSync(root, { recursive: true })
      .map(String)
      .filter((rel) => rel.endsWith('.test.ts') && !rel.includes('node_modules') && !rel.endsWith(SELF))
      .map((rel) => join(root, rel)),
  ).map((abs) => ({ path: relative(repoRoot, abs), text: readFileSync(abs, 'utf8') }));
}

function formatViolations(violations: Violation[]): string {
  return [
    ...violations.map((v) => `${v.file}:${v.line} ${v.reason}`),
    'Fix: enqueue through openJobTestSuite(prisma).enqueue (api/src/core/jobs/test-lock.ts). ADR-014, E-002.',
  ].join('\n');
}

describe('the detector catches what it claims (fixtures, in memory)', () => {
  const file = 'api/src/core/jobs/fixture.test.ts';
  const check = (text: string) => findUnsafeJobWrites([{ path: file, text }]);

  it('rejects a direct create of a queued row and names the file and line', () => {
    const v = check("const x = 1;\nawait prisma.generationJob.create({ data: { cvId, userId, status: 'queued' } });\n");
    expect(v).toEqual([{ file, line: 2, reason: expect.stringContaining('queued') }]);
  });

  it('rejects a transaction-client create of a running row', () => {
    const v = check("await tx.generationJob.create({ data: { cvId, userId, status: 'running', attempt: 1 } });");
    expect(v).toHaveLength(1);
  });

  it('rejects a dynamic status, because the detector cannot prove it terminal', () => {
    const v = check('await prisma.generationJob.create({ data: { cvId, userId, status: data.status } });');
    expect(v).toHaveLength(1);
    expect(v[0].reason).toContain('not a terminal literal');
  });

  it('rejects a hand-rolled raw INSERT of a running row', () => {
    const v = check(
      "await tx.$executeRaw`INSERT INTO generation_jobs (cv_id, user_id, status) VALUES (${cvId}::uuid, ${userId}::uuid, 'running')`;",
    );
    expect(v).toHaveLength(1);
  });

  it('reports every violation in one file, not only the first', () => {
    const v = check(
      "await prisma.generationJob.create({ data: { status: 'queued' } });\nawait prisma.generationJob.create({ data: { status: 'running' } });",
    );
    expect(v.map((x) => x.line)).toEqual([1, 2]);
  });

  it('accepts a direct write of a terminal row', () => {
    expect(check("await prisma.generationJob.create({ data: { cvId, userId, status: 'succeeded' } });")).toEqual([]);
  });

  it('accepts a read of a job row', () => {
    expect(check('const job = await prisma.generationJob.findUnique({ where: { id } });')).toEqual([]);
  });

  it('accepts the helper call', () => {
    expect(check("const id = await suite.enqueue({ cvId, userId, status: 'queued' });")).toEqual([]);
  });
});

describe('the real test sources', () => {
  it('reads the test sources it is meant to scan (guards against an empty pass)', () => {
    const paths = testSources().map((f) => f.path);
    for (const suite of FOUR_SUITES) expect(paths).toContain(suite);
    expect(paths).toContain('tests/contract/cvs-read.test.ts');
  });

  it('has no test file that writes a non-terminal generation_jobs row outside the helper', () => {
    const violations = findUnsafeJobWrites(testSources());
    expect(violations.length, formatViolations(violations)).toBe(0);
  });

  it.each(FOUR_SUITES)('%s goes through the job-test helper', (path) => {
    const text = readFileSync(join(repoRoot, path), 'utf8');
    expect(text, `${path} must import the helper module`).toMatch(/from\s+['"][^'"]*test-lock(\.js)?['"]/);
    expect(text, `${path} must enqueue through openJobTestSuite`).toMatch(/\bopenJobTestSuite\s*\(/);
  });
});
