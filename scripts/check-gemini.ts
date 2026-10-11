/**
 * Live check of the Gemini key and the three configured models (never prints the key).
 *   npx tsx scripts/check-gemini.ts
 */
import { loadEnvOrExit } from '../server/config/loadEnv.js';
import { createGeminiClient } from '../server/greenroute/geminiClient.js';
import { createLogger } from '../server/lib/logger.js';

const env = loadEnvOrExit();
if (!env.GEMINI_API_KEY || env.GEMINI_MOCK !== 'off') {
  console.error('GEMINI_MOCK must be "off" and GEMINI_API_KEY set in .env');
  process.exit(1);
}
const client = createGeminiClient({ apiKey: env.GEMINI_API_KEY, timeoutMs: 30_000, logger: createLogger('error'), retries: 1 });

const checks = [
  { tier: 'router', model: env.GEMINI_MODEL_ROUTER, thinking: env.GEMINI_THINKING_ROUTER, json: false, max: 10 },
  { tier: 'small', model: env.GEMINI_MODEL_SMALL, thinking: env.GEMINI_THINKING_SMALL, json: true, max: 200 },
  { tier: 'large', model: env.GEMINI_MODEL_LARGE, thinking: env.GEMINI_THINKING_LARGE, json: true, max: 400 },
] as const;

let failed = 0;
for (const c of checks) {
  const started = Date.now();
  try {
    const res = await client.generate({
      model: c.model,
      system: c.json ? 'Reply only with JSON matching the schema.' : 'Reply with exactly one lowercase word: simple or complex.',
      user: c.json ? 'Return {"ok": true}.' : 'Task: summarize a short, complete permit notice.',
      maxOutputTokens: c.max,
      temperature: 0,
      thinkingLevel: c.thinking,
      ...(c.json
        ? { responseJsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } }
        : {}),
    });
    console.warn(
      `OK   ${c.tier.padEnd(6)} ${c.model} (thinking ${c.thinking}) ${Date.now() - started}ms ` +
        `tokens in/out ${res.inputTokens}/${res.outputTokens} finish=${res.finishReason} reply=${JSON.stringify(res.text.slice(0, 40))}`,
    );
  } catch (error) {
    failed++;
    console.warn(`FAIL ${c.tier.padEnd(6)} ${c.model}: ${(error as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
