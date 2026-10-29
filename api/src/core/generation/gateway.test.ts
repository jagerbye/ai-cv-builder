import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAnthropicGateway } from './gateway.js';
import type { LlmConfig } from '../../llm/config.js';
import type { ToolCallRequest } from './types.js';

// T-09 (CVB-9). C-012 / ADR-006 / F-010. The SDK's HTTP transport is faked via
// the SDK's own `fetch` option; the gateway itself is real. No network, no key.
// Error paths are recorded fixtures under tests/fixtures/llm/.

const FIXTURE_DIR = fileURLToPath(new URL('../../../../tests/fixtures/llm/', import.meta.url));

interface Canned { status: number; body: unknown }
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
  tokenBudgetPerCall: 1000,
  timeoutMs: 5000,
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
      headers: { 'content-type': 'application/json' },
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
const sleep = async (ms: number) => { delays.push(ms); };

beforeEach(() => { delays = []; });

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

  it('sends the model from configuration and max_tokens from the token budget', async () => {
    const t = scriptedFetch([fixture('tool-ok.json')]);
    await createAnthropicGateway({ ...CONFIG, model: 'model-gamma-test', tokenBudgetPerCall: 777 }, { fetch: t.fetch, sleep })
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
  it('retries 429 with exponential backoff up to 3 attempts, then fails RATE_LIMITED', async () => {
    const t = scriptedFetch([fixture('error-429.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(t.calls).toHaveLength(3);
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThan(0);
    expect(delays[1]).toBeGreaterThan(delays[0]);
  });

  it('recovers when a 429 is followed by a success', async () => {
    const t = scriptedFetch([fixture('error-429.json'), fixture('tool-ok.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .resolves.toEqual({ items: ['Led a team of 4', 'Python'] });
    expect(t.calls).toHaveLength(2);
    expect(delays).toHaveLength(1);
  });

  it('retries 529 overloaded up to 3 attempts, then fails LLM_UNAVAILABLE', async () => {
    const t = scriptedFetch([fixture('error-529.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(t.calls).toHaveLength(3);
  });

  it('retries a 500 up to 3 attempts, then fails LLM_UNAVAILABLE', async () => {
    const t = scriptedFetch([fixture('error-500.json')]);
    await expect(createAnthropicGateway(CONFIG, { fetch: t.fetch, sleep }).callTool(makeRequest()))
      .rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(t.calls).toHaveLength(3);
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
    expect(t.calls).toHaveLength(3);
    expect(delays).toHaveLength(2);
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

describe('per-call token budget (ADR-006, F-010)', () => {
  it('succeeds when the reported usage is within the budget', async () => {
    const t = scriptedFetch([fixture('tool-ok.json')]);
    await expect(createAnthropicGateway({ ...CONFIG, tokenBudgetPerCall: 1000 }, { fetch: t.fetch, sleep })
      .callTool(makeRequest())).resolves.toEqual({ items: ['Led a team of 4', 'Python'] });
  });

  it('fails rather than returning a result when reported usage exceeds the budget', async () => {
    const t = scriptedFetch([fixture('over-budget.json')]);
    const outcome = await createAnthropicGateway({ ...CONFIG, tokenBudgetPerCall: 1000 }, { fetch: t.fetch, sleep })
      .callTool(makeRequest())
      .then((v) => ({ resolved: v }), (e: { code?: string }) => ({ rejected: e.code }));
    expect(outcome).toEqual({ rejected: 'LLM_INVALID_OUTPUT' });
    expect(t.calls).toHaveLength(1);
  });
});

describe('token budget across the schema retry', () => {
  it('lets the retry spend only what is left, and refuses to send once nothing is left', async () => {
    const t = scriptedFetch([fixture('schema-violation.json'), fixture('tool-ok.json')]);
    await createAnthropicGateway({ ...CONFIG, tokenBudgetPerCall: 1000 }, { fetch: t.fetch, sleep })
      .callTool(makeRequest());
    expect(t.body(0).max_tokens).toBe(1000);
    expect(t.body(1).max_tokens).toBe(850);

    const t2 = scriptedFetch([fixture('schema-violation.json'), fixture('tool-ok.json')]);
    await expect(createAnthropicGateway({ ...CONFIG, tokenBudgetPerCall: 150 }, { fetch: t2.fetch, sleep })
      .callTool(makeRequest())).rejects.toMatchObject({ code: 'LLM_INVALID_OUTPUT' });
    expect(t2.calls).toHaveLength(1);
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
