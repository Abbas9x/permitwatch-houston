export type ThinkingLevelName = 'minimal' | 'low' | 'medium' | 'high';

export interface LlmRequest {
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature: number;
  thinkingLevel: ThinkingLevelName;
  /** JSON Schema for structured output; omit for plain text (router). */
  responseJsonSchema?: Record<string, unknown>;
  /** Not sent to the model. Used for logging and by the offline mock to build deterministic output. */
  metadata?: { task: string; input?: unknown };
}

export interface LlmResponse {
  text: string;
  inputTokens: number;
  /** Visible output tokens + thinking tokens. */
  outputTokens: number;
  finishReason: string | null;
}

/** Thrown when the model API itself fails (network, quota, 5xx). Never carries the API key. */
export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'LlmUnavailableError';
  }
}

export interface LlmClient {
  readonly kind: 'gemini' | 'mock';
  generate(request: LlmRequest): Promise<LlmResponse>;
}
