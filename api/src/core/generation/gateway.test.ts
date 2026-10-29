import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAnthropicGateway } from './gateway.js';
import type { LlmConfig } from '../../llm/config.js';
import type { ToolCallRequest } from './types.js';
import { createTokenLedger } from './ledger.js';

// T-09 (CVB-9). C-012 / ADR-006 / F-010. The SDK's HTTP transport is faked via
// the SDK's own `fetch` option; the gateway itself is real. No network, no key.
// Error paths are recorded fixtures under tests/fixtures/llm/.

const FIXTURE_DIR = fileURLToPath(new URL('../../../../tests/fixtures/llm/', import.meta.url));

interface Canned { status: number; body: unknown; headers?: Record<string, string> }
const fixture = (name: string): Canned => JSON.parse(readFileSync(FIXTURE_DIR + name, 'utf8'));

const PROMPT_SENTINEL = 'PROMPT-SENTINEL-DESCRIPTION-7731';
const KEY = 'sk-ant-api03-KEY-SENTINEL-4420';
const SCHEMA_ERROR = 'items: expected array of strings';

interface Facts { items: string[] }

// A tiny tool whose parser is the re-validation step (ADR-006): the gateway must
// run it on every provider response and never return what it rejects.
function makeRequest(): ToolCallRequest<Facts> {
  return {
    name: 'record_facts',
    description: PROMPT_SENTINEL,
    inputSchema: {
      type: 'object',
      properties: { items: { type: 'array', items: { type: 'string' } } },
      required: ['items'],
      additionalProperties: false,
    },
    parse: (raw: unknown): Facts => {
      const obj = raw as { items?: unknown } | null;
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.items)) throw new Error(SCHEMA_ERROR);
      if (!obj.items.every((s) => typeof s === 'string')) throw new Error(SCHEMA_ERROR);
      return { items: obj.items as string[] };
    },
  };
}

const CONFIG: LlmConfig = {
  apiKey: KEY,
  model: 'model-from-config-test',
  maxOutputTokens: 32000,
  tokenBudgetPerJob: 1_000_000,
  timeoutMs: 5000,
  retryBaseMs: 2000,
  retryBudgetMs: 20_000,
};

// Scripted transport: step i answers call i; the last step repeats.
type Step = Canned | 'timeout';
function scriptedFetch(steps: Step[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === 'timeout') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted by timeout')));
      });
    }
    return new Response(JSON.stringify(step.body), {
      status: step.status,
      headers: { 'content-type': 'application/json', ...(step.headers ?? {}) },
    });
  };
  return {
    fetch: fetchFn as unknown as typeof fetch,
    calls,
    body: (i: number) => JSON.parse(String(calls[i].init.body)) as Record<string, unknown>,
  };
}

function toolUse(input: unknown, usage = { input_tokens: 120, output_tokens: 40 }): Canned {
  return {
    status: 200,
    body: {
      id: 'msg_inline',
      type: 'message',
      role: 'assistant',
      model: 'inline',
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'toolu_inline', name: 'record_facts', input }],
      usage,
    },
  };
}

let delays: number[];
// Date is faked, timers are not: a gateway sleeping through this helper advances the clock the gateway reads
// (ADR-029), so the retry budget is spent the way it would be in life, without any real waiting.
const sleep = async (ms: number) => { delays.push(ms); vi.setSystemTime(Date.now() + ms); };

beforeEach(() => {
  delays = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-10-29T12:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); });

