import { LlmUnavailableError, type LlmClient, type LlmRequest } from './llm.js';
import { commentDraftTask, permitQaTask, permitSummaryTask, type TaskDefinition } from './tasks.js';
import { estimateTokens } from './util.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TASKS: Record<string, TaskDefinition<any, unknown>> = {
  [permitSummaryTask.name]: permitSummaryTask,
  [commentDraftTask.name]: commentDraftTask,
  [permitQaTask.name]: permitQaTask,
};

/**
 * Offline stand-in for Gemini (GEMINI_MOCK=ok|down). Deterministic, never calls the network,
 * and its output is built from the same data-only templates as the no-AI fallback.
 * The UI labels anything it produces as demo/mock output. Never allowed in production.
 */
export function createMockClient(mode: 'ok' | 'down'): LlmClient {
  return {
    kind: 'mock',
    async generate(request: LlmRequest) {
      if (mode === 'down') throw new LlmUnavailableError('mock Gemini is configured as unavailable', 503);
      const task = request.metadata?.task;
      let text: string;
      if (task === 'router') {
        text = /Missing fields: none\./.test(request.user) ? 'simple' : 'complex';
      } else if (task && TASKS[task]) {
        text = JSON.stringify(TASKS[task].mockOutput(request.metadata?.input));
      } else {
        throw new LlmUnavailableError(`mock has no handler for task "${task ?? 'none'}"`, 400);
      }
      return {
        text,
        inputTokens: estimateTokens(request.system) + estimateTokens(request.user),
        outputTokens: estimateTokens(text),
        finishReason: 'STOP',
      };
    },
  };
}
