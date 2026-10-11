# Permit datasets

- `sites.json`: preserved original archive of 5,978 sites across 15 categories. Most categories describe facilities or infrastructure, not permit applications, and are excluded from the permit search.
- `permit-sites.json`: latest scraper snapshot of concrete batch plants and pending industrial air permits only. Refreshes official TCEQ source indexes; cached notice PDFs and geocoder results are reused where available. Use `--refresh` for a full document refetch.
- `validated-permits.json`: normalized real permits used by deployments. Each record passes the backend schema, has a permit number, operator, address, city, county, Texas coordinates, unique ID, and an official HTTPS TCEQ source link. Sample records are excluded.
- `permit-validation.json`: accepted/rejected counts, reasons, optional-field corrections, detail coverage, source timestamp, and source checksum.
- `concrete-plants.json`: older source snapshot, retained for reference.
- `sample-permits.json`: five fictional development fixtures; never included in the deployment manifest.

Refresh and prepare from the repository root:

```sh
npm ci --prefix scraper
npm run permits --prefix scraper
npm run prepare:permits
```

A failed source refresh leaves the previous permit snapshot unchanged. A preparation run with no accepted permits leaves the published dataset unchanged. Deployment imports use `--strict-real`: any invalid row stops that import before opening its database. All manifest files are prevalidated before the Render wrapper clears its build database. A failed build does not replace the deployed service.

Missing comment deadlines, production limits, pollutants, and operating hours stay absent. Passing validation means a record can be searched and displayed; it does not independently confirm its legal status or that a comment window is open. Coordinates follow the source's map link or the scraper's geocoding result, with provenance retained in `permit-sites.json`.

The pending-application report has its own publication date. A fresh scrape is the retrieval time, not a claim that TCEQ has published newer underlying information. The source records can include older pending applications and effective permits.
