// T-01 reopened (CVB-1). Acceptance tests for the web workspace toolchain.
// The environment test runs in the test process: it fails on an assertion
// while the web vitest environment is still node. The installed-version
// checks fail with "is not installed" until npm install.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(webDir, '..');
const pkg = JSON.parse(readFileSync(resolve(webDir, 'package.json'), 'utf8'));

function declared(name: string): string | undefined {
  for (const p of [pkg, JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))]) {
    const spec = p.devDependencies?.[name] ?? p.dependencies?.[name];
    if (spec) return spec;
  }
  const apiPkg = JSON.parse(readFileSync(resolve(rootDir, 'api', 'package.json'), 'utf8'));
  return apiPkg.devDependencies?.[name] ?? apiPkg.dependencies?.[name];
}

function installedVersion(name: string): string {
  const candidates = [
    resolve(webDir, 'node_modules', name, 'package.json'),
    resolve(rootDir, 'node_modules', name, 'package.json'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`${name} is not installed`);
  return JSON.parse(readFileSync(found, 'utf8')).version;
}

// ADR-010 / architecture.md §1: toolchain entries, pinned by major.
const TOOLCHAIN: Record<string, string> = {
  'happy-dom': '15',
  '@vitejs/plugin-react': '4',
  eslint: '9',
  'typescript-eslint': '8',
};

describe('web test environment (ADR-010)', () => {
  it('runs web tests under happy-dom (document and window.happyDOM exist)', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement('div').tagName).toBe('DIV');
    expect((window as unknown as { happyDOM?: unknown }).happyDOM).toBeDefined();
  });
});

describe('web toolchain declarations (ADR-010)', () => {
  it.each(Object.entries(TOOLCHAIN))('declares %s at major %s', (name, major) => {
    expect(declared(name)).toMatch(new RegExp(`^[\\^~]?${major}\\.`));
  });

  it.each(Object.entries(TOOLCHAIN))('installs %s at major %s', (name, major) => {
    expect(installedVersion(name)).toMatch(new RegExp(`^${major}\\.`));
  });

  it('build script bundles with vite build, not a bare tsc', () => {
    expect(pkg.scripts?.build).toMatch(/\bvite build\b/);
    expect(pkg.scripts?.build).not.toMatch(/\btsc\b/);
  });

  it('vite config registers @vitejs/plugin-react', () => {
    const cfg = resolve(webDir, 'vite.config.ts');
    expect(existsSync(cfg)).toBe(true);
    expect(readFileSync(cfg, 'utf8')).toMatch(/@vitejs\/plugin-react/);
  });

  it('lint script is ESLint with --max-warnings 0, not tsc', () => {
    expect(pkg.scripts?.lint).toMatch(/\beslint\b/);
    expect(pkg.scripts?.lint).toMatch(/--max-warnings[= ]0\b/);
    expect(pkg.scripts?.lint).not.toMatch(/\btsc\b/);
  });

  it('has an ESLint flat config in the web workspace', () => {
    const configs = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts']
      .filter((f) => existsSync(resolve(webDir, f)));
    expect(configs.length).toBeGreaterThan(0);
  });
});
