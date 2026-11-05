# NASA integration audit and terrain connection — 6 November 2026

## Architecture and changes

The existing Next.js 15 / React 19 frontend uses Three.js and Recharts; the FastAPI backend uses HTTPX, NumPy, Rasterio and SQLite caches. The existing polar map passes planetocentric/east-positive coordinates into mission requests. Browser storage retains custom candidate points. Existing SPICE geometry and NASA research scores are separate workflows with distinct frame and uncertainty disclosures.

The NASA research integration was already implemented. This update connects the separate **More → Terrain analysis** page to that same verified raster registry. It no longer depends on configuring the separate legacy `LOLA_MANIFEST`. Original SPICE endpoint semantics are unchanged. The current design, spacecraft illustration, navigation and other features remain in place.

New endpoint: `GET /api/research/terrain?latitude=-89.463162834&longitude=-137.489552922&radius_m=100`. It validates finite lunar coordinates and a 25–500 m radius, reads bounded local windows and performs no Horizons requests or scientific downloads. Fine terrain failures remain explicit; a separate regional elevation reading never substitutes for footprint slope or roughness. The page includes direct coordinate inputs, radius and elevation/slope layers, native-resolution metrics, provenance, frame and coverage limitations. Diagnostic grid offsets follow projected raster axes; up is not necessarily geographic north.

Changed files: `backend/app/landing_research.py`, `backend/tests/test_landing_research.py`, `frontend/app/page.tsx`, `frontend/app/integration-latest.css`, `docs/LUNAR_RESEARCH.md`. New files: `frontend/components/TerrainAssessment.tsx` and this document. No packages added.

## Dataset connections and activation

- Horizons: lunar surface observer Sun/Earth azimuth, elevation, distance and light time. Terrain skyline screening is applied when covered. Exact requests are cached in SQLite. Official request endpoint is `https://ssd.jpl.nasa.gov/api/horizons.api`, as documented at https://ssd-api.jpl.nasa.gov/doc/horizons.html (the attachment's API hostname/path is not the documented request endpoint).
- LOLA: NASA PGDA Site01 5 m terrain crop supplies footprint slope, relief and plane-detrended RMS roughness. NASA PGDA product 90 native 20 m regional crop supplies finite 20 km horizons and separate regional elevation. https://pgda.gsfc.nasa.gov/products/78 and https://pgda.gsfc.nasa.gov/products/90 . Coverage is regional, not global landing assessment.
- LROC: bounded cached NAC/PSR imagery previews through the existing backend proxy. Imagery inspection does not produce a comprehensive crater/boulder inventory; no automatic detections are claimed.
- Diviner: numeric historical seasonal min/max rasters in kelvin. Observation period 2009-07-05 through 2019-02-17; historical range overlap is a thermal proxy, not a forecast for the selected mission date.
- Ice/hazards: validated numeric fraction raster integration exists but no numeric ice or comprehensive hazard raster is bundled. Unavailable factors remain unavailable. Register an appropriately documented product rather than interpreting dark pixels as ice or obstacle absence.
- Candidate regions: historical 19 August 2022 NASA names and publication metadata, distinct from custom saved points. Official boundary polygons/exact touchdown coordinates are not supplied or invented. This is not a current mission shortlist.

Use `python scripts/prepare_lunar_research.py` for documented offline products and `python scripts/package_lunar_preview.py` to create small deployment crops. Set `LUNAR_DATA_MANIFEST` to a validated manifest for additional coverage or numeric hazard/ice products. Required units, hashes, nodata, frame, physical interpretation, source and manual/automatic hazard method are documented in [LUNAR_RESEARCH.md](LUNAR_RESEARCH.md). Raw global products never go to the browser. The downloaded LUPEX 1 m package remains inactive until coordinate/vertical registration and error validation are complete.

## Scoring retained

`0.35T + 0.25S + 0.20C + 0.15H + 0.05I`, with factors clipped to 0–100.

T uses 60% slope component, 25% detrended roughness and 15% relief, less any validated hazard penalty. S and C use duration-weighted visibility. H uses historical observed min/max range overlap with configured operating limits. I uses a documented mapped evidence/PSR fraction only. Missing factors renormalize available weights for a clearly provisional result. Hard slope/roughness/relief/hazard constraints are evaluated independently of score. Unknown hazards, thermal proxies, missing factors and incomplete terrain screening prevent certification claims. A high score does not establish landing safety, power sufficiency or a radio link budget.

## Run and verify

From the project root: `docker compose up --build`. Or start `.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000`, then run `npm ci` and `npm run dev` inside `frontend` with `BACKEND_URL=http://127.0.0.1:8000`.

Validation: 110 backend tests passed, including seven new cases for the terrain endpoint: native raster measurements without Horizons, regional elevation separated from missing footprint terrain, and invalid coordinate/radius rejection. TypeScript (without incremental output) and changed-source ESLint passed. Actual covered reference at 100 m radius: elevation 1944.95 m, p95 slope 10.51°, maximum slope 17.04°, detrended RMS 1.32 m, relief 16.86 m, native spacing 5 m. These are measurements, not a safe-site endorsement; the default 15° maximum slope limit is exceeded.
