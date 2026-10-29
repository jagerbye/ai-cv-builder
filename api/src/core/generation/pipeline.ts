import { readLlmConfig, type LlmEnv } from '../../llm/config.js';
import { createAnthropicGateway } from './gateway.js';
import { createExtractStage } from './extract.js';
import { createComposeStage } from './compose.js';
import { verify } from './verify.js';
import type { GenerationPipeline } from './types.js';

// T-28 (CVB-31). The one real pipeline factory: server.ts (HTTP answer and regenerate paths) and main.ts
// (the job worker) both build it here, so the two paths cannot run different pipelines.
// One gateway, shared by the extract and compose stages. No key is needed to build it: a missing key
// surfaces as CONFIG_MISSING when a call is made (F-010).
export function createGenerationPipeline(env: LlmEnv): GenerationPipeline {
  const gateway = createAnthropicGateway(readLlmConfig(env));
  const extract = createExtractStage(gateway);
  const compose = createComposeStage(gateway);
  return {
    extract: (sourceText, ledger) => extract.extract(sourceText, ledger),
    compose: (facts, targetRole, ledger) => compose.compose(facts, targetRole, ledger),
    verify,
  };
}
