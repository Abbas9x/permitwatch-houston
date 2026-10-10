import { pino, type Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: undefined,
    redact: {
      // Defense in depth: none of these should ever be logged, but if one is, mask it.
      paths: [
        'apiKey',
        '*.apiKey',
        'GEMINI_API_KEY',
        '*.GEMINI_API_KEY',
        'headers["x-goog-api-key"]',
        '*.headers["x-goog-api-key"]',
        'req.headers.authorization',
        'req.headers.cookie',
        'email',
        '*.email',
      ],
      censor: '[redacted]',
    },
  });
}
