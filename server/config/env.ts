import { z } from 'zod';

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
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
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
  // On Render, the service's own public URL is always an allowed origin (same-origin API calls).
  const renderUrl = source.RENDER_EXTERNAL_URL?.trim();
  const merged = renderUrl
    ? { ...source, ALLOWED_ORIGINS: [source.ALLOWED_ORIGINS, renderUrl].filter(Boolean).join(',') }
    : source;
  const result = EnvSchema.safeParse(merged);
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
