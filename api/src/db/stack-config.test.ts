import { readFileSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// T-02 (B-002). Static checks on the compose stack and env template.
// The end-to-end "docker compose up from a clean clone prints a URL that serves
// the web app" criterion is NOT covered here: it needs a Docker daemon and is a
// smoke step, not a unit test. See the lane report.

const ROOT = new URL('../../../', import.meta.url);
// Missing files read as empty so each assertion fails on its own, not at collect time.
const read = (p: string) => (existsSync(new URL(p, ROOT)) ? readFileSync(new URL(p, ROOT), 'utf8') : '');

// Text of one top-level service block under `services:` in docker-compose.yml.
function serviceBlock(compose: string, name: string): string {
  const lines = compose.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^  ${name}:\\s*$`).test(l));
  if (start < 0) throw new Error(`docker-compose.yml has no service ${name}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[i]) || /^\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

describe('docker-compose.yml starts db, api and web', () => {
  const compose = read('docker-compose.yml');

  it('defines the three services', () => {
    for (const s of ['db', 'api', 'web']) {
      expect(() => serviceBlock(compose, s), `service ${s}`).not.toThrow();
    }
  });

  it('db uses postgres:16', () => {
    expect(serviceBlock(compose, 'db')).toMatch(/image:\s*postgres:16(\s|$)/);
  });

  it('api runs prisma migrate deploy before the server starts listening', () => {
    const api = serviceBlock(compose, 'api');
    const m = api.match(/prisma migrate deploy/);
    expect(m, 'api service must invoke prisma migrate deploy').not.toBeNull();
    // The start command must come after the migrate step, not before it.
    const afterMigrate = api.slice(m!.index!);
    expect(afterMigrate).toMatch(/(node|npm|tsx)\b[^\n]*(start|dist|server|index)/);
  });

  it('api has a dependency on db', () => {
    expect(serviceBlock(compose, 'api')).toMatch(/depends_on:[\s\S]*db:/);
  });

  it('web and api each have a Dockerfile at the path the compose file names', () => {
    expect(existsSync(new URL('api/Dockerfile', ROOT))).toBe(true);
    expect(existsSync(new URL('web/Dockerfile', ROOT))).toBe(true);
  });

  it('no service hard-codes a secret value', () => {
    expect(compose.length).toBeGreaterThan(0);
    expect(compose).not.toMatch(/ANTHROPIC_API_KEY\s*[:=]\s*sk-/);
  });
});

describe('.env.example', () => {
  const env = read('.env.example');
  const keys = env
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('=')[0]);

  it('lists ANTHROPIC_API_KEY and DATABASE_URL', () => {
    expect(keys).toContain('ANTHROPIC_API_KEY');
    expect(keys).toContain('DATABASE_URL');
  });

  it('lists nothing else', () => {
    expect(keys.sort()).toEqual(['ANTHROPIC_API_KEY', 'DATABASE_URL']);
  });

  it('holds no secret value for ANTHROPIC_API_KEY (empty or placeholder only)', () => {
    const line = env.split('\n').find((l) => l.startsWith('ANTHROPIC_API_KEY='));
    expect(line).toBeDefined();
    const value = line!.slice('ANTHROPIC_API_KEY='.length).trim();
    expect(value).not.toMatch(/^sk-ant-/);
    expect(value.length).toBeLessThan(10);
  });
});
