# Lunar Landing Site Navigator

An exploratory NASA Space Apps 2026 project for lunar south pole sunlight and Earth-center visibility. Next.js / React / TypeScript / Tailwind / Recharts frontend, FastAPI / NumPy / Pandas / Rasterio / PyProj / NAIF SPICE backend, SQLite calculation cache.

**Working:** real local NASA/JPL DE421 Sun and Earth ephemerides, selectable lunar coordinates, UTC mission windows, time animation, visibility timelines, two/three-site weighted comparison, blackout/darkness intervals, CSV/JSON export, print-to-PDF report, and three reproducible real-ephemeris examples. No API key or live NASA query is required.

**Scientific status:** a demonstrator, not a flight-certified landing assessment. No LOLA DEM is bundled. Until one is configured, all percentages and rankings are explicitly **reference-sphere geometry**, and terrain obstructions, elevation, slope and hazards are unknown. The default map is an interactive stereographic coordinate graticule, not lunar imagery. Terrain ray tracing and elevation heatmaps work with a compatible local raster, but have only been tested with analytic synthetic test fixtures here. High-precision lunar frame alignment and independent Horizons angular validation remain outstanding.

## Run locally

Requirements: Python 3.12, Node.js 22 or newer, npm. Linux x86_64 is the validated platform.

```bash
./scripts/install.sh
```

In separate terminals, from the repository root:

