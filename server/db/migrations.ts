/**
 * Schema migrations, applied in order and tracked with PRAGMA user_version.
 * Append new migrations; never edit one that has shipped.
 */
export const MIGRATIONS: readonly string[] = [
  /* 1: initial schema */ `
  CREATE TABLE permits (
    id                         TEXT PRIMARY KEY,
    registration_number        TEXT NOT NULL,
    company                    TEXT NOT NULL,
    address                    TEXT NOT NULL,
    city                       TEXT NOT NULL,
    county                     TEXT NOT NULL,
    zip                        TEXT NOT NULL,
    lat                        REAL NOT NULL,
    lng                        REAL NOT NULL,
    location_source            TEXT NOT NULL CHECK (location_source IN ('dataset', 'census_geocoder', 'zip_centroid')),
    permit_type                TEXT NOT NULL CHECK (permit_type IN ('new', 'renewal', 'amendment', 'unknown')),
    max_production_cyd_per_hr  REAL,
    max_hours_per_year         REAL,
    pollutants_json            TEXT NOT NULL DEFAULT '[]',
    controls                   TEXT,
    notice_type                TEXT,
    notice_issuance_date       TEXT,
    comment_deadline           TEXT,
    public_meeting_date        TEXT,
    source_url                 TEXT NOT NULL,
    raw_text                   TEXT NOT NULL DEFAULT '',
    is_sample                  INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
    content_hash               TEXT NOT NULL,
    imported_at                TEXT NOT NULL
  );
  CREATE INDEX idx_permits_lat_lng ON permits (lat, lng);

  CREATE TABLE permit_summaries (
    permit_id     TEXT PRIMARY KEY REFERENCES permits (id) ON DELETE CASCADE,
    content_hash  TEXT NOT NULL,
    summary_json  TEXT NOT NULL,
    generator     TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE import_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT NOT NULL,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    total_rows   INTEGER NOT NULL DEFAULT 0,
    imported     INTEGER NOT NULL DEFAULT 0,
    rejected     INTEGER NOT NULL DEFAULT 0,
    warnings     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE import_issues (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id       INTEGER NOT NULL REFERENCES import_runs (id) ON DELETE CASCADE,
    row_number   INTEGER NOT NULL,
    row_id       TEXT,
    severity     TEXT NOT NULL CHECK (severity IN ('rejected', 'warning')),
    messages_json TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE ai_cache (
    cache_key      TEXT PRIMARY KEY,
    task           TEXT NOT NULL,
    model          TEXT NOT NULL,
    result_json    TEXT NOT NULL,
    input_tokens   INTEGER NOT NULL,
    output_tokens  INTEGER NOT NULL,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE ai_calls (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at              TEXT NOT NULL,
    request_id              TEXT NOT NULL,
    task                    TEXT NOT NULL,
    stage                   TEXT NOT NULL CHECK (stage IN ('cache', 'rules', 'router', 'execute', 'fallback')),
    route_reason            TEXT NOT NULL,
    model                   TEXT,
    input_tokens            INTEGER NOT NULL DEFAULT 0,
    output_tokens           INTEGER NOT NULL DEFAULT 0,
    cost_usd                REAL NOT NULL DEFAULT 0,
    baseline_cost_usd       REAL NOT NULL DEFAULT 0,
    energy_wh_est           REAL NOT NULL DEFAULT 0,
    baseline_energy_wh_est  REAL NOT NULL DEFAULT 0,
    latency_ms              INTEGER NOT NULL DEFAULT 0,
    cache_hit               INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0, 1)),
    fallback                INTEGER NOT NULL DEFAULT 0 CHECK (fallback IN (0, 1)),
    success                 INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1)),
    error_code              TEXT
  );
  CREATE INDEX idx_ai_calls_created ON ai_calls (created_at);

  CREATE TABLE geocode_cache (
    query_key   TEXT PRIMARY KEY,
    lat         REAL NOT NULL,
    lng         REAL NOT NULL,
    label       TEXT NOT NULL,
    source      TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE alert_signups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL,
    zip         TEXT NOT NULL,
    language    TEXT NOT NULL CHECK (language IN ('en', 'es')),
    created_at  TEXT NOT NULL,
    UNIQUE (email, zip)
  );
  `,
  /* 2: retire provider state without changing the shipped version-1 schema. */ `
  DROP TABLE IF EXISTS ai_cache;
  DROP TABLE IF EXISTS ai_calls;
  DELETE FROM permit_summaries WHERE generator <> 'template';
  `,
  /* 3: permit category (concrete batch plant vs. industrial air permit) and facility name. */ `
  ALTER TABLE permits ADD COLUMN category TEXT NOT NULL DEFAULT 'concrete_batch_plant'
    CHECK (category IN ('concrete_batch_plant', 'air_permit'));
  ALTER TABLE permits ADD COLUMN facility_name TEXT;
  `,
  /* 4: expand categories and retain explicit authorization status/source metadata. */ `
  CREATE TEMP TABLE saved_summaries AS SELECT * FROM permit_summaries;
  DROP TABLE permit_summaries;

  CREATE TABLE expanded_permits (
    id                         TEXT PRIMARY KEY,
    registration_number        TEXT NOT NULL,
    company                    TEXT NOT NULL,
    address                    TEXT NOT NULL,
    city                       TEXT NOT NULL,
    county                     TEXT NOT NULL,
    zip                        TEXT NOT NULL,
    lat                        REAL NOT NULL,
    lng                        REAL NOT NULL,
    location_source            TEXT NOT NULL CHECK (location_source IN ('dataset', 'census_geocoder', 'zip_centroid')),
    permit_type                TEXT NOT NULL CHECK (permit_type IN ('new', 'renewal', 'amendment', 'unknown')),
    max_production_cyd_per_hr  REAL,
    max_hours_per_year         REAL,
    pollutants_json            TEXT NOT NULL DEFAULT '[]',
    controls                   TEXT,
    notice_type                TEXT,
    notice_issuance_date       TEXT,
    comment_deadline           TEXT,
    public_meeting_date        TEXT,
    source_url                 TEXT NOT NULL,
    raw_text                   TEXT NOT NULL DEFAULT '',
    is_sample                  INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
    content_hash               TEXT NOT NULL,
    imported_at                TEXT NOT NULL,
    category                   TEXT NOT NULL DEFAULT 'concrete_batch_plant' CHECK (category IN ('concrete_batch_plant','air_permit','wastewater_permit','solid_waste_permit')),
    facility_name              TEXT,
    permit_status              TEXT NOT NULL DEFAULT 'unknown' CHECK (permit_status IN ('pending','effective','issued','administratively_continued','expired','unknown')),
    source_status              TEXT,
    operator_name              TEXT,
    permittee_name             TEXT,
    data_source                TEXT,
    retrieved_at               TEXT,
    application_date           TEXT,
    notice_url                 TEXT,
    location_notes             TEXT
  );

  INSERT INTO expanded_permits (id, registration_number, company, address, city, county, zip, lat, lng, location_source, permit_type, max_production_cyd_per_hr, max_hours_per_year, pollutants_json, controls, notice_type, notice_issuance_date, comment_deadline, public_meeting_date, source_url, raw_text, is_sample, content_hash, imported_at, category, facility_name) SELECT id, registration_number, company, address, city, county, zip, lat, lng, location_source, permit_type, max_production_cyd_per_hr, max_hours_per_year, pollutants_json, controls, notice_type, notice_issuance_date, comment_deadline, public_meeting_date, source_url, raw_text, is_sample, content_hash, imported_at, category, facility_name FROM permits;
  DROP TABLE permits;
  ALTER TABLE expanded_permits RENAME TO permits;
  CREATE INDEX idx_permits_lat_lng ON permits (lat, lng);
  CREATE INDEX idx_permits_category_status ON permits (category, permit_status);
  CREATE TABLE permit_summaries (
    permit_id     TEXT PRIMARY KEY REFERENCES permits (id) ON DELETE CASCADE,
    content_hash  TEXT NOT NULL,
    summary_json  TEXT NOT NULL,
    generator     TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  INSERT INTO permit_summaries SELECT * FROM saved_summaries;
  DROP TABLE saved_summaries;
  `,
];
