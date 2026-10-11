import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { importRows, readDatasetFile } from '../importer/importer.js';
import { silentLogger, testDb, testEnv } from '../testUtils.js';
import { commentRouter } from './comments.js';

describe('data-only comment drafts', () => {
  it('drafts editable text in both languages without an external service', async () => {
    const db=testDb();
    try {
      const rows=readDatasetFile('data/sample-permits.json').map(row=>{const source=row as Record<string,unknown>;return {...source,permit_status:source.id==='sample-005'?'pending':'unknown'};});
      await importRows(rows,{db,logger:silentLogger(),source:'sample'});
      const app=createApp({env:testEnv(),db,logger:silentLogger(),routes:[commentRouter({db})],clientDir:'none'});
      for(const language of ['en','es']) {
        const res=await request(app).post('/api/permits/sample-005/comment-draft').send({concerns:['dust'],personalNote:'My observation.',language});
        expect(res.status).toBe(200);expect(res.body.generatedBy).toBe('template');
        expect(res.body.draft.body).toContain('My observation.');
        expect(res.body.draft.subject).toContain('SAMPLE-100005');
        expect(res.body.draft.body).not.toMatch(/NaN|undefined|writing as a resident|como residente/);
      }
      for(const body of [{concerns:[],language:'en'}, {concerns:['dust','dust'],language:'en'}, {concerns:['dust'],language:'bad'}, {concerns:['dust'],language:'en',extra:true}]) {
        expect((await request(app).post('/api/permits/sample-005/comment-draft').send(body)).status).toBe(400);
      }
      db.prepare("UPDATE permits SET permit_status='unknown' WHERE id='sample-005'").run();
      const unconfirmed=await request(app).post('/api/permits/sample-005/comment-draft').send({concerns:['dust'],language:'en'});
      expect(unconfirmed.status).toBe(200);expect(unconfirmed.body.draft.subject).toContain('Concerns');expect(unconfirmed.body.draft.body).not.toContain('public record for this application');
      expect((await request(app).post('/api/permits/unknown/comment-draft').send({concerns:['dust'],language:'en'})).status).toBe(404);
      expect((await request(app).post('/api/permits/sample-005/ask').send({question:'Hours?',language:'en'})).status).toBe(404);
    } finally {db.close();}
  });
});
