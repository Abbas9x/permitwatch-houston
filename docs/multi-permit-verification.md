# Four-category permit expansion: verification report

Snapshot verified on October 11, 2026. Repository: [Abbas9x/permitwatch-houston](https://github.com/Abbas9x/permitwatch-houston). Baseline commit: `62cd754`.

## 1–5. Categories, sources, counts, coordinates and deadlines

| Category shown to residents | Authoritative source | Published real permits | With coordinates | With listed comment deadlines |
| --- | --- | ---: | ---: | ---: |
| Concrete batch plant | TCEQ NSR records and cached air notices | 144 | 144 | 0 |
| Industrial air permit | TCEQ pending air-permit notices | 69 | 69 | 0 |
| Wastewater discharge | EPA ECHO / ICIS-NPDES individual wastewater permits | 559 | 559 | 0 |
| Solid waste | TCEQ landfill/transfer GIS joined to MSW authorization spreadsheet | 35 | 35 | 0 |
| **Total** | | **807** | **807** | **0** |

Previous publication contained 213 permits. This adds **594**, without counting facilities as permits or mixing fictional test fixtures into production.

Sources and field definitions:

- [TCEQ NSR search](https://www2.tceq.texas.gov/airperm/index.cfm?fuseaction=airpermits.start), [pending air applications](https://www.tceq.texas.gov/permitting/air/newsourcereview/airpermits-pendingpermit-apps).
- [EPA water API](https://echo.epa.gov/tools/web-services/facility-search-water), [water field definitions](https://echo.epa.gov/help/facility-search/water-search-results-help). Each accepted water row links to its official ECHO detailed facility report.
- [TCEQ MSW data](https://www.tceq.texas.gov/permitting/waste_permits/msw_permits/msw-data), [GIS layers](https://gisweb.tceq.texas.gov/arcgis/rest/services/WP/MSW_FACILITIES_VIEWER/MapServer), [GI-613 authorization-number definitions](https://www.tceq.texas.gov/downloads/permitting/waste-permits/publications/gi-613-description-of-fields-msw-data-files.pdf).

Actual normalized lifecycle counts:

- Concrete: 139 unknown, 5 pending.
- Industrial air: 69 pending.
- Wastewater: 514 effective, 22 administratively continued, 23 expired.
- Solid waste: 35 issued.

All records have official URLs and usable source or cached geocoder coordinates. Coordinates are representative points, not surveyed property boundaries. No deadline was inferred. Unknown operator names remain absent; 559 water permittee names are stored separately from operators.

## 6. Data and schema changes

Expanded the existing common permit representation to four categories and six lifecycle statuses. Added facility/operator/permittee distinctions, raw source status, source provenance, retrieval timestamp, application date and location notes. Application type (new/renewal/amendment) remains separate from lifecycle status.

Append-only SQLite migration 4 expands category support while preserving existing permits and cached summaries. A populated version-3 database upgrade is tested, including foreign-key integrity. Historical concrete/air retrieval timestamps remain absent when unknown; dataset generation time is not mislabeled as source retrieval time.

Water selection covers 13 Houston-region counties, SIC 4952, individual IDs matching `TX0` plus six digits. Waste selection joins exact authorization number and RN across the official GIS and XLS sources, and excludes registrations.

## 7. Normalization and import

New cached, sequential water and waste collectors normalize official data into the existing importer format. Water caches completed county results, rather than reusing potentially expired EPA QueryIDs. Waste retains original source download timestamps across offline processing. Refresh requests are spaced and reuse local downloads unless a refresh is explicitly requested.

`prepare:permits` merges the existing air/concrete dataset and the two new source files. Validation checks stable IDs, authorization numbers, supported categories, coordinates, dates, names, address fields, official HTTPS provenance and duplicates. It emits checksums, category/status/coverage totals, exclusions and shared locations in `data/permit-validation.json`. The default publication path requires all four nonempty categories and rejects a zero-record result.

Exclusions are retained in the audit:

- Existing air/concrete: one row with no street/city rejected; 213 accepted.
- Water: 1,513 downloaded rows, 559 accepted. Excluded 548 coarse-coordinate rows, 368 non-individual IDs, 16 duplicate permits, 11 outside-region counties, 8 outside-region points, 3 missing counties.
- Waste: 51 GIS rows, 35 accepted. Excluded 15 registrations and one permit lacking a physical street/city.

The combined publication has **807 accepted, no sample records, no duplicate IDs or category/authorization pairs, zero warnings**. Distinct permits sharing a facility point are retained; they are not aggressively merged.

The manifest still uses the existing deployment importer. Its strict prevalidation completes before the build database is cleared. An isolated production import and the deployment wrapper both imported **807/807**, rejected zero published rows, and generated 807 deterministic summaries. Database integrity and foreign-key checks passed. The original 5,978-site archive is preserved unchanged.

## 8–9. Backend and API behavior

Extended existing routes instead of creating a parallel API:

- `GET /api/search`: existing address/ZIP or explicit latitude/longitude, radius 1–10 miles, optional `category` and `status`. Default is all categories and statuses.
- `GET /api/permits/:id`: category/status, facility and source facts, nullable missing values and official links.
- Existing comment-draft route: source-aware eligibility; returns `409 comment_period_unconfirmed` for unsupported unknown/historical authorizations without a listed current deadline.

Filters apply consistently to results, area category counts and nearest matching records outside the radius. Existing deterministic distance and bearing calculations are reused. Invalid categories/statuses, repeated parameters, malformed coordinates, incomplete coordinate pairs and invalid radius values are rejected cleanly.

Example:

```text
/api/search?lat=29.810683571296&lng=-95.213255154669&radius=3
/api/search?lat=29.810683571296&lng=-95.213255154669&radius=3&category=wastewater_permit
/api/search?lat=29.810683571296&lng=-95.213255154669&radius=3&status=expired
```

A known approval/effective status does not establish present operation. Pending does not mean approved. Missing limits, deadlines, operators and notice URLs stay missing; they do not cause server errors.

## 10. Frontend changes

Preserved the existing map, address search, radius slider, themes, rotating globe, routing, cards and details. Added category/status controls and area counts. URL state preserves filters, radius, coordinates and selection across refresh/search.

Categories have labels and symbols independent of the existing application-type colors: triangle for concrete, square for industrial air, diamond for wastewater, circle for solid waste. Map legend, markers and cards agree. Cards prioritize facility/category/status/distance. Details separate operator from permittee and expose source/location notes. Concrete-specific production/hours fields are limited to concrete records.

English/Spanish copy now describes environmental permits without claiming complete coverage. Unknown values link to the official source. Historical, unknown or issued records without a confirmed period use neutral official-record actions. A supplied elapsed deadline remains visible while comment tools are hidden. Pending air tools include source-confirmation wording rather than claiming a verified open period.

## 11. Verification

Final verification commands and results:

| Check | Result |
| --- | --- |
| `npm run check` | 209 tests in 30 files passed; TypeScript and ESLint passed |
| `npm run test:e2e` | 10/10 browser scenarios passed |
| `npm run scan:secrets` | Passed |
| `npm run build` | Client and server production builds passed |
| Scraper TypeScript check | Passed |
| Strict production import / deployment wrapper | 807 imported, 0 rejected; 807 summaries |
| Local stress | 1,480 requests, 0 failures; rate-limit behavior separately passed |

Browser tests use separate sample-regression and real-807 databases, preventing fixture mixing. They cover all four categories, filters, counts, clickable details, official links, empty filtered states, mobile Spanish, theme switching, radius changes, refresh, repeated searches, errors and preserved globe/search behavior.

Stress observed p95 times around 17 ms low load, 36 ms moderate load, 129 ms burst and 14 ms repeated requests on this local machine. This is a local integration check, not a production capacity guarantee.

Manual production preview checks used real Census address lookup and external OpenFreeMap tiles. Both light and dark maps rendered correctly after tiles loaded. Water filtering, details, source links, radius changes and reload worked; no uncaught browser errors were observed. Representative official links from each category returned HTTP 200. Source samples were verified before scaling; this does not claim that every linked government page was individually opened.

## 12. Bugs found and fixed

- Prevented generated snapshot timestamps from being presented as source retrieval dates.
- Preserved expired/administratively continued EPA statuses despite an active-facility search filter.
- Excluded TCEQ transfer registrations from the permit inventory.
- Separated water permittees from unknown operators.
- Removed unsupported comment calls to action for unknown older concrete authorizations and known issued/expired records; aligned backend and frontend policy.
- Suppressed ambiguous physical activity labels alongside unknown legal permit status.
- Fixed detail-close focus restoration stealing keyboard focus from the radius slider.

Independent data and integration review was completed, and identified defects were corrected and retested.

## 13. Build result

The production client/server build succeeds and the complete strict dataset loads. Refreshing government sources requires separate scraper tooling, but production serves committed normalized JSON and needs neither a Python runtime nor an AI API key. Gemini and GreenRoute remain removed.

## 14. Remaining limitations

- Coverage is a source-scoped regional snapshot, not every Houston environmental permit.
- Zero published comment deadlines. No guaranteed open comment window or countdown can be advertised from this snapshot.
- Only five records list concrete production rates; 57 have pollutant lists. These are source-listed facts, not measured emissions or health impacts.
- Water addresses may be mailing/permittee addresses; location notes preserve the provider's coordinate basis and known precision. Unknown precision is not invented.
- New water/waste sources generally lack operator names, emissions limits and notice details. Missing facts are clearly marked.
- Old concrete sources sometimes link to a generic official search; ECHO detailed reports are client-rendered. Those source views can require further navigation for original permit documents.
- Waste refresh requires Python 3 and `xlrd` for the official XLS. Normal deployment does not.
- Issued/effective, expired, and GIS facility activity are different concepts. The app makes no operating/compliance determination or proximity-based health claim.
- Local build and preview are verified. Render deployment status has not been confirmed; deployment troubleshooting remains paused at the user's request.

## 15. Known-good demo

**5303 S Lake Houston Pkwy, Houston, TX 77049**, default **3-mile radius**. Live Census match: `29.810683571296, -95.213255154669`.

**18 results: 2 concrete, 1 industrial air, 12 wastewater, 3 solid waste.** This demonstrates all four categories with real records.

[Open local demo](http://127.0.0.1:8788/?q=5303+S+Lake+Houston+Pkwy%2C+Houston%2C+TX+77049).

## 16. Files changed

Main changes grouped for review:

- Data: `data/water-permits.json`, `data/waste-permits.json`, `data/validated-permits.json`, `data/permit-validation.json`, `data/README.md`.
- Collectors: `scraper/src/refreshWaterPermits.ts`, `normalizeWaterPermits.ts`, `refreshWastePermits.ts`, `normalizeWastePermits.ts`, scraper scripts.
- Import/schema: `shared/permit.ts`, `shared/api.ts`, `shared/area.ts`, `server/db/migrations.ts`, `permitsRepo.ts`, importer schema/adapters/preparation/importer, `scripts/prepare-permits.ts` and normalization/import tests.
- Backend: search route/service, comment route, deterministic templates and associated tests; `shared/commentPolicy.ts` and tests.
- Frontend: category controls/helper, results page, map/legend, cards/badges/facts/panel/actions, area summary, search/router/API, bilingual copy/styles and presentation/router/panel tests.
- Verification: real multi-permit E2E, existing E2E updates, separate test servers, Playwright configuration and stress paths.
- Documentation: root README, this report and `docs/superpowers/plans/2026-10-11-multi-permit.md`.

The final commit provides the exact path list and diff.

## 17–19. Git status, commit and push

Integration target is the existing shared `main` branch. Before integration, a fresh fetch showed no incoming teammate commits against baseline `62cd754`. No force push, reset or extra branch was used. Final commit hash, push confirmation and working-tree status are reported in the completion message; this report is included in that commit and cannot contain its own hash.
