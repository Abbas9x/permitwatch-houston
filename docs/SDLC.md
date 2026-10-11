# Permit Watch Software Development Life Cycle

This document describes the repository's current implementation and local verification as of October 11, 2026. It uses the source code, committed data, configuration and verification reports as evidence. Planned improvements are identified separately from implemented features.

## 1. Project Overview

Permit Watch is a civic-tech application built for the CodeRED Orion hackathon at the University of Houston. It helps residents and community members discover Houston-area environmental permits near an address or ZIP code, understand available permit facts and find the official source for further action. Hackathon judges can use the same search and detail flow to evaluate the project.

Government permit information is spread across searches, notices, spreadsheets, GIS layers and agency APIs. Permit Watch brings a selected set of those records into one searchable map. It presents source-based summaries and editable concern drafts while clearly marking missing information. It does not measure pollution or determine health impacts.

## 2. Team

The team members are **David, Muhammad, Jack and Omar**.

The project involves shared responsibility for data collection, validation, backend services, frontend design, integration, testing and demonstration. The repository does not establish a complete individual ownership map for these areas, so this document does not assign subsystem ownership or formal job titles to team members.

## 3. Planning

The initial MVP focused on finding nearby concrete batch plant air permits, showing their source facts and helping residents understand how to comment. That focus remains visible in earlier documentation, importer support and concrete-specific detail fields.

The implemented scope expanded to four environmental permit categories using the existing search, database and map. The expansion added category/status filters, category counts and distinct marker symbols rather than introducing a separate application for each source.

Scope control centers on records that can be supported by public sources. The broader site archive is retained for reference, but infrastructure or facility records are not automatically counted as permits. Missing deadlines and operating details are left unknown. The current release uses deterministic templates, without Gemini or GreenRoute dependencies in the active application.

## 4. Requirements Analysis

### Functional requirements

- Search by Houston-area address or ZIP code, with address suggestions and explicit coordinates for selected places.
- Select a radius from **1–10 miles**, with a default of **3 miles**.
- Display permit locations, a radius boundary, category symbols and a distinct search-location marker on an interactive map.
- Filter results by permit category and lifecycle status, keeping map markers, result lists and area counts consistent.
- Open permit details with available numbers, reported locations, source notes and official links.
- Generate and edit English or Spanish comment/concern templates from permit fields and user-selected concerns. Residents review and submit through the appropriate official process themselves.
- Support English/Spanish copy and light/dark appearance.
- Preserve query, radius, filters, explicit coordinates and selected permit in URL state.
- Keep distinct permits selectable when they share coordinates and preserve written concerns when resizing between desktop and mobile layouts.

### Non-functional requirements

Reliability requires controlled validation errors, cancellation of superseded searches and usable empty/error states. Data accuracy requires stable identifiers, official provenance, validated locations and source-supported environmental facts. Responsiveness includes desktop/mobile layouts, local radius updates and reduced-motion/static background support.

Accessibility is supported through labeled controls, keyboard navigation, focus handling, category symbols and text alongside color. These measures are implemented and tested in selected flows; they are not a claim of a comprehensive accessibility audit.

Security measures include input validation, request/body limits, origin restrictions, security headers, parameterized database access and credential scanning. Missing data must remain clearly marked. The application must not invent measurements, comment deadlines, observations, violations or health conclusions.

## 5. System Design

The main data and application flow is:

```text
External public data: TCEQ and EPA
                ↓
TypeScript scrapers / collectors
                ↓
Normalization into common permit records
                ↓
Publication validation and exclusion audit
                ↓
Committed validated snapshot → SQLite import
                ↓
Express backend
                ↓
React frontend
                ↓
Resident / hackathon judge
```

Shared TypeScript models in `shared/` define API responses, permit fields, categories, statuses, validation rules and geographic calculations. Application type, such as new or renewal, is separate from lifecycle status, such as pending or effective.

Location search uses address/place services and Texas ZIP centroids, with cached geocoding and explicit coordinates when a suggestion is selected. The backend first selects geographic candidates using a bounding box, then applies exact Haversine distance calculations and category/status filters. Bearings provide direction labels. The frontend loads the location's maximum search range and recalculates smaller radius views locally.

Each permit retains an official source link and available provenance/location notes. Facility, operator and permittee fields are kept distinct when the source supports them. Unknown values remain nullable rather than being inferred.

