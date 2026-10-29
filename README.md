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
