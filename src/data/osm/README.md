# OpenStreetMap walk targets (round 3, brief 7.3)

Static points behind "≈ 5 דק׳ הליכה לים" and "≈ 5 דק׳ הליכה למעליות". The site reads these files
only (`src/lib/geo/walk-targets.ts`, server side): there are **no live map calls at runtime**.

| File | What | Points |
|---|---|---|
| `sea.json` | `beaches`: sea beaches (`natural=beach`, nodes, ways and multipolygons, outer rings) sampled every ~50 m; `coastline`: the sea coast (`natural=coastline`) sampled every ~50 m, used only where no beach is within 30 minutes | 1,697 beach + 1,330 coastline |
| `ski-lifts.json` | `stations`: the bottom station of every ski lift (and any middle station) | 43 (46 lifts) |

Each point is `[lat, lng]`, rounded to 5 decimals (about 1 m). Points closer than 25 m to one
already kept were dropped. Total size: about 62 KB.

## Source and licence

- **Data © OpenStreetMap contributors**, available under the
  [Open Database License (ODbL) 1.0](https://www.openstreetmap.org/copyright). The site credits it
  on the photo and data credits page (`/photo-credits`). These files are a derived database and
  stay under the ODbL: keep this notice with them.
- **Extracted on 7 November 2026** (OSM data as of `2026-11-07T04:43:17Z`, also recorded in each
  file as `extractedOn` / `osmDataTimestamp`), through the Overpass API mirror
  `https://maps.mail.ru/osm/tools/overpass/api/interpreter`.
- Made by `scripts/build-osm-walk-targets.mjs` (the one-off extractor; the queries are also stored
  in each file under `query`).

## Areas

Boxes are `[south, west, north, east]`.

- **Sea:** `[41.50, 41.50, 41.93, 41.86]` — the Adjara coast from Sarpi (Turkish border) through
  Kvariati, Gonio, Batumi, Makhinjauri, Chakvi and Tsikhisdziri to the north of Kobuleti. The site
  gives a sea walking time only to listings whose city is Batumi or Kobuleti
  (`SEA_TOWNS` in `src/lib/geo/walk-towns.ts`; Gonio and Makhinjauri are Batumi neighborhoods).
- **Ski lifts:** Gudauri `[42.42, 44.40, 42.51, 44.54]`, Bakuriani `[41.69, 43.44, 41.79, 43.58]`
  (Didveli, Kokhta, Mitarbi, the town lifts), Mestia `[42.95, 42.60, 43.11, 42.98]` (Hatsvali and
  Tetnuldi). Lift types: chair_lift, gondola, cable_car, mixed_lift, drag_lift, t-bar, j-bar,
  platter, rope_tow, magic_carpet. Disused, abandoned, proposed and construction lifts are left out.

## Queries

```
[out:json][timeout:180];
nwr["natural"="beach"](41.5000,41.5000,41.9300,41.8600);
out geom;
```

```
[out:json][timeout:180];
way["natural"="coastline"](41.5000,41.5000,41.9300,41.8600);
out geom;
```

```
[out:json][timeout:180];
(
  way["aerialway"~"^(chair_lift|gondola|cable_car|mixed_lift|drag_lift|t-bar|j-bar|platter|rope_tow|magic_carpet)$"](42.4200,44.4000,42.5100,44.5400);
  way["aerialway"~"^(chair_lift|gondola|cable_car|mixed_lift|drag_lift|t-bar|j-bar|platter|rope_tow|magic_carpet)$"](41.6900,43.4400,41.7900,43.5800);
  way["aerialway"~"^(chair_lift|gondola|cable_car|mixed_lift|drag_lift|t-bar|j-bar|platter|rope_tow|magic_carpet)$"](42.9500,42.6000,43.1100,42.9800);
)->.lifts;
.lifts out geom;
node(w.lifts)->.liftNodes;
.liftNodes out;
```

## Rules applied by the extractor

- Beaches farther than 300 m from the coastline (river or lake beaches) are left out (none were,
  in this extract).
- A lift's bottom is its first node (OSM draws aerialways uphill); when both ends carry an `ele`
  tag, the lower end is the bottom. Middle nodes tagged `aerialway=station` are kept too.
- The script refuses to write anything when a query fails after its retries, or when an area comes
  back empty (no lifts in a ski town, too few beach points): never invent coordinates.

## Refreshing

```
NODE_USE_ENV_PROXY=1 node scripts/build-osm-walk-targets.mjs     # fetch (slow mirror: minutes) + write
node scripts/build-osm-walk-targets.mjs --offline --raw-dir <dir> # rebuild from cached answers
npx tsx --require ./scripts/server-script.cjs scripts/backfill-walk-minutes.ts --apply
```

After a refresh, run the backfill so every listing's `seaWalkMinutes` / `liftWalkMinutes` uses the
new points, and update the date above.
