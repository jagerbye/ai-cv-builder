// T-09 (CVB-9). C-012 / ADR-006 / F-010. The ONLY module that imports the
// Anthropic SDK. Everything else reaches the model through AnthropicGateway.
//
// Per call: tool-use with an explicit input schema, tool_choice forcing that
// tool, the result re-validated in code (never trusted), one retry on a schema
// violation with the validation error appended, 3-attempt exponential backoff
// for rate limit / 5xx / transport failures, and a per-call token budget.

import Anthropic, { APIConnectionError, APIError } from '@anthropic-ai/sdk';
import type { LlmConfig } from '../../llm/config.js';
import type { AnthropicGateway, ToolCallRequest } from './types.js';

// Closed C-000 codes plus the gateway-level codes the lane flagged for the
// Teamlead (auth, invalid request, budget). Messages are fixed and safe: no
// provider text, no prompt, no key (F-010).
export type GatewayErrorCode =
  | 'RATE_LIMITED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_INVALID_OUTPUT'
  | 'CONFIG_MISSING'
  | 'LLM_AUTH_FAILED'
  | 'LLM_INVALID_REQUEST'
  | 'LLM_BUDGET_EXCEEDED';

const MESSAGES: Record<GatewayErrorCode, string> = {
  RATE_LIMITED: 'The language model is rate limited; try again later.',
  LLM_UNAVAILABLE: 'The language model is unavailable or timed out.',
  LLM_INVALID_OUTPUT: 'The language model returned output that failed validation.',
  CONFIG_MISSING: 'ANTHROPIC_API_KEY is not configured; generation is unavailable.',
  LLM_AUTH_FAILED: 'The language model rejected the configured credentials.',
  LLM_INVALID_REQUEST: 'The language model rejected the request.',
  LLM_BUDGET_EXCEEDED: 'The generation exceeded its token budget.',
};

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;

  constructor(code: GatewayErrorCode) {
    super(MESSAGES[code]);
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
  logger?: GatewayLogger;
}

const NOOP = (): void => {};
const NOOP_LOGGER: GatewayLogger = { debug: NOOP, info: NOOP, warn: NOOP, error: NOOP };

const MAX_TRANSIENT_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;
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
}

// Maps an SDK or transport error to a closed code and whether to retry it.
function classify(err: unknown): Failure {
  if (err instanceof APIConnectionError) return { code: 'LLM_UNAVAILABLE', retryable: true };
  if (err instanceof APIError) {
    const status = err.status;
    if (status === 429) return { code: 'RATE_LIMITED', retryable: true };
    if (status === undefined || status >= 500) return { code: 'LLM_UNAVAILABLE', retryable: true };
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
  const logger = deps.logger ?? NOOP_LOGGER;
  let client: Anthropic | undefined;

  // One provider request, retried on rate limit / 5xx / transport errors.
  // The SDK's own retries are off (maxRetries: 0): the policy lives here.
  async function send(req: ToolCallRequest<unknown>, messages: unknown[]): Promise<SentResponse> {
    if (!client) {
      client = new Anthropic({
        apiKey: config.apiKey,
        fetch: deps.fetch,
        maxRetries: 0,
        timeout: config.timeoutMs,
      });
    }
    const params = {
      model: config.model,
      max_tokens: config.tokenBudgetPerCall,
      messages,
      tools: [{ name: req.name, description: req.description, input_schema: req.inputSchema }],
      tool_choice: { type: 'tool' as const, name: req.name },
    };
    for (let attempt = 1; ; attempt++) {
      try {
        const message = await client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
        logger.debug({ tool: req.name, attempt, outcome: 'ok' });
        return normalize(message);
      } catch (err) {
        const failure = classify(err);
        logger.debug({ tool: req.name, attempt, code: failure.code });
        if (!failure.retryable || attempt >= MAX_TRANSIENT_ATTEMPTS) {
          logger.warn({ tool: req.name, code: failure.code });
          throw new GatewayError(failure.code);
        }
        await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
      }
    }
  }

  return {
    async callTool<T>(req: ToolCallRequest<T>): Promise<T> {
      if (!config.apiKey) {
        logger.warn({ tool: req.name, code: 'CONFIG_MISSING' });
        throw new GatewayError('CONFIG_MISSING');
      }

      const messages: unknown[] = [{ role: 'user', content: req.description }];
      let usedTokens = 0;

      for (let attempt = 1; attempt <= MAX_SCHEMA_ATTEMPTS; attempt++) {
        const response = await send(req as ToolCallRequest<unknown>, messages);
        usedTokens += response.tokens;
        if (usedTokens > config.tokenBudgetPerCall) {
          logger.warn({ tool: req.name, code: 'LLM_BUDGET_EXCEEDED' });
          throw new GatewayError('LLM_BUDGET_EXCEEDED');
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
