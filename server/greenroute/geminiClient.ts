import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { backoffDelay } from '../lib/http.js';
import type { Logger } from '../lib/logger.js';
import { LlmUnavailableError, type LlmClient, type LlmRequest, type ThinkingLevelName } from './llm.js';

const LEVELS: Record<ThinkingLevelName, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export interface GeminiClientOptions {
  apiKey: string;
  timeoutMs: number;
  logger: Logger;
  /** Extra attempts after the first for retryable failures (network, 408, 429, 5xx). */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

function isRetryable(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

/**
 * Server-side Gemini client. The SDK's own retry loop is disabled (it defaults to 5 attempts with
 * up to 60 s waits) in favour of a short, bounded backoff so a request never hangs the UI.
 */
export function createGeminiClient(options: GeminiClientOptions): LlmClient {
  const { apiKey, timeoutMs, logger } = options;
  const retries = options.retries ?? 2;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } } });
  const scrub = (text: string) => text.split(apiKey).join('[redacted]').slice(0, 300);

  return {
    kind: 'gemini',
    async generate(request: LlmRequest) {
      let lastStatus: number | undefined;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) await sleep(backoffDelay(attempt - 1, 600, Math.random));
        try {
          const response = await ai.models.generateContent({
            model: request.model,
            contents: [{ role: 'user', parts: [{ text: request.user }] }],
            config: {
              systemInstruction: request.system,
              maxOutputTokens: request.maxOutputTokens,
              temperature: request.temperature,
              thinkingConfig: { thinkingLevel: LEVELS[request.thinkingLevel] },
              ...(request.responseJsonSchema
                ? { responseMimeType: 'application/json', responseJsonSchema: request.responseJsonSchema }
                : {}),
              abortSignal: AbortSignal.timeout(timeoutMs),
            },
          });
          const usage = response.usageMetadata;
          return {
            text: response.text ?? '',
            inputTokens: usage?.promptTokenCount ?? 0,
            outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
            finishReason: response.candidates?.[0]?.finishReason ?? null,
          };
        } catch (error) {
          lastStatus = error instanceof ApiError ? error.status : undefined;
          const message = error instanceof Error ? scrub(error.message) : 'unknown error';
          logger.warn({ model: request.model, status: lastStatus, attempt, message }, 'gemini call failed');
          if (!isRetryable(lastStatus)) break;
        }
      }
      throw new LlmUnavailableError(`Gemini ${request.model} unavailable (status ${lastStatus ?? 'network'})`, lastStatus);
    },
  };
}
