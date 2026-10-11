# Permit datasets

The deployment snapshot contains **807 real permits**: 144 concrete batch plant, 69 industrial air, 559 individual wastewater discharge and 35 solid-waste authorizations. Every published row has provider or cached geocoder coordinates and an official source URL. No accepted record currently lists a comment deadline. Counts are source-scoped, not a complete inventory of Houston permits.

- `sites.json`: preserved original archive of 5,978 sites across 15 categories; facilities/infrastructure are not automatically permits.
- `permit-sites.json`: cached TCEQ concrete batch and pending industrial-air source records. One row missing street/city remains quarantined.
- `water-permits.json`: EPA ECHO / ICIS-NPDES individual TX0 permits, SIC 4952, across 13 Houston-region counties. EPA's active search includes expired permits; their actual permit lifecycle is preserved. Excludes non-individual permits, known coordinate accuracy over 1,000 meters, out-of-region points/counties and duplicate permit IDs.
- `waste-permits.json`: TCEQ active landfill/transfer-station GIS layers, joined by exact authorization number and RN to the current MSW authorization spreadsheet. GI-613 permit-number ranges distinguish permits from registrations; 15 registrations and one missing physical address are excluded.
- `validated-permits.json`: normalized publication snapshot consumed by the deployment manifest. Names are display/facility labels; unknown operators remain absent and water permittees are stored separately.
- `permit-validation.json`: per-category counts/statuses/coverage, source checksums, exclusions, optional-field corrections and shared-location report. Multiple distinct permits may share a facility point.
- `concrete-plants.json`: older source snapshot retained for reference.
- `sample-permits.json`: five fictional test fixtures, excluded from deployment.

## Authoritative sources

- [TCEQ NSR records](https://www2.tceq.texas.gov/airperm/index.cfm?fuseaction=airpermits.start) and [pending notices](https://www.tceq.texas.gov/permitting/air/newsourcereview/airpermits-pendingpermit-apps).
- [EPA ECHO water API](https://echo.epa.gov/tools/web-services/facility-search-water), [water field definitions](https://echo.epa.gov/help/facility-search/water-search-results-help) and record-specific detailed facility reports.
- [TCEQ MSW data](https://www.tceq.texas.gov/permitting/waste_permits/msw_permits/msw-data), [GIS layers](https://gisweb.tceq.texas.gov/arcgis/rest/services/WP/MSW_FACILITIES_VIEWER/MapServer), and [GI-613 authorization-number definitions](https://www.tceq.texas.gov/downloads/permitting/waste-permits/publications/gi-613-description-of-fields-msw-data-files.pdf).

## Refresh and import

From the repository root:

```sh
npm ci --prefix scraper
npm run permits --prefix scraper
npm run water --prefix scraper
npm run waste --prefix scraper
npm run prepare:permits
npm run import -- data/validated-permits.json --strict-real
```

Water/waste refreshes reuse completed downloads in ignored `data/raw`. Pass `-- --refresh` to their scraper commands for new official downloads. Requests are cached, sequential and spaced at least one second apart. Water QueryIDs are paged immediately and completed county snapshots are cached, preventing stale QueryID reuse. Source retrieval dates are retained across offline reruns; generation time is separate. Historical air/concrete retrieval dates are unavailable and remain absent.

Waste refresh only requires Python 3 with `xlrd` to parse TCEQ's XLS file (`python3 -m pip install xlrd` in a suitable Python environment). The normal application/deployment uses the committed normalized JSON and requires neither Python nor refresh-time dependencies.

Normalization rejects malformed records cleanly. Required publication fields include stable ID, permit number, supported category, display name, reported address/city/county, Texas coordinates and category-appropriate official HTTPS provenance. Missing optional facts stay absent. Preparation requires all four categories on the default path and refuses to replace a snapshot with zero accepted records. Strict deployment imports prevalidate all manifest files before opening/clearing a build database.

## Interpretation limits

An effective/issued authorization does not establish that a facility is operating today. An expired EPA status is displayed as reported; it is not a determination of regulatory compliance. EPA reported addresses can be mailing/permittee addresses and may differ from its facility/discharge/entrance coordinate. Coordinate reference, collection method and reported precision are retained in location notes; official representative points are not surveyed parcel boundaries. Waste GIS physical activity status and XLS legal authorization status remain distinct.

Only an actual listed deadline establishes a countdown. Wastewater/solid-waste and unknown or known issued/effective/expired air records without a listed current deadline lead to the official record, rather than an unsupported comment window. Permit limits are not measured pollution, and proximity is not a health assessment.
