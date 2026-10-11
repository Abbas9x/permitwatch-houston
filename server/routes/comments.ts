import { Router } from 'express';
import { z } from 'zod';
import type { CommentDraftResponse } from '../../shared/api.js';
import { COMMENT_CONCERNS, LANGUAGES, PERMIT_ID_PATTERN, PERSONAL_NOTE_MAX } from '../../shared/validation.js';
import type { Limiters } from '../app.js';
import type { DB } from '../db/index.js';
import { getPermitRecord, toPermit } from '../db/permitsRepo.js';
import { HttpError, parseInput } from '../lib/errors.js';
import { templateCommentDraft } from '../services/templates.js';

// eslint-disable-next-line no-control-regex
const stripControl = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
const ParamsSchema = z.object({ id: z.string().regex(PERMIT_ID_PATTERN) });
const CommentBodySchema = z.object({
  concerns: z.array(z.enum(COMMENT_CONCERNS)).max(COMMENT_CONCERNS.length)
    .refine(list => new Set(list).size === list.length, 'concerns must not repeat'),
  personalNote: z.string().max(PERSONAL_NOTE_MAX).default('').transform(s => stripControl(s).trim()),
  language: z.enum(LANGUAGES),
}).strict().refine(body => body.concerns.length > 0 || body.personalNote.length > 0,
  {message:'Choose at least one concern or write a short note.',path:['concerns']});

export function commentRouter({ db }: { db: DB }) {
  return (limiters: Limiters) => {
    const router = Router();
    router.post('/permits/:id/comment-draft', limiters.draft, (req, res) => {
      const {id} = parseInput(ParamsSchema, req.params, 'That permit ID is not valid.');
      const record = getPermitRecord(db,id);
      if (!record) throw new HttpError(404,'permit_not_found','We could not find that permit.');
      const body = parseInput(CommentBodySchema,req.body);
      const response: CommentDraftResponse = {
        draft:templateCommentDraft(toPermit(record),body.concerns,body.personalNote,body.language),
        generatedBy:'template',
      };
      res.json(response);
    });
    return router;
  };
}
