// Sprint 001 QA-01 wiring checks. Static and config-level: they do not need the
// stack, so they say WHERE the route to the api is declared, not whether it works
// (stack.smoke.test.ts proves that). Each block is one acceptance line of QA-01.
import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(resolve(rootDir, rel), 'utf8');

type ProxyEntry = { target?: string; changeOrigin?: boolean; rewrite?: unknown };
type ServerLike = {
  server?: { proxy?: Record<string, ProxyEntry> };
  preview?: { proxy?: Record<string, ProxyEntry> };
};

async function loadViteConfig(): Promise<ServerLike> {
  vi.resetModules();
  const mod = (await import('../../web/vite.config')) as { default: unknown };
  const cfg = mod.default;
  return (typeof cfg === 'function' ? cfg({ command: 'serve', mode: 'development' }) : cfg) as ServerLike;
}

describe('browser reaches the api on the same origin (QA-01)', () => {
  it('vite dev server (server.proxy) forwards /api to the api', async () => {
    const cfg = await loadViteConfig();
    expect(cfg.server?.proxy?.['/api']).toBeDefined();
  });

  it('vite preview (preview.proxy), which the web container runs, forwards /api to the api', async () => {
    const cfg = await loadViteConfig();
    expect(cfg.preview?.proxy?.['/api']).toBeDefined();
  });

  it('dev and preview point at the same target, read from API_PROXY_TARGET with a host default', async () => {
    const saved = process.env.API_PROXY_TARGET;
    try {
      delete process.env.API_PROXY_TARGET;
      const dflt = await loadViteConfig();
      expect(dflt.server?.proxy?.['/api']?.target).toBe('http://127.0.0.1:3000');
      expect(dflt.preview?.proxy?.['/api']?.target).toBe('http://127.0.0.1:3000');

      process.env.API_PROXY_TARGET = 'http://api:3000';
      const inDocker = await loadViteConfig();
      expect(inDocker.server?.proxy?.['/api']?.target).toBe('http://api:3000');
      expect(inDocker.preview?.proxy?.['/api']?.target).toBe('http://api:3000');
    } finally {
      if (saved === undefined) delete process.env.API_PROXY_TARGET;
      else process.env.API_PROXY_TARGET = saved;
    }
  });

  it('the composed web service sets API_PROXY_TARGET to the in-network api address', () => {
    const compose = read('docker-compose.yml');
    const webBlock = compose.slice(compose.indexOf('\n  web:'), compose.indexOf('\nvolumes:'));
    expect(webBlock).toMatch(/API_PROXY_TARGET:\s*http:\/\/api:3000/);
  });

  it('README "Running it" checks health through the web origin on the host port', () => {
    const readme = read('README.md');
    const start = readme.indexOf('## Running it');
    expect(start).toBeGreaterThanOrEqual(0);
    const next = readme.indexOf('\n## ', start + 1);
    const section = readme.slice(start, next === -1 ? undefined : next);
    expect(section).toMatch(/127\.0\.0\.1:5273\/api\/health/);
  });

  it('architecture.md has one paragraph saying how the browser reaches the api', () => {
    const paragraphs = read('framework/docs/architecture.md').split(/\n\s*\n/);
    const hit = paragraphs.find((p) => /browser/i.test(p) && /same[- ]origin/i.test(p) && /proxy/i.test(p) && /\/api/.test(p));
    expect(hit).toBeDefined();
  });
});

describe('the full gate runs the smoke suite, and the wave gate does not (QA-01)', () => {
  // Source gate.config.sh in a scratch project root so the wave flag is ours alone.
  function gateStepNames(waveInFlight: boolean): string[] {
    const dir = mkdtempSync(join(tmpdir(), 'gate-config-'));
    mkdirSync(join(dir, 'framework', 'scripts'), { recursive: true });
    copyFileSync(resolve(rootDir, 'framework/scripts/gate.config.sh'), join(dir, 'framework/scripts/gate.config.sh'));
    if (waveInFlight) writeFileSync(join(dir, 'framework/scripts/.wave-in-flight'), '');
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.GATE_FULL;
    delete env.GATE_LANE_TEST;
    const out = execFileSync(
      'bash',
      ['-c', 'source framework/scripts/gate.config.sh; printf "%s\\n" "${GATE_STEPS[@]}"'],
      { cwd: dir, env, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' },
    );
    return out.split('\n').filter(Boolean);
  }

  it('full gate has a smoke step that runs the tests/smoke config', () => {
    const smoke = gateStepNames(false).find((s) => s.startsWith('smoke:'));
    expect(smoke).toBeDefined();
    expect(smoke).toMatch(/tests\/smoke\/vitest\.config\.ts/);
  });

  it('wave gate (.wave-in-flight) does not run the smoke step', () => {
    expect(gateStepNames(true).some((s) => s.startsWith('smoke:'))).toBe(false);
  });
});
