import { Router } from 'express';
import { z } from 'zod';
import type { AiMeta, AskResponse, CommentDraftResponse, GreenRouteStatsResponse } from '../../shared/api.js';
import {
  COMMENT_CONCERNS,
  LANGUAGES,
  PERMIT_ID_PATTERN,
  PERSONAL_NOTE_MAX,
  QUESTION_MAX,
} from '../../shared/validation.js';
import type { Limiters } from '../app.js';
import type { DB } from '../db/index.js';
import { getPermitRecord, toPermit } from '../db/permitsRepo.js';
import { HttpError, parseInput } from '../lib/errors.js';
import { getStats } from '../greenroute/callLog.js';
import { GreenRouteError, type GreenRoute, type RunMeta } from '../greenroute/engine.js';
import { commentDraftTask, permitQaTask } from '../greenroute/tasks.js';
import { templateCommentDraft } from '../greenroute/templates.js';

// eslint-disable-next-line no-control-regex
const stripControl = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

const ParamsSchema = z.object({ id: z.string().regex(PERMIT_ID_PATTERN) });

const CommentBodySchema = z
  .object({
    concerns: z
      .array(z.enum(COMMENT_CONCERNS))
      .max(COMMENT_CONCERNS.length)
      .refine((list) => new Set(list).size === list.length, 'concerns must not repeat'),
    personalNote: z.string().max(PERSONAL_NOTE_MAX).default('').transform((s) => stripControl(s).trim()),
    language: z.enum(LANGUAGES),
  })
  .strict()
  .refine((body) => body.concerns.length > 0 || body.personalNote.length > 0, {
    message: 'Choose at least one concern or write a short note.',
    path: ['concerns'],
  });

const AskBodySchema = z
  .object({
    question: z
      .string()
      .max(QUESTION_MAX * 2)
      .transform((s) => stripControl(s).trim())
      .pipe(z.string().min(3, 'Please type a question.').max(QUESTION_MAX, `Please keep questions under ${QUESTION_MAX} characters.`)),
    language: z.enum(LANGUAGES),
  })
  .strict();

function publicMeta(meta: RunMeta): AiMeta {
  return {
    model: meta.model,
    routedBy: meta.routedBy,
    cacheHit: meta.cacheHit,
    fallback: meta.fallback,
    costUsd: meta.costUsd,
    baselineCostUsd: meta.baselineCostUsd,
  };
}

export function aiRouter(deps: { db: DB; engine: GreenRoute }) {
  const { db, engine } = deps;

  function loadPermit(params: unknown) {
    const { id } = parseInput(ParamsSchema, params, 'That permit ID is not valid.');
    const record = getPermitRecord(db, id);
    if (!record) throw new HttpError(404, 'permit_not_found', 'We could not find that permit.');
    return { permit: toPermit(record), noticeText: record.raw_text };
  }

  return (limiters: Limiters) => {
    const router = Router();

    router.post('/permits/:id/comment-draft', limiters.ai, async (req, res) => {
      const { permit, noticeText } = loadPermit(req.params);
      const body = parseInput(CommentBodySchema, req.body);
      let response: CommentDraftResponse;
      try {
        const result = await engine.run(commentDraftTask, { permit, noticeText, ...body });
        response = { draft: result.output, generatedBy: result.meta.generatedBy, meta: publicMeta(result.meta) };
      } catch (error) {
        if (!(error instanceof GreenRouteError)) throw error;
        // Graceful degradation: a data-only template the resident can still edit and send.
        response = {
          draft: templateCommentDraft(permit, body.concerns, body.personalNote, body.language),
          generatedBy: 'template',
          meta: null,
        };
      }
      res.json(response);
    });

    router.post('/permits/:id/ask', limiters.ai, async (req, res) => {
      const { permit, noticeText } = loadPermit(req.params);
      const body = parseInput(AskBodySchema, req.body);
      try {
        const result = await engine.run(permitQaTask, { permit, noticeText, ...body });
        const response: AskResponse = { ...result.output, generatedBy: result.meta.generatedBy, meta: publicMeta(result.meta) };
        res.json(response);
      } catch (error) {
        if (!(error instanceof GreenRouteError)) throw error;
        throw new HttpError(
          503,
          'ai_unavailable',
          'The AI assistant is unavailable right now. The permit details above are still accurate, and the official notice is linked.',
        );
      }
    });

    router.get('/greenroute/stats', (_req, res) => {
      const response: GreenRouteStatsResponse = {
        ...getStats(db, engine.models.large),
        mode: engine.mode,
        models: engine.models,
      };
      res.json(response);
    });

    return router;
  };
}