```bash
.venv/bin/uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

```bash
npm --prefix frontend run start
```

The frontend listens on port 3000 and forwards `/api/*` to the backend on port 8000. For frontend hot reload, use `npm --prefix frontend run dev` instead of `start`. FastAPI's interactive documentation is on backend path `/docs`. Local requests can check readiness:

```bash
curl --fail http://127.0.0.1:8000/api/health
curl --fail http://127.0.0.1:3000/api/sites
```

Use the existing checkout: cloud tasks are already isolated; do not create a worktree unless requested. Installations and build outputs survive snapshots; server processes do not. Restart both servers in new tasks.

### Docker Compose

```bash
docker compose up --build -d
```

Only frontend port 3000 is published. The backend stays on the Compose network; its SQLite cache uses a named volume. Both images use non-root runtime users and health checks. For the managed cloud environment, use the supplied CA overlay:

```bash
docker compose -f compose.yaml -f compose.cloud.yaml up --build -d
```

This mounts the trusted system CA bundle as a build secret, preserves proxy routing, and keeps TLS verification on. It does not embed proxy certificates or credentials in image layers. Standard local builds use default certificate trust. An internet-facing deployment additionally needs a hosting target, TLS ingress, appropriate request limits and operational monitoring. No public deployment has been provisioned by this repository.

### Environment configuration

See `.env.example`. Variables must be exported into the respective process; an example file is not loaded automatically. `LOLA_MANIFEST` and `CACHE_PATH` configure the backend. `BACKEND_URL` configures Next.js API rewrites **at build time**, so rebuild after changing it. Docker builds default to `http://backend:8000`; native builds default to `http://127.0.0.1:8000`. No frontend secrets are used.

## Scientific model

- NASA/JPL **DE421**, distributed in pinned `skyfield-data==7.0.0`, supplies actual Sun, Earth and Moon SPK positions. It covers approximately 1900–2053; the API conservatively accepts 1901–2052. The pinned distribution and SHA-256 checks make startup fail if any kernel changes unexpectedly.
- `naif0012.tls` converts timezone-aware UTC timestamps to SPICE ephemeris time. Its final leap second is 2017-01-01; future leap seconds are not predicted.
- `pck00010.tpc` supplies the **IAU_MOON** orientation and 1737.4 km reference radius. This is an IAU 2009 analytic, low-precision lunar orientation, **not** the high-precision DE421 lunar principal-axis / mean-Earth frame used for precision cartography. Do not assume raster frames are interchangeable near the polar horizon. A future precision upgrade needs matching lunar binary PCK, frame kernel and DEM frame alignment, followed by independent angular validation.
- Coordinates are planetocentric latitude, east-positive longitude in [-180,180]. A spherical radial observer is subtracted from Moon-centered body vectors, then projected onto orthonormal east/north/up axes. Azimuth is clockwise from north, elevation is above the local tangent plane. SPICE aberration correction is `NONE`: geometric simultaneous body centers, no light time, refraction or stellar aberration.
- Visibility is a **strict** elevation-above-threshold test. Sun uses the terrain horizon when complete, otherwise the zero-degree reference plane. Earth adds user communication clearance to that threshold. A configured but invalid/partial DEM never becomes a flat terrain profile: results stay explicitly in reference-sphere mode.
- Availability and windows use left-endpoint quadrature on [start,end), weighted by actual elapsed interval duration. The endpoint is included as a plotted sample but contributes no interval. A shortened final interval is weighted correctly. Transitions and interval lengths are approximate, with up to one cadence of boundary uncertainty.
- The score is the normalized weighted average of sunlight percentage, Earth-center visibility percentage and simultaneous percentage. All sites share mission dates/cadence/clearance. Mixed reference-sphere and terrain-screened comparisons are rejected. Slope and hazards are not included in the score.
- Sun center visibility is not solar power production. Earth center visibility is not a guaranteed radio link. Disk extent, antenna height/pattern, link budget, eclipses, spacecraft assets, rocks and subpixel roughness are not modeled. Small score differences may be meaningless.

The three default points are **exploratory geographic references**, not official NASA candidate touchdown points or surveyed safe locations. Coordinates are editable. Precomputed examples for all three use 1–8 October 2026 UTC with 60-minute intervals and zero communication clearance; they contain real ephemeris computations and explicit missing terrain, never invented elevations or availability. Generate them using `.venv/bin/python scripts/prepare_data.py`. The offline UI loads the selected predefined site’s example; all three are also available as JSON in `data/examples/` and `frontend/public/examples/`.

## Configure real LOLA terrain

1. Obtain a suitable elevation product from [NASA PDS LOLA](https://pds-geosciences.wustl.edu/missions/lro/lola.htm). Read that product's label, vertical scale/offset, nodata, spatial resolution, projection and lunar frame. Do not treat imagery as a DEM or assume an undocumented download API.
2. Convert it to a correctly georeferenced single-band GeoTIFF if needed, preserving source metadata. Pixel values (after stored Rasterio scale/offset) must be **metres relative to radius 1,737,400 m**. Raster CRS must use that lunar sphere; Earth CRSs are rejected. Kilometre radius products must be converted explicitly before use. Resolve the product's cartographic frame relative to IAU_MOON before interpreting obstruction metrics.
3. Store the raster outside tracked source, e.g. ignored `data/terrain/`, and create a manifest:

```json
{
  "path": "south-pole.tif",
  "source_url": "https://YOUR-ACTUAL-PDS-PRODUCT-URL",
  "product_id": "REPLACE-WITH-VERIFIED-PRODUCT-ID",
  "sha256": "REPLACE-WITH-SHA256-OF-YOUR-GEOTIFF",
  "units": "m",
  "vertical_reference": "radius_minus_1737400m"
}
```

These are format placeholders, not a claimed dataset URL. Relative raster paths resolve against the manifest directory. Export `LOLA_MANIFEST=/absolute/path/to/manifest.json` before starting the backend. In Docker, bind-mount that directory read-only and set the corresponding container path through a local Compose override.

The backend verifies SHA-256, lunar radius, CRS, coverage and nodata. It samples 72 azimuths (5° spacing) to 20 km, using nearest-neighbor samples at max(50 m, physical pixel spacing) and exact spherical curvature geometry. Accepted pixel spacing is 1–2000 m. Full coverage of every ray is required for terrain-screened visibility. Slope uses central elevation differences at the same physical step. The displayed 21×21 elevation grid spans 10×10 km. Resolution, sample spacing and source metadata are returned. Narrow obstacles, inter-ray peaks and beyond-20-km obstruction are unresolved. A matching radius alone does not validate a DEM's lunar reference frame or provenance; those need human scientific review.

## Data sources and access

| Source | Implemented use / access status |
| --- | --- |
| NASA/JPL DE421 | Local SPICE SPK, pinned PyPI data package, SHA-256 verified; no runtime network |
| NAIF SPICE | Actual CSPICE evaluator through SpiceyPy; local text PCK and leap-second kernels |
| JPL Horizons | Live integration not used: `ssd.jpl.nasa.gov` was denied by this cloud network policy. No invented API response substitutes it. |
| LOLA / NASA PDS | Optional local georeferenced DEM ingestion; no measured raster downloaded or validated in this environment |
| NASA Moon Trek | External mapping reference link; no undocumented tile API assumed |
| LROC QuickMap | External imagery/reference link; no public API presumed |

The two bundled text kernels came from `AndrewAnnex/SpiceyPyTestKernels` commit `07c73a7e978e4e7111659a3fb24a012a44c9e8ba`, whose README identifies NAIF source URLs and published checksums. Full SHA-256 provenance and upstream URLs are in `data/kernels/manifest.json`; original NAIF kernel comments are retained. The DE421 kernel remains in the installed Python package rather than being duplicated in Git. Scientific data attribution does not imply NASA endorsement.

## API

All computations are POSTed with structured Pydantic validation. Coordinates and mission date/time errors return 422. Missing site IDs return 404. Scientific runtime failures return 503 with no substitute data. FastAPI publishes an OpenAPI schema and `/docs`.

| Method | Endpoint | Request / response |
| --- | --- | --- |
| GET | `/api/health` | Kernel readiness and terrain configuration presence |
| GET | `/api/sites` | Three geographic reference sites |
| GET | `/api/sites/{id}` | One reference site |
| POST | `/api/terrain` | Location → raster status, elevation, slope, horizon, grid |
| POST | `/api/ephemeris` | Mission → geometric Sun/Earth azimuth/elevation samples |
| POST | `/api/analyze` | Mission → series, metrics, windows, terrain, provenance |
| POST | `/api/compare` | Mission, 2–3 locations, weights → explained ranking |
| POST | `/api/export` | Mission and `format` (`csv` / `json`) → attachment |

Example mission:

```json
{"name":"Shackleton vicinity","latitude":-89.54,"longitude":0,"start":"2026-10-01T00:00:00Z","end":"2026-10-08T00:00:00Z","interval_minutes":60,"clearance_deg":0}
```

Ranges: >0 through 31 days, 5–1440-minute cadence, ≤2000 intervals, 0–20° communication clearance. SQLite keys include mission, algorithm, kernel checksums and terrain results/provenance. Database writes are parameterized and serialized; CSPICE access is serialized because of its global state. No external queries occur per timestamp. Health confirms ephemeris readiness, not scientific validity of a configured DEM.

## Validation

```bash
.venv/bin/pytest backend/tests -q
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
# Install the test browser on an unrestricted development machine:
cd frontend
npx playwright install --with-deps chromium
npm test
```

If Chromium is already installed (as in this cloud), use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm --prefix frontend test` from the root. Playwright starts the real backend and production frontend, tests the actual API, animation, comparison, exports, invalidation, error reporting, mobile layout and offline example. Browser downloads from `cdn.playwright.dev` are blocked in this environment; the system Chromium avoids that dependency.

Backend tests include synthetic analytic fixtures for scientific logic; these are test-only and never used as real analysis results. DE421 vectors are checked at 2000/2026/2050 epochs against an independent Skyfield SPK evaluator, and NAIF text kernels against upstream published checksums and lunar radii. This checks NASA data reading and vector chains; it is **not** independent Horizons/LOLA or flight-data validation of the complete angular/terrain model. See `VALIDATION.md` for recorded outcomes and unresolved work.

## Structure

```text
backend/app/       validation, API, cache, SPICE, terrain, site references
backend/tests/     unit, API, raster, independent kernel-reader validation
frontend/app/      responsive dashboard, map, charts, comparison, report
frontend/tests/    browser integration tests against real services
data/kernels/     NAIF text kernels and checksum/source manifest
data/examples/    three computed real-ephemeris examples
scripts/          repeatable install and example generation
compose*.yaml     containers and cloud certificate overlay
```

## Remaining work before mission-quality release

Install and scientifically validate a real high-resolution LOLA product and its reference frame; add a matching precision lunar binary PCK/frame set; validate angular and obstruction output against independent NASA references; add verified lunar imagery/terrain map services where documented; assess hazards and eclipse/disk effects if required. Public hosting/domain provisioning is not complete. The project currently delivers the working geometric simulator/comparator and a tested local terrain integration path, rather than claiming the full mission-grade definition of done.

## 3D models, lunar news and mission planning

Open **3D observatory** in the navigation to inspect the user-supplied Earth/Sun GLBs. They are loaded on demand, framed independently and disposed when switching views. GLB and USDZ download links preserve the uploaded formats. The computed-local-sky view maps the selected SPICE sample's azimuth/elevation onto a local tangent frame (east +X, zenith +Y, north −Z). Both body centers are placed at the same display distance: it is not an orbital system or rocket flight animation. The flat grid represents the reference plane, not measured terrain. No directions are shown before a computed sample exists.

The uploaded `Moon_NASA_LRO_23k_Topo.usdz` exceeded the environment's 32 MiB file-transfer limit and **is not bundled**. The default Moon is a labeled reference sphere with its south pole marked. A local file picker accepts self-contained GLB or supported USDZ variants up to 100 MB; files remain in the browser. Unsupported variants show an import error and reference fallback. Importing a model does not verify its authorship, lunar frame, scale or relief, and it never replaces LOLA elevation measurements. Uploaded asset hashes and attribution status are recorded in `frontend/public/models/manifest.json`; original asset authorship/licensing has not been independently established.

**Lunar dispatch** is a news sidebar on desktop and moves below the workspace on smaller screens. It queries backend `/api/news`, which reads NASA's root RSS feed and Artemis blog feed, filters lunar-related entries and sorts by published date. Users can read the feed excerpt in the sidebar or follow the original NASA article. This is an excerpt reader, not full-article scraping or generated news. Feeds may be incomplete, empty, redirected, blocked or unavailable; the UI discloses those conditions. The current cloud blocked `www.nasa.gov` and `blogs.nasa.gov`, so live NASA RSS delivery has **not** been verified here. Test headlines exist only in test fixtures, never runtime fallback data.

RSS retrieval is limited to two fixed server-side URLs, 2 MB per response and finite timeouts. XML entities are rejected. Links must be HTTPS on NASA-owned hostnames. SQLite caches successful responses for 15 minutes; failures retry no sooner than 5 minutes. Previous real source data can be shown for up to 24 hours with a stale label and its original retrieval timestamp. With no cache, an unavailable state has no substitute articles. The sidebar refreshes every 15 minutes; no API key is required.

**Mission planner** adds a user-input worksheet:

- Minimum circular platform diameter = lander contact-footprint diameter + 2 × clearance. Area = π × (diameter / 2)². This does not assess terrain or structural loading.
- Panel count = ceil(required power × (1 + margin / 100) / entered usable output per panel). This is not a solar generation/storage prediction; illumination, temperature, incidence, degradation and battery sizing remain outside the model.
- ETA = entered Earth launch time + entered transit duration ± entered tolerance. No universal three-day transit or rocket performance is assumed.
- Browser-local saved plans (maximum 20) preserve mission dates, coordinates, sampling settings, launch area and vehicle inputs. Restoring invalidates analysis and requires a new calculation. Plans are not cloud-synced and disappear if browser storage is cleared. The worksheet can be exported as JSON.

Earth launch-area forecasts use `/api/weather?pad=kennedy&date=YYYY-MM-DD` (or `vandenberg`), backed by the public Open-Meteo forecast API. `/api/launch-pads` returns the two area references. The Earth launch date is independent of the lunar mission date range. Only today through the next 15 days is accepted; other dates return an explicit out-of-range state without making a request. Forecasts include temperature, precipitation probability, 10 m wind and cloud cover, in UTC and explicit units. Values remain null when the source omits them. The cache refreshes at 30 minutes and labels stale values after failures. These broad launch-area forecasts are **not** official pad-specific launch weather, a go/no-go assessment, upper-air/lightning modeling, or lunar/space weather. Live Open-Meteo delivery could not be verified in this cloud because `api.open-meteo.com` was denied.

The required outbound domains were saved in the environment draft: `www.nasa.gov`, `blogs.nasa.gov`, `api.open-meteo.com`. Review/save them in environment settings and publish to retain the configuration. Draft saving does not activate access. When running Docker Desktop locally, ordinary internet access to these hosts is needed; no cloud-specific overlay is required. Rebuild an existing installation with `docker compose up --build -d` after updating the source.

The attached PDF was treated as feature ideas, not authoritative scientific evidence or deployment instructions. Automated alternate landing-site certification, research-value ranking and moving-body rocket trajectories remain deferred until their data, constraints and dynamics are defined. The worksheet, local-sky animation and launch-weather display do not claim those capabilities.
