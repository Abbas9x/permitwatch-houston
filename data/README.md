# Data

This folder holds the output of the scraper (`scraper/`), which the rest of Permit Watch reads. It covers sites that pollute or can lower nearby home values in the Houston area: TCEQ Region 12, which is Austin, Brazoria, Chambers, Colorado, Fort Bend, Galveston, Harris, Liberty, Matagorda, Montgomery, Walker, Waller and Wharton counties.

| Path | Committed? | Purpose |
| --- | --- | --- |
| `sites.json` | Yes | Every mapped site, by category. This is the dataset the app consumes |
| `demo-addresses.json` | Yes | Demo addresses with nearby sites precomputed, for demo mode |
| `raw/` | No (gitignored) | Raw downloads kept for debugging and re-parsing |

TypeScript types for these formats live in `scraper/src/types.ts`.

## The main rules

- **Never guess.** If the source doesn't state a value, or we can't extract it reliably, the field is `null`. Don't fill in a value by inferring it, picking a default or copying it from a similar record.
- **Real locations only.** Every site has coordinates from the source itself, a TCEQ map link, or a geocoder match on its street address. Sites we can't place reliably are left out, never placed approximately.

## `sites.json`

### Top-level object

| Field | Type | Description |
| --- | --- | --- |
| `generatedAt` | string (ISO 8601 UTC timestamp) | When this file was written, e.g. `"2026-10-10T17:30:00Z"` |
| `count` | number | Number of entries in `sites`. Must equal `sites.length` |
| `categories` | `{ id, label, count }[]` | Every category, with a display label and how many sites it has (can be `0`) |
| `sites` | `Site[]` | The site records, sorted by category, then name |

