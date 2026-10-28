// T-01 reopened (CVB-1). Acceptance tests for the api workspace toolchain.
// Declared-pin checks read package.json (they fail on assertions until the
// developer edits it). Installed-version checks read node_modules (they fail
// with "is not installed" until npm install). The lint probe imports eslint
// through a variable specifier so tsc does not need the package to typecheck.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '..');
const pkg = JSON.parse(readFileSync(resolve(apiDir, 'package.json'), 'utf8'));

// ADR-010 / architecture.md §1: exact runtime pins for the api workspace.
const RUNTIME: Record<string, string> = {
  fastify: '5.12.7',
  '@prisma/client': '5.22.0',
  '@anthropic-ai/sdk': '0.137.0',
  'pdf-parse': '2.4.5',
  '@react-pdf/renderer': '4.9.0',
  react: '18.3.1',
};

function installedVersion(name: string): string {
  const candidates = [
    resolve(apiDir, 'node_modules', name, 'package.json'),
    resolve(rootDir, 'node_modules', name, 'package.json'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`${name} is not installed`);
  return JSON.parse(readFileSync(found, 'utf8')).version;
}

describe('api runtime dependencies (B-001)', () => {
  it.each(Object.entries(RUNTIME))('declares %s as exact pin %s', (name, version) => {
    expect(pkg.dependencies?.[name]).toBe(version);
  });

  it.each(Object.entries(RUNTIME))('installs %s at %s', (name, version) => {
    expect(installedVersion(name)).toBe(version);
  });
});

describe('api toolchain (ADR-010, ADR-012)', () => {
  // ADR-012 moved the project to Node 24 LTS; @types/node tracks it (24.x exact).
  it('pins @types/node to an exact 24.x version in the declaration', () => {
    expect(pkg.devDependencies?.['@types/node']).toMatch(/^24\.\d+\.\d+$/);
  });

  it('resolves @types/node from api to a 24.x install (not 22.x or 26.x)', () => {
    expect(installedVersion('@types/node')).toMatch(/^24\./);
  });

  it('lint script is ESLint with --max-warnings 0, not tsc', () => {
    expect(pkg.scripts?.lint).toMatch(/\beslint\b/);
    expect(pkg.scripts?.lint).toMatch(/--max-warnings[= ]0\b/);
    expect(pkg.scripts?.lint).not.toMatch(/\btsc\b/);
  });

  it('has an ESLint flat config in the api workspace', () => {
    const configs = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts']
      .filter((f) => existsSync(resolve(apiDir, f)));
    expect(configs.length).toBeGreaterThan(0);
  });

  it('an unused local in api/src fails the real linter', async () => {
    const spec = 'eslint'; // variable specifier: keeps tsc from resolving it
    const mod = (await import(/* @vite-ignore */ spec)) as {
      ESLint: new (o: { cwd: string }) => {
        lintText(
          code: string,
          o: { filePath: string },
        ): Promise<Array<{ errorCount: number; warningCount: number; messages: Array<{ ruleId: string | null }> }>>;
      };
    };
    const eslint = new mod.ESLint({ cwd: apiDir });
    const [res] = await eslint.lintText('const unused = 1;\nexport {};\n', {
      filePath: resolve(apiDir, 'src/__lint_probe.ts'),
    });
    expect(res.errorCount + res.warningCount).toBeGreaterThan(0);
    expect(res.messages.some((m) => /no-unused-vars$/.test(m.ruleId ?? ''))).toBe(true);
  });
});
