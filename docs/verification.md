# Cleanup and stabilization verification

Verified locally on October 10, 2026, against the shared `main` checkout. No new branch or history rewrite was used. The delivery message records the resulting commit and push status.

## Removal and preserved behavior

Removed the GreenRoute engine, provider clients, routing/model selection, AI caching/call metrics, cost/energy dashboard and charts, question-answer panel and endpoint, provider snapshot import/export and bundled snapshot, provider-check script, Gemini SDK dependency, and all active provider keys/model/config requirements. Updated bilingual copy, API types, README, lockfile, environment example, and Render blueprint.

Retained the existing deterministic summary/comment templates and moved them into ordinary permit services. English/Spanish summaries and editable drafts use dataset facts and user-selected concerns. The draft does not assume the user is a resident. Search, geocoding, maps/markers, permit facts, official links, deadlines, area counts/capacity, and data import remain available. A new migration preserves permit records and removes retired provider state; the shipped initial migration remains intact for upgrade compatibility.

## Reproduced bugs and fixes

- Rounded distances incorrectly included plants just outside the one/two-mile area boundary. Counts now use exact distance; display formatting still rounds.
- Empty scrape datasets were not recognized, and malformed rows/source metadata could abort the whole import. They now reach row validation or are safely ignored as appropriate.
- Emission objects lost sourced pollutant names. The adapter now retains their pollutant fields without fabricating measurements.
- Negative and malformed production-rate strings could become positive capacity. Parsing now rejects those values.
- Invalid geocoder coordinates could reach database writes. Nonfinite/out-of-Texas locations are rejected.
- Imported IDs could be unreachable through the detail endpoint. Import validation now uses the same ID rule as the endpoint.
- Already-aborted client requests still fetched; successful responses with malformed JSON reached consumers as null. Both now produce controlled API errors.
- The browser command discovered unit tests instead of E2E tests. Added an explicit Playwright configuration and meaningful desktop/mobile flows.
- The credential scanner skipped ignored environment files and generated output. It now includes them and reports locations without printing values.

Regression tests reproduced the relevant failures before fixes. Removed provider-only tests were replaced with tests for the retained behavior.

## Final checks

| Check | Result |
| --- | --- |
| `npm install` | Passed; no reported vulnerabilities |
| `npm ci --include=dev` | Passed clean lockfile installation; no reported vulnerabilities |
| `npm run check` | Typecheck and lint passed; 114 unit/integration tests across 18 files passed |
| `npm run test:e2e` | All 3 Playwright tests passed after the final build |
| `npm run scan:secrets` | Passed, including ignored files and generated client/server output |
| Supplemental historical scan | 175 historical blobs across fetched Git refs; zero credential-pattern matches |
| `npm run build` | Client and compiled server passed |
| Compiled production import | All 70 located real records imported; 70 deterministic bilingual summaries built |
| `npm start` | Started in production with a minimal environment and no API credentials; health returned 70 permits |
| Live frontend/browser inspection | Real map style and tiles loaded, 2 real markers for ZIP 77020, details/refresh/Spanish UI worked; screenshots inspected |
| `git diff --check` | Passed |
| Independent code review | No blocking findings, including the final import-data fixes |

Browser tests cover ZIP/address suggestions, map canvas/markers, details/source links, editable templates, repeated/empty searches, refresh, direct navigation, invalid input, geocoder/server failures, malformed responses, and mobile missing optional data. Automated E2E tests use offline address fixtures and a local map style; a separate production browser run checked the live external basemap. It recorded no uncaught page errors or React warnings. Tile requests canceled during navigation were expected.

No real credentials were discovered in the scanned working tree or history. No secret values were printed. These pattern checks cover the fetched history and known formats; they are not a guarantee about unfetched history or every possible credential format. No history was rewritten.

## Local load test

`scripts/stress-local.mjs` starts the compiled application with an in-memory database and offline lookup services. It exercises health, ZIP/coordinate nearby search with area context, permit detail, and suggestions on loopback only. No government or external service receives load-test traffic. Elevated limits are used only in the verification harness; normal application limits remain enabled.

| Phase | Concurrency | Requests | Failures | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low | 2 | 80 | 0 | 10 ms | 77 ms |
| Moderate | 10 | 400 | 0 | 20 ms | 47 ms |
| Burst | 40 | 800 | 0 | 58 ms | 440 ms |
| Repeat | 4 | 200 | 0 | 5 ms | 13 ms |

