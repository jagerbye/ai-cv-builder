// T-09 (CVB-9). C-012 / ADR-006 / F-010. The ONLY module that imports the
// Anthropic SDK. Everything else reaches the model through AnthropicGateway.
//
// Per call: tool-use with an explicit input schema, tool_choice forcing that
// tool, the result re-validated in code (never trusted), one retry on a schema
// violation with the validation error appended, Retry-After-aware exponential
// backoff bounded by a waiting budget (ADR-029) for rate limit / 5xx / transport failures, and a per-job token budget (ADR-021) through an
// optional ledger. max_tokens is its own setting and bounds one response only.

import Anthropic, { APIConnectionError, APIError } from '@anthropic-ai/sdk';
import type { LlmConfig } from '../../llm/config.js';
import { safeMessage, type ErrorCode } from '../../http/errors.js';
import type { AnthropicGateway, ToolCallRequest } from './types.js';
import type { TokenLedger } from './ledger.js';

// Every code the gateway throws is a member of the closed C-000 enum (ADR-018). The list is checked
// against ERROR_CODES at compile time: a code added here that the enum lacks is a type error, not a
// silent INTERNAL downstream. Messages are errors.ts's fixed safe ones: no provider text, no prompt,
// no key (F-010). Running out of the job's token budget is its own code, LLM_BUDGET_EXCEEDED (ADR-021).
export const GATEWAY_ERROR_CODES = [
  'RATE_LIMITED',
  'LLM_UNAVAILABLE',
  'LLM_INVALID_OUTPUT',
  'CONFIG_MISSING',
  'LLM_AUTH_FAILED',
  'LLM_INVALID_REQUEST',
  'LLM_BUDGET_EXCEEDED',
] as const satisfies readonly ErrorCode[];

export type GatewayErrorCode = (typeof GATEWAY_ERROR_CODES)[number];

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;

  constructor(code: GatewayErrorCode) {
    super(safeMessage(code));
    this.name = 'GatewayError';
    this.code = code;
  }
}

export interface GatewayLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface GatewayDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  logger?: GatewayLogger;
}

const NOOP = (): void => {};
const NOOP_LOGGER: GatewayLogger = { debug: NOOP, info: NOOP, warn: NOOP, error: NOOP };

// A sanity ceiling only (a Retry-After of 0 is floored at the base, so this is not the only brake); the real bound is the budget.
const MAX_TRANSIENT_ATTEMPTS = 12;
// Jitter spreads each backoff over [1x, 1.5x) so callers that failed together do not retry together.
const JITTER_SPREAD = 0.5;
const MAX_SCHEMA_ATTEMPTS = 2;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface RawBlock {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface SentResponse {
  blocks: RawBlock[];
  tokens: number;
}

interface Failure {
  code: GatewayErrorCode;
  retryable: boolean;
  retryAfterMs?: number;
}

// Retry-After is delta-seconds or an HTTP date (RFC 9110). Anything else, or a date in the past, is no hint.
function parseRetryAfter(value: string | null | undefined, nowMs: number): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^[0-9]+$/.test(v)) return Number(v) * 1000;
  const at = Date.parse(v);
  if (Number.isNaN(at) || !/[a-z]/i.test(v)) return undefined;
  return at > nowMs ? at - nowMs : undefined;
}

function headerOf(err: APIError): string | null | undefined {
  const h = err.headers as unknown;
  if (h && typeof (h as Headers).get === 'function') return (h as Headers).get('retry-after');
  if (h && typeof h === 'object') return (h as Record<string, string | undefined>)['retry-after'];
  return undefined;
}

// Maps an SDK or transport error to a closed code and whether to retry it.
function classify(err: unknown, nowMs: number): Failure {
  if (err instanceof APIConnectionError) return { code: 'LLM_UNAVAILABLE', retryable: true };
  if (err instanceof APIError) {
    const status = err.status;
    const retryAfterMs = parseRetryAfter(headerOf(err), nowMs);
    if (status === 429) return { code: 'RATE_LIMITED', retryable: true, retryAfterMs };
    if (status === undefined || status >= 500) return { code: 'LLM_UNAVAILABLE', retryable: true, retryAfterMs };
    if (status === 401 || status === 403) return { code: 'LLM_AUTH_FAILED', retryable: false };
    return { code: 'LLM_INVALID_REQUEST', retryable: false };
  }
  return { code: 'LLM_UNAVAILABLE', retryable: true };
}

function normalize(message: unknown): SentResponse {
  const m = (message ?? {}) as { content?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } };
  const blocks = Array.isArray(m.content) ? (m.content as RawBlock[]) : [];
  const input = Number(m.usage?.input_tokens ?? 0);
  const output = Number(m.usage?.output_tokens ?? 0);
  return { blocks, tokens: input + output };
}