## 6. Data Collection and Processing

The published snapshot contains **807 real validated records**:

| Category | Source | Records |
| --- | --- | ---: |
| Concrete batch plant | TCEQ NSR records and cached air notices | 144 |
| Industrial air | TCEQ pending air-permit notices | 69 |
| Wastewater discharge | EPA ECHO / ICIS-NPDES | 559 |
| Solid waste | TCEQ GIS and MSW authorization spreadsheet | 35 |
| **Total** | | **807** |

All published records have usable coordinates and official source URLs. None currently contains a confirmed comment deadline. These counts describe the committed snapshot, not an exhaustive regional inventory.

The collectors cache downloads and space sequential requests at least one second apart. Water collection caches completed county results rather than reusing expired EPA query identifiers. Waste collection joins GIS and spreadsheet records using authorization numbers and regulated-entity identifiers. Its XLS parsing step invokes Python 3 with `xlrd`; normal serving and deployment do not require Python.

Normalization and publication validation check identifiers, permit numbers, supported categories, display names, reported addresses, coordinates, dates, official provenance and duplicates. Unusable or unsupported rows are rejected or retained outside the publication snapshot with audit information. Water exclusions include coarse coordinates, non-individual permit identifiers and out-of-scope records. Waste exclusions include registrations and records without a usable physical address.

Distinct permits at one location are retained. Marker offsets separate their on-screen buttons without changing source coordinates or calculated distances. Coordinates may be representative agency points or cached geocoder results; they are not surveyed property boundaries.

`data/permit-validation.json` records coverage, checksums, exclusions and shared locations. The original site archive is preserved. Fictional records in `data/sample-permits.json` are separate test fixtures and are excluded from the production manifest.

## 7. Implementation

### Data layer

SQLite, accessed through `better-sqlite3`, stores permits, deterministic summaries, geocoding cache and import audit records. Sequential schema migrations preserve existing installations while expanding category support. The importer accepts JSON/CSV through adapters and Zod validation. Invalid required values reject a row; invalid optional facts are cleared and reported. Unresolved locations are excluded from mapped counts.

### Backend

Node.js, Express and TypeScript provide health, search, permit-detail, suggestion and comment-draft endpoints. Search responses include distances, directions, area/category counts and nearest matching records when appropriate. Draft templates use source facts and user concerns. Shared comment policy controls formal comment actions; historical or unknown records can still offer neutral concerns/information-request drafts without claiming an open application period.

### Frontend

React and TypeScript implement the search, controls, result cards and permit panels. Vite builds the client; Tailwind CSS supplies styling. MapLibre GL renders the interactive map and current rotating Earth background. Framer Motion handles transitions. React Three Fiber, Three.js and Drei are installed and used by the retained shader-background component; the current landing page uses the MapLibre Earth component, so the shader component is not described as the active globe renderer.

Bilingual copy and appearance preferences are maintained in client state/local storage. URL routing supports refreshable search views. Details expose official records, clearly marked missing facts and editable templates. The concerns drafter does not send messages or submit complaints automatically.

### Integration

The production Express service serves both the API and built client from one origin. Shared models connect collector output, importer records, backend responses and UI presentation. The deployment manifest selects the validated snapshot. Local browser tests use separate sample and real-data databases, avoiding fixture contamination.

## 8. Testing and Verification

Current local verification uses the following checks:

| Check | Current result |
| --- | --- |
| Vitest, including Supertest route coverage | **210 passing tests in 30 files** |
| TypeScript and ESLint | Passed |
| Playwright | **15 browser/E2E scenarios passing** |
| Client and server production build | Passed |
| Secret scanning | Passed |
| Previous local API stress verification | **1,480 requests, 0 failures** |

The older [multi-permit verification report](multi-permit-verification.md) includes earlier checkpoints of 209/210 tests and 10/13 browser scenarios. The current E2E files include the subsequent draft-preservation and browser-Back scenarios, bringing the count to 15.

Coverage includes all four categories, filters, counts, official provenance, shared-coordinate selection, radius changes, refresh, repeated search, desktop/mobile layouts, Spanish controls, themes, invalid input and server-error recovery. A reproduced bug showed that changing layout erased concerns text; the panel now stays mounted across that change, and a regression verifies both entered notes and edited drafts.

