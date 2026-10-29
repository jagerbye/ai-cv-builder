import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// ADR-021 Amendment A, F-010. The ledger parameter of a pipeline stage and of the gateway is optional in the
// TYPE so that tests can call without a bound; a call without one is bounded by nothing. This guard makes it
// mandatory in practice: it scans production sources under api/src (never *.test.ts) and fails any call of
// extract, compose or callTool that does not pass the ledger, naming the file and line. Same shape as the
// ADR-014 guard in job-writes.guard.test.ts: a pure detector, fixtures proving it rejects, then the real scan.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_ROOT = join(repoRoot, 'api', 'src');

// Stage -> the number of arguments a call must carry for the ledger to be among them.
const REQUIRED_ARGS: Record<string, number> = { extract: 2, compose: 3, callTool: 2 };
// Calls only: `.name(` or `.name<T>(`. A declaration (`async extract(`) has no dot before the name.
const CALL = /\.(extract|compose|callTool)\s*(?:<[^>()]*>)?\s*\(/g;

export interface Violation {
  file: string;
  line: number;
  reason: string;
}

// The top-level arguments of the call whose opening parenthesis is at `open`.
function argumentsAt(text: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = open + 1; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === '\\') current += text[++i] ?? '';
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      current += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) break;
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) args.push(current.trim());
  return args;
}

export function findCallsWithoutLedger(files: { path: string; text: string }[]): Violation[] {
  const violations: Violation[] = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(CALL)) {
      const start = m.index ?? 0;
      const stage = m[1];
      const args = argumentsAt(text, start + m[0].length - 1);
      const last = args[args.length - 1];
      const line = text.slice(0, start).split('\n').length;
      if (args.length < REQUIRED_ARGS[stage]) {
        violations.push({ file: path, line, reason: `${stage}() is called without the ledger argument` });
      } else if (last === 'undefined' || last === 'null') {
        violations.push({ file: path, line, reason: `${stage}() is passed ${last} where the ledger belongs` });
      }
    }
  }
  return violations;
}

function productionSources(): { path: string; text: string }[] {
  return readdirSync(SCAN_ROOT, { recursive: true })
    .map(String)
    .filter((rel) => rel.endsWith('.ts') && !rel.endsWith('.test.ts') && !rel.includes('node_modules'))
    .map((rel) => join(SCAN_ROOT, rel))
    .map((abs) => ({ path: relative(repoRoot, abs), text: readFileSync(abs, 'utf8') }));
}

describe('the detector catches what it claims (fixtures, in memory)', () => {
  const file = 'api/src/core/cv/fixture.ts';
  const check = (text: string) => findCallsWithoutLedger([{ path: file, text }]);

  it('rejects a compose call without a ledger and names the file and line', () => {
    const v = check('const a = 1;\nconst draft = await pipeline.compose(facts, cv.targetRole);\n');
    expect(v).toEqual([{ file, line: 2, reason: expect.stringContaining('compose()') }]);
  });

  it('rejects an extract call without a ledger', () => {
    expect(check('await pipeline.extract(cv.sourceText);')).toHaveLength(1);
  });

  it('rejects a gateway callTool without a ledger, including a generic call', () => {
    expect(check('await gateway.callTool(req);')).toHaveLength(1);
    expect(check('await gateway.callTool<Fact[]>(req);')).toHaveLength(1);
  });

  it('counts only top-level arguments: commas inside a nested call or literal do not hide a missing ledger', () => {
    expect(check('await pipeline.compose(load(a, b, c), { role, x: [1, 2] });')).toHaveLength(1);
  });

  it('rejects a ledger that is passed as undefined or null', () => {
    expect(check('await pipeline.compose(facts, role, undefined);')).toHaveLength(1);
    expect(check('await pipeline.extract(text, null);')).toHaveLength(1);
  });

  it('reports every violation in one file, not only the first', () => {
    const v = check('await pipeline.extract(t);\nawait pipeline.compose(f, r);');
    expect(v.map((x) => x.line)).toEqual([1, 2]);
  });

  it('accepts calls that pass a ledger, including across several lines', () => {
    expect(check('await pipeline.compose(facts, cv.targetRole, ledger);')).toEqual([]);
    expect(check('await pipeline.extract(\n  text,\n  ledger,\n);')).toEqual([]);
    expect(check('await gateway.callTool(req, createTokenLedger(budget));')).toEqual([]);
  });

  it('does not mistake a declaration or an unrelated method for a call', () => {
    expect(check('async extract(sourceText: string, ledger?: TokenLedger): Promise<Fact[]> {}')).toEqual([]);
    expect(check('const r = re.exec(s); list.compose;')).toEqual([]);
  });
});

describe('the real production sources', () => {
  it('reads the sources it is meant to scan (guards against an empty pass)', () => {
    const paths = productionSources().map((f) => f.path);
    for (const p of ['api/src/core/cv/answer.ts', 'api/src/core/jobs/worker.ts', 'api/src/core/generation/extract.ts', 'api/src/core/generation/compose.ts']) {
      expect(paths).toContain(p);
    }
    expect(paths.some((p) => p.endsWith('.test.ts'))).toBe(false);
  });

  it('has no call into a pipeline stage or the gateway that omits the ledger', () => {
    const violations = findCallsWithoutLedger(productionSources());
    const report = [
      ...violations.map((v) => `${v.file}:${v.line} ${v.reason}`),
      'Fix: create a ledger (createTokenLedger) and pass it. ADR-021 Amendment A, F-010.',
    ].join('\n');
    expect(violations.length, report).toBe(0);
  });
});
