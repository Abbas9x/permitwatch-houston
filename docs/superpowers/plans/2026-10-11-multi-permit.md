# Multi-permit implementation plan

> For agentic workers: execute the supplied phase order with independent source collectors and a final independent review.

**Goal:** Expand real Houston-area coverage to concrete batch, industrial air, wastewater discharge, and solid-waste permits.
**Architecture:** Preserve the existing normalized dataset, SQLite importer, search API and MapLibre UI. Add authoritative EPA individual wastewater permits and TCEQ issued solid-waste authorizations; expose source status and provenance without treating facility activity as permit approval.
**Stack:** TypeScript, Zod, SQLite, Express, React, MapLibre, Vitest, Playwright.
**Spec:** User attachment 3a3419ce-906c-47df-9d74-aee5dbd6e03d/Pasted text.txt.

## Baseline audit
213 published real permits: 144 concrete batch, 69 pending industrial air; all coordinates and official links, no deadlines. Archive contains 5,978 mixed facilities/infrastructure, not 5,978 permits. Waste source sample verifies 36 permits, excluding 15 registrations; one physical address is absent. EPA archive contains 557 individual wastewater permits but loses permittee and hides expired status. Fresh sample verified against EPA and a TCEQ investigation. Keep archive intact.

## Constraints and review focus
Data before backend before frontend. Keep main/shared work safe; no force push or reset. No AI keys, invented fields or unrelated redesign. Preserve themes, rotating globe, radius and search routing. Review mailing-address versus facility-point differences, expired versus active source searches, registrations versus permits, migration survival of cached summaries, and filter/radius/selection URL consistency.

## Phase 1 — normalized import
- [x] Test official category-specific provenance, status preservation, duplicate authorization IDs and upgrade of an existing populated database.
- [x] Collect cached EPA individual wastewater records and TCEQ GIS/XLS solid-waste joins using small verified samples; record exclusions.
- [x] Extend shared/permit.ts, importer row schema/adapters, permitsRepo and append migration 4 preserving permits and summaries.
- [x] Combine source files through scripts/prepare-permits.ts, publish category/coverage/exclusion audit, import into an isolated database. Require four nonempty categories and zero sample records.

## Phase 2 — backend
- [x] Extend existing /api/search with validated category/status filters, reuse distance/radius calculations and details route.
- [x] Test all categories, filters, empty results, malformed coordinates/radius, unknown IDs, missing fields and repeated requests.
- [x] Verify real API records before frontend integration.

## Phase 3 — frontend
- [x] Extend results with category/status controls and category counts; retain URL, radius and theme behavior.
- [x] Add category labels and marker symbols alongside existing type colors, accurate cards/details and source-aware action text.
- [x] Update bilingual copy to describe environmental permit coverage without implying complete coverage or measured pollution.

## Phase 4 — verification
- [x] Run check, E2E, secret scan, build and local stress; test real multi-category demo, clickable markers, source links, repeated searches and refresh.
- [x] Independently review, correct defects, document counts/limitations/demo/files and review the diff.
- [ ] Commit and push main safely after the final verification.