Browser tests exercise real MapLibre canvases with offline location fixtures and a controlled map style. They do not establish external service availability. Local load testing uses an isolated database and loopback endpoints with offline lookup services; no government service receives stress traffic. Separate throttling checks verified 120 accepted requests followed by 10 controlled rate-limit responses. This is local integration evidence, not production-scale load testing or a capacity guarantee.

## 9. Deployment

`render.yaml` configures one Render Node web service, automatic deployment, `/api/health` and `npm start`. Its build runs `npm ci --include=dev` followed by `npm run render-build`, which builds the client/server and imports datasets from `data/datasets.json`.

The manifest currently contains only `data/validated-permits.json`. Deployment import prevalidates all listed files before clearing the build database; the fresh-database option applies only in the Render environment. Strict imports reject fictional/unusable production data and regenerate deterministic summaries.

Configuration includes `NODE_ENV`, `PORT`, `DATABASE_PATH`, `ALLOWED_ORIGINS`, `TRUST_PROXY` and `LOG_LEVEL`. The Render service URL is added to allowed origins at runtime. Node.js 22.12 or newer is required by the package; the blueprint specifies its Node version. There is no AI API key requirement.

Local build/import/preview behavior is verified. The repository contains Render configuration, but this document does **not** confirm that the hosted service currently serves this release. Deployment status remains an external check.

## 10. Maintenance and Future Development

Future work could include broader geographic coverage, additional permit categories, better notice and deadline coverage, scheduled data refreshes with validation alerts, resident notifications, neighborhood sharing and QR/share-link tools. These are possible next steps, not claims of completed features.

Maintenance should retain source downloads/audits, distinguish retrieval time from generation time, review upstream schema changes and rerun normalization/import checks before publishing refreshed data. Schema changes should use new migrations. New behavior should receive regression coverage while preserving source limitations and existing search/form flows.

## 11. Risks and Limitations

- The data is a source-scoped snapshot and can become stale; absence from search does not prove that no permit exists.
- The current publication has **zero confirmed comment deadlines**. Pending status alone does not establish an open comment period.
- Government records often omit production limits, operating hours, pollutants, operators or complete notices. Missing fields remain marked and linked to the official source.
- Some water addresses may be mailing/permittee addresses rather than physical discharge locations. Source location notes must be considered.
- Generic official search links may require additional navigation to find original documents.
- Issued/effective status does not prove present operation; an expired status is not an app determination of regulatory compliance.
- Permitted activity or emissions limits are not actual measured pollution. Proximity does not establish health impact.
- Geocoding, map tiles and agency pages depend on external services. Local tests and security checks do not establish production capacity or eliminate every possible defect.

## 12. Current Release Summary

The current working version joins **807 real permits across four categories** through the full public-data → normalization/validation → SQLite → Express → React pipeline. Residents can search within 1–10 miles, filter results, open details and official sources, and edit bilingual concern templates in either appearance mode. Shared-coordinate permits remain separately selectable, and form text survives responsive layout changes.

The documented demo location remains **5303 S Lake Houston Pkwy, Houston, TX 77049**, at the default **3-mile radius**. The committed snapshot returns **18 permits: 2 concrete, 1 industrial air, 12 wastewater and 3 solid waste**. This is a snapshot-based demo, not a claim of complete neighborhood coverage.

Current verification is 210 automated tests, 15 browser scenarios, passing type/lint/build/secret checks and the recorded local 1,480-request stress result. Hosted deployment of this exact release is not confirmed here.

### Repository evidence

- [Project README](../README.md) and [package scripts/dependencies](../package.json).
- [Data workflow](../data/README.md), [publication audit](../data/permit-validation.json) and [deployment manifest](../data/datasets.json).
- [Multi-permit verification](multi-permit-verification.md) and [earlier stabilization verification](verification.md).
- [Collectors](../scraper/src/), [backend](../server/), [frontend](../client/src/), [shared models](../shared/) and [browser scenarios](../e2e/).
- [Render blueprint](../render.yaml) and [deployment importer](../scripts/import-datasets.mjs).

The document was prepared against shared main at `d3f38ee`, including the preceding `8e9438b` draft-preservation fix. It avoids unsupported role assignments, process ceremonies, research claims, schedules and production-readiness claims.
