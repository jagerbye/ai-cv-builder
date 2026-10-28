// T-03 reopened (CVB-3), ADR-012. Acceptance tests for the Node 24 LTS move.
// Registration hashes with node:crypto.argon2, which exists from Node 24.7; the
// project pinned Node 22 everywhere, so the container answered 500 INTERNAL.
// These tests read the pins declared in the repo, so they fail on assertions
// until the developer edits them. The container proof (docker compose build,
// up, POST /api/auth/register via the container) is a command run outside this
// suite; see the lane log.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as nodeCrypto from 'node:crypto';

const rootDir = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(rootDir, rel), 'utf8');
const readJson = (rel: string) => JSON.parse(read(rel));

// Accepts "24", "^24", ">=24" or "^24.0.0" style declarations; rejects any 22.x.
const NODE_24_RANGE = /^(\^|>=)?24(\.\d+){0,2}$/;
const EXACT_24 = /^24\.\d+\.\d+$/;

describe('ADR-012: the project runs on Node 24 LTS', () => {
  it('.nvmrc names Node 24', () => {
    expect(read('.nvmrc').trim()).toMatch(/^24(\.\d+){0,2}$/);
  });

  it.each([
    ['root package.json', 'package.json'],
    ['api/package.json', 'api/package.json'],
    ['web/package.json', 'web/package.json'],
  ])('engines.node in %s is Node 24', (_label, rel) => {
    expect(readJson(rel).engines?.node).toMatch(NODE_24_RANGE);
  });

  it.each([
    ['api/Dockerfile', 'api/Dockerfile'],
    ['web/Dockerfile', 'web/Dockerfile'],
  ])('every FROM node: line in %s is node:24', (_label, rel) => {
    const froms = read(rel)
      .split('\n')
      .filter((l) => /^\s*FROM\s+node:/i.test(l));
    expect(froms.length).toBeGreaterThan(0);
    for (const line of froms) expect(line).toMatch(/^\s*FROM\s+node:24[-.\w]*\b/i);
  });

  it('CI installs Node 24 (setup-node node-version) and never 22', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/node-version:\s*['"]?24['"]?\s*$/m);
    expect(ci).not.toMatch(/node-version:\s*['"]?22/);
  });

  it('@types/node is pinned exact to a 24.x in the root override and both workspaces', () => {
    expect(readJson('package.json').overrides?.['@types/node']).toMatch(EXACT_24);
    expect(readJson('api/package.json').devDependencies?.['@types/node']).toMatch(EXACT_24);
    expect(readJson('web/package.json').devDependencies?.['@types/node']).toMatch(EXACT_24);
  });

  it('package-lock.json resolves @types/node to a 24.x', () => {
    const lock = readJson('package-lock.json');
    expect(lock.packages?.['node_modules/@types/node']?.version).toMatch(/^24\./);
  });

  it('package-lock.json root engines name Node 24', () => {
    expect(readJson('package-lock.json').packages?.['']?.engines?.node).toMatch(NODE_24_RANGE);
  });

  it('api resolves @types/node to an installed 24.x (not 22.x)', () => {
    const candidates = [
      resolve(rootDir, 'api/node_modules/@types/node/package.json'),
      resolve(rootDir, 'node_modules/@types/node/package.json'),
    ];
    const found = candidates.find((p) => existsSync(p));
    expect(found, 'no @types/node installed for api').toBeDefined();
    expect(JSON.parse(readFileSync(found!, 'utf8')).version).toMatch(/^24\./);
  });

  it('the running runtime provides node:crypto.argon2 (Node 24.7+), which password.ts requires', () => {
    const [major, minor] = process.versions.node.split('.').map(Number);
    expect(major > 24 || (major === 24 && minor >= 7)).toBe(true);
    expect(typeof (nodeCrypto as unknown as { argon2?: unknown }).argon2).toBe('function');
  });
});
