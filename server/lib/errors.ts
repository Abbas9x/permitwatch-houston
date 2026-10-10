import type { ErrorRequestHandler } from 'express';
import type { z } from 'zod';
import type { Logger } from './logger.js';

/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly publicMessage: string,
    public readonly details?: { field: string; message: string }[],
  ) {
    super(publicMessage);
    this.name = 'HttpError';
  }
}

/** Parses untrusted input or throws a 400 that names the bad fields (never echoes values). */
export function parseInput<T>(schema: z.ZodType<T>, data: unknown, message = 'Please check your input and try again.'): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(
      400,
      'invalid_input',
      message,
      result.error.issues.map((issue) => ({ field: issue.path.map(String).join('.') || 'input', message: issue.message })),
    );
  }
  return result.data;
}

interface BodyParserError {
  type?: string;
  status?: number;
}

/**
 * Final error handler: friendly JSON for the client, full detail only in server logs.
 * Stack traces and internal messages are never sent to the browser.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    const requestId = res.getHeader('X-Request-Id');
    const bodyError = err as BodyParserError;

    let status = 500;
    let code = 'internal_error';
    let message = 'Something went wrong on our side. Please try again in a moment.';
    let details: HttpError['details'];

    if (err instanceof HttpError) {
      ({ status, code, publicMessage: message, details } = err);
    } else if (bodyError?.type === 'entity.too.large') {
      status = 413;
      code = 'payload_too_large';
      message = 'That request is too large.';
    } else if (bodyError?.type === 'entity.parse.failed') {
      status = 400;
      code = 'invalid_json';
      message = 'The request body is not valid JSON.';
    } else if (typeof bodyError?.status === 'number' && bodyError.status >= 400 && bodyError.status < 500) {
      status = bodyError.status;
      code = 'bad_request';
      message = 'The request could not be processed.';
    }

    if (status >= 500) {
      logger.error({ err, requestId, method: req.method, path: req.path }, 'request failed');
    } else {
      logger.info({ requestId, method: req.method, path: req.path, status, code }, 'request rejected');
    }

    if (res.headersSent) return;
    res.status(status).json({ error: { code, message, ...(details ? { details } : {}), requestId } });
  };
}