export function createAnthropicGateway(config: LlmConfig, deps: GatewayDeps = {}): AnthropicGateway {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  const logger = deps.logger ?? NOOP_LOGGER;
  let client: Anthropic | undefined;

  // One provider request, retried on rate limit / 5xx / transport errors.
  // The SDK's own retries are off (maxRetries: 0): the policy lives here.
  async function send(req: ToolCallRequest<unknown>, messages: unknown[], maxTokens: number): Promise<SentResponse> {
    if (!client) {
      client = new Anthropic({
        apiKey: config.apiKey,
        // Only when set: an unset variable must leave the SDK's default endpoint untouched.
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        fetch: deps.fetch,
        maxRetries: 0,
        timeout: config.timeoutMs,
      });
    }
    const params = {
      model: config.model,
      max_tokens: maxTokens,
      messages,
      tools: [{ name: req.name, description: req.description, input_schema: req.inputSchema }],
      tool_choice: { type: 'tool' as const, name: req.name },
    };
    const startedAt = now();
    for (let attempt = 1; ; attempt++) {
      try {
        const message = await client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
        logger.debug({ tool: req.name, attempt, outcome: 'ok' });
        return normalize(message);
      } catch (err) {
        const failure = classify(err, now());
        logger.debug({ tool: req.name, attempt, code: failure.code });
        // ADR-029: the wait is the provider's Retry-After when it sent one (floored at the base, capped at what is left of the
        // budget), otherwise base * 2^(n-1) with jitter, which must fit in what is left or the call fails now.
        const left = config.retryBudgetMs - (now() - startedAt);
        let wait: number | undefined;
        if (failure.retryable && attempt < MAX_TRANSIENT_ATTEMPTS && left > 0) {
          if (failure.retryAfterMs !== undefined) wait = Math.min(Math.max(failure.retryAfterMs, config.retryBaseMs), left);
          else {
            const backoff = config.retryBaseMs * 2 ** (attempt - 1) * (1 + JITTER_SPREAD * random());
            if (backoff <= left) wait = backoff;
          }
        }
        if (wait === undefined) {
          logger.warn({ tool: req.name, code: failure.code });
          throw new GatewayError(failure.code);
        }
        await sleep(wait);
      }
    }
  }

  return {
    async callTool<T>(req: ToolCallRequest<T>, ledger?: TokenLedger): Promise<T> {
      if (!config.apiKey) {
        logger.warn({ tool: req.name, code: 'CONFIG_MISSING' });
        throw new GatewayError('CONFIG_MISSING');
      }

      // The tool description goes in the tools array; the prompt goes here, and only here. Sending one
      // string as both doubles the input tokens of every call and every schema retry (extract carries
      // up to 50,000 characters of source text).
      const messages: unknown[] = [{ role: 'user', content: req.prompt }];

      for (let attempt = 1; attempt <= MAX_SCHEMA_ATTEMPTS; attempt++) {
        // The budget is the job's (ADR-021): nothing is sent once the ledger is empty, and a response
        // that overdraws it is discarded unexamined. Without a ledger nothing bounds the spend: tests only, a guard keeps production calls honest.
        if (ledger && ledger.remaining() <= 0) {
          logger.warn({ tool: req.name, code: 'LLM_BUDGET_EXCEEDED' });
          throw new GatewayError('LLM_BUDGET_EXCEEDED');
        }
        const response = await send(req as ToolCallRequest<unknown>, messages, config.maxOutputTokens);
        if (ledger) {
          ledger.spend(response.tokens);
          if (ledger.remaining() < 0) {
            logger.warn({ tool: req.name, code: 'LLM_BUDGET_EXCEEDED' });
            throw new GatewayError('LLM_BUDGET_EXCEEDED');
          }
        }

        // Re-validate the provider result against the same schema (ADR-006).
        const toolUse = response.blocks.find((b) => b.type === 'tool_use' && b.name === req.name);
        let problem: string;
        if (!toolUse) {
          problem = `The response did not call the tool ${req.name}. Call it with input matching its schema.`;
        } else {
          try {
            return req.parse(toolUse.input);
          } catch (err) {
            problem = err instanceof Error ? err.message : 'The tool input failed validation.';
          }
        }

        // Our own validation text, never the provider's or the prompt's: what was invalid, for the server log.
        logger.warn({ tool: req.name, code: 'LLM_INVALID_OUTPUT', attempt, problem });
        if (attempt === MAX_SCHEMA_ATTEMPTS) break;

        // Retry once with the validation error appended (F-010).
        const anyToolUse = response.blocks.find((b) => b.type === 'tool_use');
        messages.push({ role: 'assistant', content: response.blocks });
        messages.push({
          role: 'user',
          content: anyToolUse?.id
            ? [{ type: 'tool_result', tool_use_id: anyToolUse.id, is_error: true, content: problem }]
            : problem,
        });
      }

      logger.warn({ tool: req.name, code: 'LLM_INVALID_OUTPUT' });
      throw new GatewayError('LLM_INVALID_OUTPUT');
    },
  };
}
