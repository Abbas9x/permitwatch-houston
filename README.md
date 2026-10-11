# PermitWatch Houston

> **Understand the permits in your neighborhood.**

Enter a Houston address or ZIP code. PermitWatch shows every concrete batch plant air permit (TCEQ) nearby and explains each one in plain English, using the numbers printed in the permit. It shows the public comment deadline when the notice lists one and helps you draft a comment.

Summaries and editable comment drafts are built directly from the dataset fields and your selected concerns. No AI provider or API key is required. Always verify the current comment window with the official source.

Built for CodeRED Orion (University of Houston) hackathon.

> Includes permit search, maps, details, official links, data-only summaries, and editable draft templates.

## Quick start

Requires Node.js 22.12 or newer.

```bash
npm install
cp .env.example .env       
npm run import -- data/concrete-plants.json # real cached TCEQ records
npm run dev               # API on :8787, web app on :5173
```


### Importing the real dataset

```bash
npm run import -- path/to/permits.csv                   # .csv or .json; bad rows are rejected and logged, never crash
npm run import -- path/to/permits.json --remove-samples # also deletes the SAMPLE rows
```

Imports never call an AI service. Rows with missing coordinates are geocoded when possible; unresolved locations are rejected with an import issue and excluded from maps/counts.

Every row is validated with zod. Invalid required fields reject the row. Invalid optional fields are cleared and shown as "Not listed in notice – check TCEQ". All issues are printed and stored in `import_issues`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run check` | Typecheck + lint + unit tests |
| `npm run test:e2e` | Playwright end-to-end tests against the production frontend and local API |
| `npm run test:stress` | Progressive local API load test; run after building |
| `npm run scan:secrets` | Scans source, ignored environment files, and generated output for credentials |
| `npm run build` / `npm start` | Production build / start |

Install Chromium once with `npx playwright install chromium` before running browser tests. Browser tests use a temporary in-memory database, offline address fixtures, and a local map style; they exercise the real map canvas and markers without external service availability affecting the results. The load test uses the located records in the real dataset and calls only local endpoints.

## Production

`render.yaml` builds the client and server, imports the real dataset, and starts one service for the frontend and API. Configure `DATABASE_PATH` and `ALLOWED_ORIGINS` as shown in `.env.example`; the Render service URL is automatically allowed. Locally, run `npm run build`, then `npm run import:prod -- data/concrete-plants.json`, then `npm start`.

## Data rules

- Every number shown comes from the permit dataset or a cited API. Missing fields read "Not listed in notice – check TCEQ".
- Comment deadlines are shown only when they appear in the data. Nothing is computed.
- Permits show maximum allowed activity, not measured pollution. The app makes no health claims.
- `data/sample-permits.json` is **SAMPLE DATA**: fictional companies, flagged with a "Sample data" badge in the UI.
