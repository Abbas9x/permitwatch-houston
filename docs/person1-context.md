# Person 1 context: Permit Watch data pipeline

Read this at the start of every session. It holds the decisions made while planning, so you can work without asking me to relay them.

## The project

Permit Watch is a CodeRED hackathon project (University of Houston, 24 hours, MLH rules: all project work happens during the event). It shows residents and homebuyers what polluting facilities have been proposed near an address in Harris County, Texas, how they cluster with existing facilities, and how to act before comment deadlines.

The core is data engineering and spatial analysis, not AI. AI is a helper: reading messy PDFs and drafting comments.

## The team

- **Person 1 (me): data pipeline.** Scraping, PDF extraction, geocoding, the data file.
- **Person 2: backend and scoring.** Shared types for the app, burden score, API routes, context data (schools, heat, air monitors).
- **Person 3: frontend and map.** Next.js pages, Leaflet map, address search.
- **Person 4: action features and pitch.** Comment drafting, ElevenLabs voice alerts, deadline countdowns, deployment, slides.

## My boundaries

- Only edit `scraper/`, `data/`, and `.gitignore`. Never touch other folders or shared files (`package.json` at the root, `lib/types.ts`, root `CLAUDE.md`) without me confirming with the team first.
- The repo is public. Never commit `.env` files or API keys. Run `git status` before every commit.
- Work on branch `feature/data`. Commit small and often.

## Scope (decided)

- **Area:** Harris County, not just Houston city limits. It includes East Aldine, Pasadena, Channelview, and Deer Park, which are key demo areas.
- **Facilities:** concrete batch plants only for the MVP.
  - Pending: the concrete batch plant standard permit section of TCEQ's pending air permits page.
  - Existing: already-permitted concrete plants in Harris County, from a TCEQ dataset (source still to be confirmed).
- **Scale-up order, only if time allows:** (1) other pending air permits on the same page, (2) large existing facilities from TCEQ's Point Source Emissions Inventory, (3) Title V permits.
- **Out of scope:** permits by rule (no public notice), water, waste, oil and gas permits.

## Data sources

- Pending air permits page: https://www.tceq.texas.gov/assets/public/permitting/air/reports/applications/nsr-pending-permits.html
  - An HTML table: applicant, facility name, permit number, date received, links to the application and plain-language notice. The concrete batch plant section is further down the page.
  - It is not real-time. Expect a lag of a few weeks.
  - Rows have no addresses. Locations come from the notice PDFs.
- Notice PDFs: usually include the street address, county, and a TCEQ map link with coordinates in the URL (pattern `marker=LONGITUDE,LATITUDE`, longitude first).
  - Concrete plants use a standard permit, so notices may list a production rate instead of tons per year. Emissions may be missing; that's fine.
- Geocoding fallback: the free U.S. Census geocoder, for records with an address but no coordinates.
- Existing plants, candidate sources: TCEQ's Download Data page (https://www.tceq.texas.gov/agency/data/lookup-data/download-data.html), especially the New Source Review permit files. Researchers have built a full Harris County concrete plant list from TCEQ's online permit data before (131 active plants as of 2021), so the data exists.
- Later scale-up: TCEQ Point Source Emissions Data (https://www.tceq.texas.gov/airquality/point-source-ei/point-source-emissions-data). Account-level Excel files per year, about 54MB each. These are reported (actual) emissions, not permitted limits, and must be labeled separately.

## Data rules

- The format is defined in `data/README.md`. That file is the contract with the team. Follow it exactly.
- Never guess. Unknown values are `null`. `emissions` is `[]` when none are listed.
- Keep `permitNumber` exactly as printed. Normalize it only when building the `id`.
- Skip records with no permit number, name, and address, and print how many were skipped.
- Keep only Harris County records.
- Be polite to TCEQ's servers: one request at a time, about a 1-second pause, and cache everything in `data/raw/` so reruns don't refetch.
- Gemini extraction: ask for JSON only, and spot-check results against the actual PDFs. Flag anything that doesn't parse rather than inventing values.

## Plan

1. Done: `.gitignore`, `data/README.md` (format and id rule), `scraper/` TypeScript project with tsx and cheerio.
2. `scraper/src/fetchList.ts`: fetch the pending page (cache to `data/raw/pending.html`, `--refresh` to refetch), parse only the concrete batch plant section, print the row count and the first 3 rows. npm script `list`.
3. Download notice PDFs, extract coordinates from map links, send PDFs to Gemini (key in `scraper/.env`) for address, city, county, zip, permit type, production rate, and emissions if listed. Geocode when coordinates are missing.
4. Write `data/concrete-plants.json`, sorted by permit number. Add a validation script: every record has an id and status, coordinates inside Harris County's bounding box, no duplicate ids. npm scripts `scrape` and `validate`.
5. Find and load existing concrete plants (`status: "existing"`).
6. Fallback at hour 6 of the event: if the scraper isn't working, enter 20 real permits by hand (`locationSource: "manual"`) so the team isn't blocked.
7. Later: pick 3 demo addresses with rich results (East Aldine or near the Ship Channel), count stats for the slides, export cached data for demo mode.

## How to decide things

- If a choice only affects my code or data, decide it yourself using these rules, then tell me briefly what you chose.
- Ask me before anything that changes the data format, touches another person's files, or affects what teammates build. When that happens, also draft a short message I can send to the relevant person.
- If something we planned turns out to be wrong (a data source doesn't have what we expected, a field is never present), say so plainly and suggest an alternative.

## Team messages that matter

- Person 2: the score must not depend on emissions, since concrete plant notices may not list them. Use plant counts, distance, and nearby sensitive sites.
- Person 3: some records have `lat`/`lng` as `null`. Show them in a list instead of skipping them. `data/concrete-plants.json` can be imported directly.
- Person 4: `commentDeadline` is often missing, so the countdown must handle a missing date. Comment drafts should focus on dust and particulate matter.
- Everyone: the repo is public. Never commit keys.