Total: 1,480 valid responses, zero request failures, zero unhandled rejections. A separate 130-request test of default rate limits accepted 120 and returned 10 proper 429 responses. Process RSS (client and server in one process) increased from 101 MB to 201 MB over this short test; this is not a long-duration memory-leak or capacity assessment.

## Remaining limitations

- The source dataset has 89 records: 70 already have coordinates and 19 need geocoding. The offline load test rejected those 19 unresolved locations; the ordinary importer attempts to geocode them. The production CLI check deliberately used the 70 located records to avoid external lookup variability. Missing coordinates or environmental facts were never invented.
- The live OpenFreeMap style emitted a cosmetic missing `wood-pattern` image warning. Map tiles, rings, and markers still rendered.
- Existing database installations that only start the new server need an import run to rebuild removed provider summaries. Render's build command already performs this import; permit facts remain available during startup-only upgrades.
- Render configuration and the equivalent local build/import/start flow were checked. An actual hosted Render deployment was not verified, nor were external address services subjected to load tests.
- The clean install emitted an ESLint deprecation warning. No broad dependency upgrade was performed.

## Files changed

`M` = modified, `D` = removed, `A` = added. The template file was moved from the retired engine directory into permit services; Git may present it as a rename.

```text
M	.env.example
M	README.md
M	client/index.html
M	client/src/App.tsx
M	client/src/components/Header.tsx
D	client/src/components/charts/ComparisonBars.tsx
D	client/src/components/charts/StackedShareBar.tsx
D	client/src/components/panel/AskPermit.tsx
M	client/src/components/panel/CommentDrafter.tsx
M	client/src/components/panel/PermitPanel.tsx
M	client/src/components/panel/SummaryBlock.tsx
M	client/src/i18n/en.ts
M	client/src/i18n/es.ts
M	client/src/lib/api.ts
M	client/src/lib/format.ts
M	client/src/lib/router.ts
D	client/src/pages/Dashboard.tsx
M	client/src/pages/Landing.tsx
D	data/ai-snapshot.json
M	eslint.config.js
M	package-lock.json
M	package.json
M	render.yaml
D	scripts/check-gemini.ts
M	scripts/scan-secrets.mjs
M	server/app.test.ts
M	server/app.ts
M	server/config/env.test.ts
M	server/config/env.ts
M	server/container.ts
M	server/db/db.test.ts
M	server/db/migrations.ts
M	server/db/summariesRepo.ts
D	server/greenroute/batch.ts
D	server/greenroute/cache.ts
D	server/greenroute/callLog.ts
D	server/greenroute/config.ts
D	server/greenroute/costs.ts
D	server/greenroute/engine.test.ts
D	server/greenroute/engine.ts
D	server/greenroute/geminiClient.ts
D	server/greenroute/injection.test.ts
D	server/greenroute/llm.ts
D	server/greenroute/mockClient.ts
D	server/greenroute/prompts.ts
D	server/greenroute/quality.ts
D	server/greenroute/routing.ts
D	server/greenroute/tasks.ts
D	server/greenroute/templates.ts
D	server/greenroute/testing.ts
D	server/greenroute/units.test.ts
D	server/greenroute/util.ts
M	server/importer/adapters.test.ts
M	server/importer/adapters.ts
M	server/importer/cli.ts
M	server/importer/importer.test.ts
M	server/importer/importer.ts
M	server/importer/rowSchema.ts
D	server/importer/snapshot.ts
M	server/index.ts
M	server/lib/logger.ts
M	server/middleware/security.ts
D	server/routes/ai.test.ts
D	server/routes/ai.ts
M	server/services/search.ts
M	server/testUtils.ts
M	shared/api.ts
M	shared/validation.ts
A	client/src/lib/api.test.ts
A	e2e/permitwatch.spec.ts
A	playwright.config.ts
A	scripts/stress-local.mjs
A	scripts/test-server.ts
A	server/importer/summaries.test.ts
A	server/importer/summaries.ts
A	server/lib/secrets.test.ts
A	server/routes/comments.test.ts
A	server/routes/comments.ts
A	server/services/search.test.ts
A	server/services/templates.ts
A	docs/verification.md
```

[Repository](https://github.com/Abbas9x/permitwatch-houston)