describe('AnthropicGateway request shape (C-012, ADR-006)', () => {
  it('forces the named tool with its explicit input schema', async () => {
    const t = scriptedFetch([fixture('tool-ok.json')]);
    await createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest());
    const body = t.body(0);
    expect(body.tools).toEqual([
      {
        name: 'record_facts',
        description: PROMPT_SENTINEL,
        input_schema: makeRequest().inputSchema,
      },
    ]);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_facts' });
  });

  it('sends the model from configuration and max_tokens from the output cap', async () => {
    const t = scriptedFetch([fixture('tool-ok.json')]);
    await createAnthropicGateway({ ...CONFIG, model: 'model-gamma-test', maxOutputTokens: 777 }, { fetch: t.fetch, sleep })
      .callTool(makeRequest());
    expect(t.body(0).model).toBe('model-gamma-test');
    expect(t.body(0).max_tokens).toBe(777);
  });

  it('sends the configured API key in the x-api-key header', async () => {
    const t = scriptedFetch([fixture('tool-ok.json')]);
    await createAnthropicGateway({ ...CONFIG, apiKey: 'sk-ant-header-KEY-9' }, { fetch: t.fetch, sleep })
      .callTool(makeRequest());
    expect(new Headers(t.calls[0].init.headers).get('x-api-key')).toBe('sk-ant-header-KEY-9');
  });

  it('sends the request to the configured base URL when one is set', async () => {
    const t = scriptedFetch([fixture('tool-ok.json')]);
    await createAnthropicGateway({ ...CONFIG, baseUrl: 'https://proxy.example.test/api' }, { fetch: t.fetch, sleep })
      .callTool(makeRequest());
    expect(t.calls[0].url).toBe('https://proxy.example.test/api/v1/messages');
  });

  it('leaves the SDK default endpoint untouched when no base URL is set', async () => {
    // The premise is "unset", so unset it: the SDK reads ANTHROPIC_BASE_URL itself, and a developer's .env sets it.
    vi.stubEnv('ANTHROPIC_BASE_URL', undefined);
    try {
      const t = scriptedFetch([fixture('tool-ok.json')]);
      await createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest());
      expect(t.calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('returns the parsed tool input on a valid result', async () => {
    const t = scriptedFetch([fixture('tool-ok.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .resolves.toEqual({ items: ['Led a team of 4', 'Python'] });
  });

  it('returns whatever a different valid tool input contains, not a fixed value', async () => {
    const t = scriptedFetch([toolUse({ items: ['Rust', 'Kafka', 'Mentored juniors'] })]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .resolves.toEqual({ items: ['Rust', 'Kafka', 'Mentored juniors'] });
  });
});

describe('re-validation and one retry on schema violation (ADR-006, F-010)', () => {
  it('retries once with the validation error appended, then returns the valid retry', async () => {
    const t = scriptedFetch([fixture('schema-violation.json'), fixture('tool-ok.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .resolves.toEqual({ items: ['Led a team of 4', 'Python'] });
    expect(t.calls).toHaveLength(2);
    expect(JSON.stringify(t.body(0))).not.toContain(SCHEMA_ERROR);
    expect(JSON.stringify(t.body(1))).toContain(SCHEMA_ERROR);
  });

  it('fails with LLM_INVALID_OUTPUT after exactly one retry when the schema is violated twice', async () => {
    const t = scriptedFetch([fixture('schema-violation.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .rejects.toMatchObject({ code: 'LLM_INVALID_OUTPUT' });
    expect(t.calls).toHaveLength(2);
  });

  it('treats a text-only response with no tool_use block as malformed: LLM_INVALID_OUTPUT after two calls', async () => {
    const t = scriptedFetch([fixture('malformed-no-tool-use.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .rejects.toMatchObject({ code: 'LLM_INVALID_OUTPUT' });
    expect(t.calls).toHaveLength(2);
  });

  it('treats a tool_use block for a different tool name as malformed: LLM_INVALID_OUTPUT after two calls', async () => {
    const t = scriptedFetch([fixture('malformed-wrong-tool-name.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .rejects.toMatchObject({ code: 'LLM_INVALID_OUTPUT' });
    expect(t.calls).toHaveLength(2);
  });

  it('never returns a value the parser rejects, even when it is the only response', async () => {
    const t = scriptedFetch([toolUse({ items: 42 })]);
    const outcome = await createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep })
      .callTool(makeRequest())
      .then((v) => ({ resolved: v }), (e: { code?: string }) => ({ rejected: e.code }));
    expect(outcome).toEqual({ rejected: 'LLM_INVALID_OUTPUT' });
  });
});

describe('provider error classification and backoff (F-010)', () => {
  it('retries 429 with exponential backoff while the budget lasts, then fails RATE_LIMITED', async () => {
    const t = scriptedFetch([fixture('error-429.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(t.calls.length).toBeGreaterThanOrEqual(3);
    expect(delays.length).toBe(t.calls.length - 1);
    expect(delays[0]).toBeGreaterThan(0);
    expect(delays[1]).toBeGreaterThan(delays[0]);
  });

  // ADR-029: the timing is the contract. A controlled clock: sleep advances it, nothing waits for real.
  function clock(start = Date.parse('2026-10-29T12:00:00Z')) {
    const c = { t: start, delays: [] as number[] };
    return {
      c,
      now: () => c.t,
      sleep: async (ms: number) => { c.delays.push(ms); c.t += ms; },
    };
  }
  const retryAfter = (value: string): Canned => ({ ...fixture('error-429.json'), headers: { 'retry-after': value } });
  const gw = (t: ReturnType<typeof scriptedFetch>, k: ReturnType<typeof clock>, random = () => 0.5, cfg: Partial<LlmConfig> = {}) =>
    createAnthropicGateway({ ...CONFIG, ...cfg }, { fetch: t.fetch, sleep: k.sleep, now: k.now, random });

  it('waits what Retry-After says (seconds), not the backoff', async () => {
    const k = clock();
    const t = scriptedFetch([retryAfter('2'), fixture('tool-ok.json')]);
    await gw(t, k).callTool(makeRequest());
    expect(k.c.delays).toEqual([2000]);
  });

  it('understands the HTTP-date form of Retry-After', async () => {
    const k = clock();
    const t = scriptedFetch([retryAfter(new Date(k.c.t + 4000).toUTCString()), fixture('tool-ok.json')]);
    await gw(t, k).callTool(makeRequest());
    expect(k.c.delays).toEqual([4000]);
  });

  it('caps Retry-After at what is left of the budget instead of sleeping on the header', async () => {
    const k = clock();
    const t = scriptedFetch([retryAfter('3600'), fixture('tool-ok.json')]);
    await gw(t, k).callTool(makeRequest());
    expect(k.c.delays).toEqual([20_000]);
  });

  it('ignores a garbage or past Retry-After and backs off instead', async () => {
    for (const v of ['soon', '-5', new Date(Date.parse('2026-10-29T11:00:00Z')).toUTCString()]) {
      const k = clock();
      const t = scriptedFetch([retryAfter(v), fixture('tool-ok.json')]);
      await gw(t, k, () => 0).callTool(makeRequest());
      expect(k.c.delays).toEqual([2000]);
    }
  });

  it('never waits less than the configured base, whatever Retry-After says (0 or negative)', async () => {
    for (const v of ['0', '-3']) {
      const k = clock();
      const t = scriptedFetch([retryAfter(v), fixture('tool-ok.json')]);
      await gw(t, k, () => 0).callTool(makeRequest());
      expect(k.c.delays).toHaveLength(1);
      expect(k.c.delays[0]).toBeGreaterThanOrEqual(CONFIG.retryBaseMs);
    }
  });

  it('a 429 without the header backs off from a base in seconds, doubling, with jitter inside the band', async () => {
    for (const [r, first, second] of [[0, 2000, 4000], [0.999, 2998, 5996]] as const) {
      const k = clock();
      const t = scriptedFetch([fixture('error-429.json'), fixture('error-429.json'), fixture('tool-ok.json')]);
      await gw(t, k, () => r).callTool(makeRequest());
      expect(k.c.delays[0]).toBeCloseTo(first, -1);
      expect(k.c.delays[1]).toBeCloseTo(second, -1);
    }
  });

  it('jitter differs between callers: two different random draws give two different delays', async () => {
    const a = clock(); const b = clock();
    await gw(scriptedFetch([fixture('error-429.json'), fixture('tool-ok.json')]), a, () => 0.1).callTool(makeRequest());
    await gw(scriptedFetch([fixture('error-429.json'), fixture('tool-ok.json')]), b, () => 0.9).callTool(makeRequest());
    expect(a.c.delays[0]).not.toBe(b.c.delays[0]);
  });

  it('stops when the next wait would exceed the budget, with the right code, and the total wait stays inside it', async () => {
    const k = clock();
    const t = scriptedFetch([fixture('error-429.json')]);
    await expect(gw(t, k, () => 0).callTool(makeRequest())).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    // 2 + 4 + 8 = 14 s waited; the next wait (16 s) would pass the 20 s budget.
    expect(k.c.delays).toEqual([2000, 4000, 8000]);
    expect(t.calls).toHaveLength(4);
    expect(k.c.delays.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(20_000);
  });

  it('a provider that is down fails with LLM_UNAVAILABLE inside the budget, not after three minutes', async () => {
    const k = clock();
    const t = scriptedFetch([fixture('error-500.json')]);
    await expect(gw(t, k, () => 0.5).callTool(makeRequest())).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(k.c.t - Date.parse('2026-10-29T12:00:00Z')).toBeLessThanOrEqual(20_000);
  });

  it('honours the configured base and budget', async () => {
    const k = clock();
    const t = scriptedFetch([fixture('error-429.json')]);
    await expect(gw(t, k, () => 0, { retryBaseMs: 1000, retryBudgetMs: 5000 }).callTool(makeRequest())).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(k.c.delays).toEqual([1000, 2000]);
  });

  it('does not retry a non-retryable failure even when it carries Retry-After', async () => {
    const k = clock();
    const t = scriptedFetch([{ ...fixture('error-400.json'), headers: { 'retry-after': '1' } }]);
    await expect(gw(t, k).callTool(makeRequest())).rejects.toMatchObject({ code: 'LLM_INVALID_REQUEST' });
    expect(t.calls).toHaveLength(1);
    expect(k.c.delays).toEqual([]);
  });

  it('recovers when a 429 is followed by a success', async () => {
    const t = scriptedFetch([fixture('error-429.json'), fixture('tool-ok.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .resolves.toEqual({ items: ['Led a team of 4', 'Python'] });
    expect(t.calls).toHaveLength(2);
    expect(delays).toHaveLength(1);
  });

  it('retries 529 overloaded while the budget lasts, then fails LLM_UNAVAILABLE', async () => {
    const t = scriptedFetch([fixture('error-529.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(t.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('retries a 500 while the budget lasts, then fails LLM_UNAVAILABLE', async () => {
    const t = scriptedFetch([fixture('error-500.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(t.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('fails a 400 invalid request immediately with a code distinct from the retryable ones', async () => {
    const t = scriptedFetch([fixture('error-400.json')]);
    const err = await createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep })
      .callTool(makeRequest())
      .then(() => null, (e: { code?: string }) => e);
    expect(err).not.toBeNull();
    expect(t.calls).toHaveLength(1);
    expect(delays).toHaveLength(0);
    expect(err?.code).toBe('LLM_INVALID_REQUEST');
  });

  it('fails a 401 auth error immediately with LLM_AUTH_FAILED', async () => {
    const t = scriptedFetch([fixture('error-401.json')]);
    const auth = await createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep })
      .callTool(makeRequest()).then(() => null, (e: { code?: string }) => e);
    expect(auth).not.toBeNull();
    expect(t.calls).toHaveLength(1);
    expect(delays).toHaveLength(0);
    expect(auth?.code).toBe('LLM_AUTH_FAILED');
  });

  it('a request that exceeds the timeout fails with a rejection and is not silently successful', async () => {
    const t = scriptedFetch(['timeout']);
    const err = await createAnthropicGateway({ ...CONFIG, timeoutMs: 20 }, { fetch: t.fetch, sleep })
      .callTool(makeRequest()).then(() => null, (e: { code?: string }) => e);
    expect(err).not.toBeNull();
    expect(err?.code).toBe('LLM_UNAVAILABLE');
    expect(t.calls.length).toBeGreaterThanOrEqual(3);
    expect(delays).toHaveLength(t.calls.length - 1);
  });

  it('never exposes the provider error message to the caller', async () => {
    const t = scriptedFetch([fixture('error-429.json')]);
    const err = await createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep })
      .callTool(makeRequest()).then(() => null, (e: unknown) => e as Error);
    expect(err).not.toBeNull();
    expect(err?.message).not.toContain('PROVIDER-SECRET-MSG');
    expect(JSON.stringify(err)).not.toContain('PROVIDER-SECRET-MSG');
  });
});

describe('output cap is separate from the spend budget (ADR-021)', () => {
  it('accepts a compose-sized exchange whose input plus output exceeds the old 4096', async () => {
    const t = scriptedFetch([toolUse({ items: ['Led a team of 4', 'Python'] }, { input_tokens: 3000, output_tokens: 2500 })]);
    await expect(createAnthropicGateway({ ...CONFIG, maxOutputTokens: 32000 }, { fetch: t.fetch, sleep })
      .callTool(makeRequest())).resolves.toEqual({ items: ['Led a team of 4', 'Python'] });
  });

  it('sends the same max_tokens on the schema retry, never a shrinking one', async () => {
    const t = scriptedFetch([fixture('schema-violation.json'), fixture('tool-ok.json')]);
    await createAnthropicGateway({ ...CONFIG, maxOutputTokens: 32000 }, { fetch: t.fetch, sleep }).callTool(makeRequest());
    expect(t.body(0).max_tokens).toBe(32000);
    expect(t.body(1).max_tokens).toBe(32000);
  });
});

describe('the spend budget is per job, through an optional ledger (ADR-021, C-012, F-010)', () => {
  // The optional shape exists for TESTS. A call without a ledger is unbounded by construction, which is why
  // tests/guard/ledger-passed.guard.test.ts fails any production call that omits it (ADR-021 Amendment A).
  it('a call without a ledger is unbounded by construction: the shape for tests, never for production', async () => {
    const t = scriptedFetch([toolUse({ items: ['Python'] }, { input_tokens: 5000, output_tokens: 5000 })]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .resolves.toEqual({ items: ['Python'] });
  });

  it('a ledger with a small balance bounds the job: the second call fails with LLM_BUDGET_EXCEEDED', async () => {
    const ledger = createTokenLedger(200);
    const t = scriptedFetch([fixture('tool-ok.json')]);
    const gateway = createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep });
    await expect(gateway.callTool(makeRequest(), ledger)).resolves.toEqual({ items: ['Led a team of 4', 'Python'] });
    const err = await gateway.callTool(makeRequest(), ledger).then(() => null, (e: { code?: string }) => e);
    expect(err).not.toBeNull();
    expect(err?.code).toBe('LLM_BUDGET_EXCEEDED');
  });

  it('refuses to send once the job balance is gone', async () => {
    const ledger = createTokenLedger(200);
    const t = scriptedFetch([fixture('tool-ok.json')]);
    const gateway = createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep });
    await gateway.callTool(makeRequest(), ledger);
    await gateway.callTool(makeRequest(), ledger).catch(() => undefined);
    const err = await gateway.callTool(makeRequest(), ledger).then(() => null, (e: { code?: string }) => e);
    expect(err?.code).toBe('LLM_BUDGET_EXCEEDED');
    expect(t.calls).toHaveLength(2);
  });

  it('fails with LLM_BUDGET_EXCEEDED, and returns nothing, when one response overdraws the balance', async () => {
    const ledger = createTokenLedger(1000);
    const t = scriptedFetch([fixture('over-budget.json')]);
    const outcome = await createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep })
      .callTool(makeRequest(), ledger)
      .then((v) => ({ resolved: v }), (e: { code?: string }) => ({ rejected: e.code }));
    expect(outcome).toEqual({ rejected: 'LLM_BUDGET_EXCEEDED' });
    expect(t.calls).toHaveLength(1);
  });

  it('the schema retry spends from the same ledger, so the retry can overdraw the job', async () => {
    const ledger = createTokenLedger(200);
    const t = scriptedFetch([fixture('schema-violation.json'), fixture('tool-ok.json')]);
    const err = await createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep })
      .callTool(makeRequest(), ledger).then(() => null, (e: { code?: string }) => e);
    expect(err?.code).toBe('LLM_BUDGET_EXCEEDED');
    expect(t.calls).toHaveLength(2);
  });
});

describe('the validation problem is logged, never the model text (ADR-021)', () => {
  function recordingLogger() {
    const logged: { level: string; args: unknown[] }[] = [];
    const rec = (level: string) => (...args: unknown[]) => { logged.push({ level, args }); };
    return { logged, logger: { debug: rec('debug'), info: rec('info'), warn: rec('warn'), error: rec('error') } };
  }

  it('logs our validation message on the retry and on the final failure', async () => {
    const { logged, logger } = recordingLogger();
    const t = scriptedFetch([fixture('schema-violation.json')]);
    await createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep, logger }).callTool(makeRequest()).catch(() => undefined);
    const problems = logged
      .flatMap((l) => l.args)
      .filter((a): a is { problem: unknown } => typeof a === 'object' && a !== null && 'problem' in a)
      .map((a) => a.problem);
    expect(problems).toEqual([SCHEMA_ERROR, SCHEMA_ERROR]);
  });

  it('logs no prompt, no provider output and no key', async () => {
    const { logged, logger } = recordingLogger();
    const t = scriptedFetch([fixture('schema-violation.json')]);
    await createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep, logger }).callTool(makeRequest()).catch(() => undefined);
    const text = JSON.stringify(logged);
    expect(text).not.toContain(PROMPT_SENTINEL);
    expect(text).not.toContain('Led a team of 4');
    expect(text).not.toContain(KEY);
  });
});

describe('missing key and secret hygiene (F-010, NFR secrets)', () => {
  it('constructs without a key and fails generation with CONFIG_MISSING without any network call', async () => {
    const t = scriptedFetch([fixture('tool-ok.json')]);
    const gateway = createAnthropicGateway({ ...CONFIG, apiKey: undefined }, { fetch: t.fetch, sleep });
    await expect(gateway.callTool(makeRequest())).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
    expect(t.calls).toHaveLength(0);
  });

  it('never logs the API key or the prompt body at info, warn or error, and logs nothing at all with the key on the failure path', async () => {
    const levels = { debug: [] as unknown[][], info: [] as unknown[][], warn: [] as unknown[][], error: [] as unknown[][] };
    const logger = {
      debug: (...a: unknown[]) => levels.debug.push(a),
      info: (...a: unknown[]) => levels.info.push(a),
      warn: (...a: unknown[]) => levels.warn.push(a),
      error: (...a: unknown[]) => levels.error.push(a),
    };
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      const ok = scriptedFetch([fixture('tool-ok.json')]);
      await createAnthropicGateway(CONFIG, { fetch: ok.fetch, sleep, logger }).callTool(makeRequest());
      const failing = scriptedFetch([fixture('error-401.json')]);
      await createAnthropicGateway(CONFIG, { fetch: failing.fetch, sleep, logger })
        .callTool(makeRequest()).catch(() => undefined);

      const above = [...levels.info, ...levels.warn, ...levels.error].map((a) => JSON.stringify(a));
      expect(above.some((s) => s.includes(PROMPT_SENTINEL))).toBe(false);
      const everything = [...Object.values(levels).flat(), ...consoleSpies.flatMap((s) => s.mock.calls)].map((a) => JSON.stringify(a));
      expect(everything.some((s) => s.includes(KEY))).toBe(false);
    } finally {
      consoleSpies.forEach((s) => s.mockRestore());
    }
  });
});

describe('gateway test hygiene', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => vi.restoreAllMocks());
  it('is a pure fake-transport suite: the default global fetch is never used', async () => {
    const real = globalThis.fetch;
    const spy = vi.fn(real);
    globalThis.fetch = spy as unknown as typeof fetch;
    try {
      const t = scriptedFetch([fixture('tool-ok.json')]);
      await createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest());
      expect(spy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = real;
    }
  });
});
