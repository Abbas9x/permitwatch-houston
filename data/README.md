# Data

This folder holds the output of the scraper (`scraper/`), which the rest of Permit Watch reads.

| Path | Committed? | Purpose |
| --- | --- | --- |
| `concrete-plants.json` | Yes | Cleaned dataset the app consumes |
| `demo-addresses.json` | Yes | Demo addresses with nearby plants precomputed, for demo mode |
| `raw/` | No (gitignored) | Raw HTML/PDF downloads kept for debugging and re-parsing |

TypeScript types for this format live in `scraper/src/types.ts`.

## The main rule: never guess

If the source doesn't state a value, or we can't extract it reliably, the field is `null`. Don't fill in a value by inferring it, picking a default or copying it from a similar record. The one exception is `emissions`: it's always an array and is empty (`[]`) when no emissions are listed.

## `concrete-plants.json`

### Top-level object

| Field | Type | Description |
| --- | --- | --- |
| `generatedAt` | string (ISO 8601 UTC timestamp) | When this file was written, e.g. `"2026-10-10T17:30:00Z"` |
| `source` | string | Where the data came from (description or URL of the source) |
| `count` | number | Number of entries in `plants`. Must equal `plants.length` |
| `plants` | `Plant[]` | The plant records |

### `Plant` object

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Stable unique ID for this record. It must not change between scraper runs, so the frontend can use it as a key. See [Building `id`](#building-id) |
| `permitNumber` | string \| null | TCEQ permit or registration number exactly as printed |
| `category` | `"concrete_batch_plant"` | Always this value for now |
| `name` | string \| null | Facility or site name |
| `operator` | string \| null | Company or entity applying for or holding the permit |
| `address` | string \| null | Street address or location description as given |
| `city` | string \| null | City |
| `county` | string \| null | County, e.g. `"Harris"` |
| `zip` | string \| null | 5-digit ZIP code, stored as a string |
| `lat` | number \| null | Latitude in decimal degrees (WGS84) |
| `lng` | number \| null | Longitude in decimal degrees (WGS84) |
| `locationSource` | `"tceq_map_link"` \| `"geocoded"` \| `"manual"` \| null | How `lat`/`lng` were obtained. `null` when there are no coordinates |
| `status` | `"pending"` \| `"existing"` | `pending` is an application still under review. `existing` is an already-permitted plant |
| `permitType` | `"new"` \| `"renewal"` \| `"amendment"` \| null | Type of application. For `existing` plants, the type of the most recent project on the permit. `null` if not stated |
| `dateReceived` | string (`YYYY-MM-DD`) \| null | Date TCEQ received the application. For `existing` plants, the date TCEQ received the most recent project on the permit |
| `commentDeadline` | string (`YYYY-MM-DD`) \| null | Last day for public comment or contested-case hearing requests |
| `productionRate` | string \| null | Production rate as written in the notice, e.g. `"300 cubic yards per hour"` |
| `emissions` | `Emission[]` | Listed emissions. Empty array if none are listed |
| `noticeUrl` | string \| null | URL of the public notice or source document |
| `scrapedAt` | string (ISO 8601 UTC timestamp) | When this record was scraped |
| `notes` | string \| null | Anything noteworthy that doesn't fit another field, such as parsing caveats |

### Building `id`

- If `permitNumber` is not `null`, `id` is `"tceq-"` plus the permit number as printed, with only leading and trailing whitespace removed, e.g. `"tceq-123456"`.
- Otherwise, `id` is `"cbp-"` plus a short hash of the normalized name and address, e.g. `"cbp-3f9a1c2b7e4d"`.

To build the hash:

1. Normalize `name` and `address` separately: lowercase, replace every run of characters that aren't letters or digits with a single space, then trim. Use an empty string for a `null` field.
2. Join the two normalized values with `|` (name first).
3. Take the SHA-256 hex digest of that string (UTF-8) and keep the first 12 characters.

`locationSource` values:

- `tceq_map_link`: coordinates taken from a map link in the TCEQ notice.
- `geocoded`: coordinates found by geocoding `address`.
- `manual`: coordinates entered by hand by a team member.

### `Emission` object

| Field | Type | Description |
| --- | --- | --- |
| `pollutant` | string | Pollutant name as listed, e.g. `"PM10"`, `"PM2.5"` |
| `tonsPerYear` | number | Emission amount in tons per year |

## `demo-addresses.json`

Precomputed results for the pitch demo, so demo mode needs no geocoding or network. Generated from `concrete-plants.json` by `npm run demo` in `scraper/`; the places themselves are listed in `scraper/demo-places.json`. The demo places are public places such as schools and libraries, not homes.

### Top-level object

| Field | Type | Description |
| --- | --- | --- |
| `generatedAt` | string (ISO 8601 UTC timestamp) | When this file was written |
| `plantsGeneratedAt` | string (ISO 8601 UTC timestamp) | `generatedAt` of the `concrete-plants.json` it was computed from |
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
| `locationSource` | `"geocoded"` \| `"manual"` | How `lat`/`lng` were obtained |
| `plantsWithin1Mile` | number | Plants with coordinates within 1 mile |
| `plantsWithin2Miles` | number | Plants with coordinates within 2 miles |
| `plantsWithin3Miles` | number | Plants with coordinates within 3 miles |
| `pendingWithin3Miles` | number | How many of those are `pending` |
| `nearby` | `{ plantId: string, distanceMiles: number }[]` | Plants within `radiusMiles`, nearest first. `plantId` is a `Plant.id` in `concrete-plants.json`; `distanceMiles` is straight-line distance rounded to 2 decimals |

Plants without coordinates can't be measured, so they never appear in `nearby` or the counts.

## Example

```json
{
  "generatedAt": "2026-10-10T17:30:00Z",
  "source": "TCEQ public notices",
  "count": 1,
  "plants": [
    {
      "id": "tceq-123456",
      "permitNumber": "123456",
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
      "permitType": "new",
      "dateReceived": "2026-09-01",
      "commentDeadline": "2026-10-31",
      "productionRate": "300 cubic yards per hour",
      "emissions": [
        { "pollutant": "PM10", "tonsPerYear": 4.2 },
        { "pollutant": "PM2.5", "tonsPerYear": 1.1 }
      ],
      "noticeUrl": "https://example.com/notice.pdf",
      "scrapedAt": "2026-10-10T17:29:12Z",
      "notes": null
    }
  ]
}
```

The values above are made up to show the format. They aren't real permit data.
