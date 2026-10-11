# PermitWatch Houston

> **AI that fights pollution shouldn't create more of it.**

Enter a Houston address or ZIP code. PermitWatch shows every concrete batch plant air permit (TCEQ) nearby and explains each one in plain English, using the numbers printed in the permit. It shows the public comment deadline when the notice lists one and helps you draft a comment.

The AI runs on **GreenRoute**, a routing engine that sends each AI task to the cheapest Gemini model that can handle it and reports the cost and estimated energy saved.

Built for CodeRED Orion (University of Houston) hackathon.

> Status: under active development. Phase 1 (project setup, security, database, importer) is complete.

## Quick start

Requires Node.js 22.12 or newer.

```bash
npm install
cp .env.example .env       
npm run import            # loads data/sample-permits.json (SAMPLE DATA)
npm run dev               # API on :8787, web app on :5173
```


### Importing the real dataset

```bash
npm run import -- path/to/permits.csv                   # .csv or .json; bad rows are rejected and logged, never crash
npm run import -- path/to/permits.json --remove-samples # also deletes the SAMPLE rows
```

Every row is validated with zod. Invalid required fields reject the row. Invalid optional fields are cleared and shown as "Not listed in notice – check TCEQ". All issues are printed and stored in `import_issues`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run check` | Typecheck + lint + unit tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run scan:secrets` | Scans everything git would commit for credentials |
| `npm run build` / `npm start` | Production build / start |

## Data rules

- Every number shown comes from the permit dataset or a cited API. Missing fields read "Not listed in notice – check TCEQ".
- Comment deadlines are shown only when they appear in the data. Nothing is computed.
- Permits show maximum allowed activity, not measured pollution. The app makes no health claims.
- `data/sample-permits.json` is **SAMPLE DATA**: fictional companies, flagged with a "Sample data" badge in the UI.
