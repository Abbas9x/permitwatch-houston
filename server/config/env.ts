import { z } from 'zod';

const modelId = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9.-]{2,63}$/, 'must be a Gemini model ID such as "gemini-3.5-flash-lite"');

const thinkingLevel = z.enum(['minimal', 'low', 'medium', 'high']);

const originList = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(
        z.string().refine((origin) => {
          try {
            const url = new URL(origin);
            return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === origin;
          } catch {
            return false;
          }
        }, 'each entry must be an exact origin like https://example.com (no path or trailing slash)'),
      )
      .min(1),
  );

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    ALLOWED_ORIGINS: originList,
    DATABASE_PATH: z.string().trim().min(1),
    GEMINI_API_KEY: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : undefined)),
    GEMINI_MODEL_ROUTER: modelId,
    GEMINI_MODEL_SMALL: modelId,
    GEMINI_MODEL_LARGE: modelId,
    GEMINI_THINKING_ROUTER: thinkingLevel.default('minimal'),
    GEMINI_THINKING_SMALL: thinkingLevel.default('minimal'),
    GEMINI_THINKING_LARGE: thinkingLevel.default('low'),
    GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(25_000),
    GEMINI_MOCK: z.enum(['off', 'ok', 'down']).default('off'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.GEMINI_MOCK === 'off' && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'is required (or set GEMINI_MOCK=ok for offline development and tests)',
      });
    }
    if (env.NODE_ENV === 'production' && env.GEMINI_MOCK !== 'off') {
      ctx.addIssue({ code: 'custom', path: ['GEMINI_MOCK'], message: 'must be "off" in production' });
    }
    if (env.GEMINI_API_KEY && !/^[A-Za-z0-9_-]{20,200}$/.test(env.GEMINI_API_KEY)) {
      ctx.addIssue({ code: 'custom', path: ['GEMINI_API_KEY'], message: 'does not look like a valid API key' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

/**
 * Validates environment variables. Error messages name the variable and the
 * problem but never echo the value, so a misconfigured secret is not logged.
 */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      const message = issue.code === 'invalid_type' && issue.input === undefined ? 'is required' : issue.message;
      return `${name} ${message}`;
    });
    throw new EnvError(problems);
  }
  return result.data;
}