### `Site` object

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Stable unique ID. It must not change between scraper runs, so the frontend can use it as a key. See [Building `id`](#building-id) |
| `category` | string | One of the [categories](#categories) |
| `name` | string \| null | Facility or site name |
| `operator` | string \| null | Company or entity that operates, owns or applied for it |
| `address` | string \| null | Street address or location description as given |
| `city` | string \| null | City |
| `county` | string | County name, one of the 13 above, e.g. `"Harris"`, `"Fort Bend"` |
| `zip` | string \| null | 5-digit ZIP code, stored as a string |
| `lat` | number | Latitude in decimal degrees (WGS84) |
| `lng` | number | Longitude in decimal degrees (WGS84) |
| `locationSource` | `"tceq_map_link"` \| `"geocoded"` \| `"source_data"` | How `lat`/`lng` were obtained (see below) |
| `status` | `"pending"` \| `"active"` \| `"closed"` | `pending`: an application still under review, so residents can still comment. `active`: permitted or operating. `closed`: no longer operating but still relevant, such as a closed landfill |
| `sourceUrl` | string \| null | Where a person can read more: the public notice or the source record |
| `source` | string | Which dataset the record came from, e.g. `"TCEQ NSR Air Permits search"` |
| `scrapedAt` | string (ISO 8601 UTC timestamp) | When this record was scraped |
| `notes` | string \| null | Anything noteworthy that doesn't fit another field, such as parsing caveats |
| `details` | object | Category-specific facts; see each category below. Fields inside follow the same never-guess rule |

`locationSource` values:

- `tceq_map_link`: coordinates taken from a map link in a TCEQ notice.
- `geocoded`: coordinates found by geocoding `address` with the U.S. Census geocoder or, when that fails, OpenStreetMap's Nominatim. Records placed by Nominatim say so in `notes`. OpenStreetMap data requires credit, so the map should show "© OpenStreetMap contributors".
- `source_data`: coordinates published by the source dataset itself.

### Building `id`

`id` is a short source prefix plus the source's own record ID, e.g. `"tceq-123456"` for a TCEQ permit. Each category below says which prefix and record ID it uses. IDs only contain the trimmed record ID as published.

When a source has no record ID, `id` is a category prefix plus a short hash of the normalized name and address, e.g. `"cbp-3f9a1c2b7e4d"`:

1. Normalize `name` and `address` separately: lowercase, replace every run of characters that aren't letters or digits with a single space, then trim. Use an empty string for a `null` field.
2. Join the two normalized values with `|` (name first).
3. Take the SHA-256 hex digest of that string (UTF-8) and keep the first 12 characters.

### Categories

#### `concrete_batch_plant`

Concrete batch plants with a pending TCEQ application (from TCEQ's pending permits list and public notices) or an effective TCEQ standard permit (from TCEQ's NSR Air Permits search).

- `id`: `"tceq-"` plus the permit number, or `"cbp-"` plus a hash without one.
- `status`: `pending` or `active`.

| `details` field | Type | Description |
| --- | --- | --- |
| `permitNumber` | string \| null | TCEQ permit or registration number exactly as printed |
| `permitType` | `"new"` \| `"renewal"` \| `"amendment"` \| null | Type of application. For `active` plants, the type of the most recent project on the permit |
| `dateReceived` | string (`YYYY-MM-DD`) \| null | Date TCEQ received the application. For `active` plants, the most recent project on the permit |
| `commentDeadline` | string (`YYYY-MM-DD`) \| null | Last day for public comment. Notices usually only say "15 days after the final newspaper notice", so this is almost always `null` |
| `productionRate` | string \| null | Production rate as written in the notice, e.g. `"300 cubic yards per hour"` |

#### `pending_air_permit`

Every other kind of pending TCEQ air permit in the area (refineries, chemical plants, terminals...), from TCEQ's pending permits list and public notices. Only permits whose notice has a map link are included, so `locationSource` is always `tceq_map_link`. `status` is always `pending`. `id`: `"tceq-"` plus the permit number.

| `details` field | Type | Description |
| --- | --- | --- |
| `permitNumber` | string | TCEQ permit number as printed |
| `permitSection` | string | Section of TCEQ's list, e.g. `"NSR Case-by-Case Air Permits"` |
| `permitType` | `"new"` \| `"renewal"` \| `"amendment"` \| null | Type of application, from the notice |
| `dateReceived` | string (`YYYY-MM-DD`) \| null | Date TCEQ received the application |
| `applicationStage` | string \| null | e.g. `"Technically Complete Application"` |
| `airContaminants` | string \| null | Pollutants the notice lists, as written |

#### `industrial_facility`

Facilities that report toxic chemical releases to EPA's Toxics Release Inventory: refineries, chemical plants and other large industry. `status` is `active` (they reported for the year). `id`: `"tri-"` plus the TRI facility ID.

| `details` field | Type | Description |
| --- | --- | --- |
| `triFacilityId` | string | EPA TRI facility ID |
| `industrySector` | string \| null | e.g. `"Chemicals"`, `"Petroleum"` |
| `reportingYear` | number | Year of the TRI data, e.g. `2024` |
| `airReleasesLb` | number | Pounds of TRI chemicals released to air that year (fugitive plus stack) |
| `chemicalsReported` | number | Number of TRI chemicals reported |
| `carcinogensReleasedToAir` | string[] | Names of reported carcinogens with air releases above 0 |

#### `power_plant`

Operating power plants, from the U.S. Energy Information Administration. `status` is `active`. `id`: `"eia-"` plus the EIA plant code.

| `details` field | Type | Description |
| --- | --- | --- |
| `eiaPlantCode` | string | EIA plant code |
| `primarySource` | string \| null | Main energy source, e.g. `"natural gas"`, `"solar"` |
| `technology` | string \| null | Generating technology |
| `capacityMw` | number \| null | Total capacity in megawatts |
| `dataPeriod` | string \| null | EIA data period, e.g. `"202502"` |

#### `superfund_site`

Federal Superfund sites (EPA National Priorities List) and state Superfund sites (TCEQ). `status`: `closed` for sites deleted from the NPL (cleanup finished), otherwise `active`. `id`: `"epa-"` plus the EPA site ID for federal sites, or `"tceq-sf-"` plus TCEQ's site ID for state-only sites.

| `details` field | Type | Description |
| --- | --- | --- |
| `program` | `"federal"` \| `"state"` | Federal (on the NPL) or state Superfund |
| `epaId` | string \| null | EPA site ID |
| `nplStatus` | string \| null | NPL status, e.g. `"NPL Site"`, `"Deleted NPL Site"` |
| `hazardScore` | number \| null | EPA Hazard Ranking System score (sites above 28.5 qualify for the NPL) |
| `listingDate` | string (`YYYY-MM-DD`) \| null | Date added to the NPL |
| `deletionDate` | string (`YYYY-MM-DD`) \| null | Date deleted from the NPL |

#### `hazardous_waste_facility`

Large-quantity hazardous waste generators and hazardous waste treatment, storage or disposal facilities, from EPA ECHO (RCRA). Locations less precise than 1 km are left out. `status` is `active`. `id`: `"rcra-"` plus the EPA ID.

| `details` field | Type | Description |
| --- | --- | --- |
| `epaId` | string | EPA RCRA ID |
| `universe` | string \| null | RCRA category, e.g. `"LQG"`, `"TSDF"` |
| `complianceStatus` | string \| null | Current compliance status as EPA states it |

#### `landfill`

Active municipal solid waste landfills permitted by TCEQ. `status` is `active`. `id`: `"tceq-msw-"` plus the permit number.

| `details` field | Type | Description |
| --- | --- | --- |
| `permitNumber` | string \| null | TCEQ permit number |
| `landfillType` | string \| null | e.g. `"municipal solid waste"`, `"construction, demolition and brush"` |

#### `transfer_station`

Active municipal solid waste transfer stations (TCEQ). `status` is `active`. `id`: `"tceq-msw-"` plus the permit number.

| `details` field | Type | Description |
| --- | --- | --- |
| `permitNumber` | string \| null | TCEQ permit or registration number |
| `facilityType` | string \| null | Facility type as TCEQ lists it |

#### `wastewater_plant`

Sewage treatment plants with an active individual wastewater permit, from EPA ECHO (Clean Water Act, SIC 4952). Locations less precise than 1 km are left out. `status` is `active`. `id`: `"npdes-"` plus the permit ID.

| `details` field | Type | Description |
| --- | --- | --- |
| `npdesId` | string | NPDES permit ID (starts with `TX0`) |
| `designFlowMgd` | number \| null | Design flow in million gallons per day |
| `actualFlowMgd` | number \| null | Actual average flow in million gallons per day |
| `permitStatus` | string \| null | e.g. `"Effective"`, `"Admin Continued"` |
| `major` | boolean | Whether EPA classes it as a major discharger |

#### `scrap_yard`

Scrap metal, salvage and recycling businesses registered with EPA (ECHO, SIC 5093, kept when the name says scrap, metal, salvage, recycling and similar). Locations less precise than 1 km are left out. `status` is `active`. `id`: `"frs-"` plus the EPA registry ID.

| `details` field | Type | Description |
| --- | --- | --- |
| `frsId` | string | EPA Facility Registry Service ID |
| `sicCodes` | string \| null | SIC codes EPA lists for the business |

#### `rail_yard`

Rail yards and rail intermodal (container) terminals, from U.S. DOT's National Transportation Atlas Database. For yards, the point is on the yard's tracks near their middle. `status` is `active`. `id`: `"yard-"` or `"intermodal-"` plus a hash of name and location.

| `details` field | Type | Description |
| --- | --- | --- |
| `kind` | `"rail yard"` \| `"intermodal terminal"` | Which kind |
| `railroad` | string \| null | Railroad code, e.g. `"UP"`, `"BNSF"` |

#### `fuel_terminal`

Bulk petroleum and chemical terminals (tank farms), from U.S. DOT's National Transportation Atlas Database (HIFLD/EIA data, validated 2021). `status` is `active`. `id`: `"hifld-terminal-"` plus the terminal ID.

| `details` field | Type | Description |
| --- | --- | --- |
| `terminalId` | string \| null | Terminal ID |
| `capacityBarrels` | number \| null | Storage capacity in barrels |
| `products` | string[] | Products handled, e.g. `["crude oil", "refined products"]` |
| `validatedDate` | string \| null | When the record was last validated, as written |

#### `disposal_well`

Injection/disposal wells and storage wells (not plugged), from the Texas Railroad Commission. Ordinary oil and gas wells are left out. `status` is `active`. `id`: `"rrc-"` plus the API well number.

| `details` field | Type | Description |
| --- | --- | --- |
| `api` | string | API well number |
| `wellType` | string \| null | RRC well type, e.g. `"Injection / Disposal from Oil/Gas"` |
| `locationReliability` | number \| null | RRC's location reliability code |

#### `construction_project`

Large construction nearby (dust, trucks, noise): TxDOT road projects in the construction stage (all 13 counties), and Harris County permits for site development, mass grading and logistics warehouses issued in the last 12 months (unincorporated Harris County only). For road projects the point is on the project's road near its middle. `status` is `active`. `id`: `"txdot-"` plus the control-section-job number, or `"hcpid-"` plus the Harris County project number.

| `details` field | Type | Description |
| --- | --- | --- |
| `projectSource` | `"TxDOT"` \| `"Harris County"` | Which agency |
| `projectId` | string | The agency's project number |
| `typeOfWork` | string \| null | e.g. `"Widen Road - Add Lanes"`, `"Site Development"` |
| `estimatedCost` | number \| null | Estimated construction cost in dollars (TxDOT only) |
| `startDate` | string (`YYYY-MM-DD`) \| null | Work start (TxDOT) or permit issue date (Harris County) |
| `estimatedCompletion` | string (`YYYY-MM-DD`) \| null | Estimated completion (TxDOT only) |
| `percentComplete` | number \| null | Percent complete (TxDOT only; can be out of date) |
| `lastUpdated` | string (`YYYY-MM-DD`) \| null | When TxDOT last updated the project (TxDOT only) |
| `permit` | string \| null | Permit name (Harris County only) |
| `projectStatus` | string \| null | Project status (Harris County only) |

#### `busy_road`

TxDOT traffic count stations on roads carrying at least 100,000 vehicles a day. Each station is a point on the road; living close to roads this busy means more traffic pollution. `status` is `active`. `id`: `"txdot-aadt-"` plus the station ID.

| `details` field | Type | Description |
| --- | --- | --- |
| `stationId` | string | TxDOT count station ID |
| `road` | string \| null | Road, e.g. `"IH 10"` |
| `vehiclesPerDay` | number \| null | Annual average daily traffic |
| `year` | number \| null | Year of the count |

## `demo-addresses.json`

Precomputed results for the pitch demo, so demo mode needs no geocoding or network. Generated from `sites.json` by `npm run demo` in `scraper/`; the places themselves are listed in `scraper/demo-places.json`. The demo places are public places such as schools and libraries, not homes.

### Top-level object

| Field | Type | Description |
| --- | --- | --- |
| `generatedAt` | string (ISO 8601 UTC timestamp) | When this file was written |
| `sitesGeneratedAt` | string (ISO 8601 UTC timestamp) | `generatedAt` of the `sites.json` it was computed from |
| `radiusMiles` | number | Search radius for `nearby`, currently `3` |
| `addresses` | `DemoAddress[]` | The demo addresses |

### `DemoAddress` object

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Stable ID, e.g. `"frost-elementary"` |
| `label` | string | Display name, e.g. `"Frost Elementary School"` |
| `address` | string | Street address, as typed into the search box |
| `lat` | number | Latitude in decimal degrees (WGS84) |
| `lng` | number | Longitude in decimal degrees (WGS84) |
| `locationSource` | `"geocoded"` | How `lat`/`lng` were obtained |
| `sitesWithin1Mile` | number | Sites within 1 mile |
| `sitesWithin2Miles` | number | Sites within 2 miles |
| `sitesWithin3Miles` | number | Sites within 3 miles |
| `pendingWithin3Miles` | number | How many of those are `pending` |
| `within3MilesByCategory` | object | Sites within 3 miles counted by category, e.g. `{ "concrete_batch_plant": 12 }`. Categories with none are left out |
| `nearby` | `{ siteId, category, distanceMiles }[]` | Sites within `radiusMiles`, nearest first. `siteId` is a `Site.id` in `sites.json`; `distanceMiles` is straight-line distance rounded to 2 decimals |

## Example

```json
{
  "generatedAt": "2026-10-10T17:30:00Z",
  "count": 1,
  "categories": [{ "id": "concrete_batch_plant", "label": "Concrete batch plant", "count": 1 }],
  "sites": [
    {
      "id": "tceq-123456",
      "category": "concrete_batch_plant",
      "name": "Example Concrete Plant",
      "operator": "Example Materials LLC",
      "address": "1234 Example Rd",
      "city": "Houston",
      "county": "Harris",
      "zip": "77001",
      "lat": 29.7604,
      "lng": -95.3698,
      "locationSource": "tceq_map_link",
      "status": "pending",
      "sourceUrl": "https://example.com/notice.pdf",
      "source": "TCEQ pending air permit applications and public notices",
      "scrapedAt": "2026-10-10T17:29:12Z",
      "notes": null,
      "details": {
        "permitNumber": "123456",
        "permitType": "new",
        "dateReceived": "2026-09-01",
        "commentDeadline": null,
        "productionRate": "300 cubic yards per hour"
      }
    }
  ]
}
```

The values above are made up to show the format. They aren't real permit data.
