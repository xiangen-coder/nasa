# NASA lunar landing research integration

## Architecture and use

This extends the existing Next.js 15 / React 19 site and FastAPI backend. Existing polar map, SPICE analysis, visibility comparison, reports, route viewer and Sun–Earth–Moon simulation remain intact. No runtime dependencies were added. The new **NASA landing research** panel appears below the existing Map explorer and Site comparison tools. It reuses the selected coordinates, mission dates, sampling interval, panels, buttons and Recharts.

1. Select a map point or enter latitude/longitude in Map explorer.
2. Set mission dates and time step. Research requests allow up to 400 intervals and 31 days; a larger time step reduces cold NASA requests.
3. Scroll to NASA landing research and select **Evaluate selected point**.
4. To exercise bundled terrain data, select **Connecting Ridge DEM centre (research point)**. This is a calculated centre of the PGDA raster, not an approved touchdown site.
5. Save custom points in the browser, then compare up to three. Priority: current selection, saved points, existing references. Identical coordinates are deduplicated. Results use the same thresholds and dates. Failed-limit points are unranked and appear after eligible research scores.

The browser stores custom points under `lunar-research-points`; it does not write to a shared public database. Storage is device/browser-specific. Exports/backups of the browser are the user's responsibility.

### APIs

- `GET /api/research/datasets`: product status, sources, historical region names, activation command and a raster-derived reference point.
- `POST /api/research/evaluate`: `{ "mission": <existing Mission object>, "limits": <optional thresholds> }`. Returns original inputs, factor scores/contributions, physical measurements, provenance, geometry series/windows and safety flags. Missing sources do not prevent other factors from being evaluated.
- `GET /api/research/imagery?latitude=-89.463162834&longitude=-137.489552922&layer=nac&span_m=4000`: bounded PNG preview from an allowlisted LROC WMS layer. `layer=psr` selects contextual PSR imagery. No arbitrary remote URL can be requested.

## Data connections

### JPL Horizons surface observations

Official endpoint is `https://ssd.jpl.nasa.gov/api/horizons.api` (the documentation host is `ssd-api.jpl.nasa.gov`). Uses `EPHEM_TYPE=OBSERVER`, `CENTER=coord@301`, `COORD_TYPE=GEODETIC`, `SITE_COORD=longitude,latitude,height_km`, targets Sun 10 and Earth 399, `QUANTITIES=4,20,21`, `APPARENT=AIRLESS`, `CAL_FORMAT=BOTH`, `CAL_TYPE=GREGORIAN`, `TIME_TYPE=UT`, explicit Julian epochs and CSV output. Moon input longitude is east positive. Moon reference radius is 1737.4 km. Observer elevation is from validated LOLA when available, otherwise explicitly zero relative to the reference sphere.

Quantity 4 is apparent, airless azimuth/elevation of the body centre: north 0°, east 90°. Quantity 20 is apparent range in AU, converted with 149597870.7 km/AU. Quantity 21 is one-way **down-leg** light-time in minutes, converted to seconds. This is not a complete radio link delay or budget. Output target, lunar centre, input coordinates, time epochs, range/light-time consistency and finite values are validated. Returned lunar orientation/model names are retained; the live check returned MEAN_ME and DE441. These results are independent of the legacy IAU_MOON/SPICE page, not silently substituted into it.

Queries are serialized with the existing Horizons lock. SQLite caches exact site/height/epochs for 24 hours, capped at 96 bundles. Failed responses are not cached or replaced by synthetic geometry. A final partial interval is explicitly included. Percentages and durations use left-endpoint interval weighting, excluding the final sample from duration. Rise/set boundaries have sampling uncertainty of up to one interval per boundary. Before 1962 Horizons interprets UT as UT1; future leap seconds are unknown.

Where a compatible DEM covers all rays, local terrain horizons use 5° azimuth steps, nearest-neighbour height samples at at least 25 m spacing, lunar curvature and a 20 km radius. Missing rays leave obstruction **unknown**, not zero. Local skyline approximations exclude distant terrain, subpixel features, finite solar disk and eclipses. Alignment of DEM mean-Earth frame with Horizons orientation still needs mission-level validation. Reference-tangent-plane percentages can contribute only to a clearly provisional geometric screening score.

### LOLA

Downloaded NASA PGDA [Site01 Connecting Ridge product](https://pgda.gsfc.nasa.gov/products/78), `Site01_final_adj_5mpp_surf.tif`. Native spacing 5 m; metre elevations relative to 1737400 m; south polar stereographic, MOON_ME/DE421. Source SHA-256 is retained in the manifest. Approximately 90% of 5 m pixels are interpolated according to the product documentation. Native pixel spacing is not equivalent to independently measured 5 m terrain resolution.

Local terrain evaluation uses all native pixels inside a configurable circular neighbourhood (default radius 100 m), with complete coverage and at least nine samples. Slopes use projected metre central differences; the 95th percentile and maximum are reported. Roughness is RMS residual from a least-squares plane; relief is maximum minus minimum elevation. Any missing data in the derivative stencil rejects the neighbourhood. Raster CRS, units, vertical reference, frame and file hash are checked. The public diagnostic layer is decimated for display only; calculations retain native values. Coordinates in that layer are projected grid X/Y offsets, not a compass orientation at arbitrary polar longitude.

**Public coverage:** a 4 km × 4 km native-resolution crop around the Site01 raster centre. Full offline source covers 16 km × 16 km; neither alone supplies all 20 km horizon rays. It is deliberately reported as incomplete horizon coverage. A wider, frame-compatible mosaic is needed for terrain-screened lighting. The three pre-existing exploratory map locations are not represented as having LOLA coverage when they fall outside this crop.

### LROC

Lunaserv's published WMS capabilities identify `luna_nac_sp_mosaic` (uncontrolled 1 m/pixel south-pole mosaic; acquired 2010-07-23 through 2010-12-11; latitude -90 to -85.5) and `luna_nac_pole_psr_south` (20 m/pixel PSR imagery context). The backend uses WMS 1.1.1 `IAU2000:30120` south polar stereographic coordinates and a bounded 512px PNG. A 4 km preview displays about 7.8 m per pixel. No claim of boulder detection is made from this reduced preview. Adjacent NAC images are not registered to one another. Dark areas do not establish safe ground, ice, or absence of hazards. Imagery cached in memory for 24h / 32 images and browser HTTP cache; numerical products never use image colours as measurements.

No comprehensive crater/boulder classifier or mapped hazard inventory is bundled. An optional **validated hazard fraction raster** may be registered; it must state whether identification was manual, automatic or a published product, footprint size, resolution and observation/source dates. A fraction represents mapped hazard area in that raster cell/assessment footprint, not proof of complete detection.

### Diviner

Downloaded [Williams et al. 2019 seasonal polar products](https://www.diviner.ucla.edu/data): `polar_south_80_summer_min-float.tif` and `polar_south_80_summer_max-float.tif`. Use numeric floating-point files, **never `-color.tif` previews**. Approximately 240 m spacing, kelvin, historical bolometric brightness-temperature composites from 2009-07-05 to 2019-02-17. File hashes, observation period, units and processing status are retained. Masked, nonfinite, zero/negative and >500 K samples are unavailable. Both valid min and max with matching observation period are required; no replacement value is invented.

The public bundle retains a native-resolution 120 km square subset around the pole; full offline preparation retains the original south-pole maps. These summer composites do not describe winter, every lunar day, or future mission temperatures. No conversion of a range-overlap percentage into hours of temperature suitability is made.

### Water ice / PSR potential

The bundled [NASA LOLA permanent-shadow mask](https://pgda.gsfc.nasa.gov/products/90) uses native 20 m pixels from `LPSR_80S_20MPP_ADJ` on the same regional subset as the horizon DEM. The water-ice proxy reports the fraction of sampled pixel centres in permanent shadow within the configured neighbourhood radius (100 m by default). A measured 0% means the mask classifies all sampled cells as outside permanent shadow. Incomplete coverage remains unavailable. The map describes a cold-trap proxy, while ice presence, abundance and accessibility remain unverified. Recreate the packaged subset with `python scripts/prepare_south_pole_psr.py --source <NASA GeoTIFF>`.

### Official candidate regions

The panel lists the 13 **historical 2022** candidate names from [the user's NASA release](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/). It does not present this as the current mission shortlist. That release does not supply numeric touchdown coordinates or machine-readable polygon boundaries. The separate [USGS region data release](https://www.usgs.gov/data/down-selected-artemis-iii-candidate-landing-site-navigational-grids) links to ScienceBase, whose download currently presented a browser challenge to automated retrieval. No polygons or coordinates were guessed. Exact official polygon overlays and automatic point-in-region validation therefore remain pending a downloaded, frame-validated boundary file. All map points, including the raster centre, remain explicitly exploratory/custom. Assigning a region name to a saved point is an unverified user association.

## Score normalization and safety

Nominal formula: **0.35T + 0.25S + 0.20C + 0.15H + 0.05I**; all factors clipped to [0,100].

- T: `0.60 × slope_score + 0.25 × roughness_score + 0.15 × relief_score − hazard_penalty × hazard_fraction`. Slope score = `100 × (max_slope − p95_slope)/(max_slope − good_slope)`. Roughness and relief = `100 × (1 − measurement/limit)`, individually clipped. Missing hazards leave T explicitly topographic-only and provisional; no fabricated zero-hazard measurement is supplied. DEMs coarser than the configured resolution limit cannot produce T.
- S: duration-weighted Sun-centre visibility percentage; terrain screened when possible, otherwise labelled geometric-only.
- C: duration-weighted Earth-centre visibility percentage with the existing configurable clearance angle. Range/light-time are displayed separately; no arbitrary distance penalty implies a radio link budget.
- H: `100 × overlap_length(observed seasonal min–max, operating limits)/observed_range_width`. A single-valued range scores 100 only if within limits, otherwise 0. This is an explicitly provisional historical range proxy, **not fraction of mission time**. No valid paired values means unavailable.
- I: `100 × documented resource-evidence or PSR fraction`, only from a registered product; unavailable by default.

If factors are unavailable, divide each available nominal weight by the sum of available weights. Display nominal and effective weights, contributions, missing factors and the available-weight percentage. No available factors yields a null score. Scores with missing hazards, incomplete terrain horizons or historical thermal/PSR proxies remain provisional even if all five numeric factors exist. With the bundled historical thermal product a complete mission score is **not** claimed.

Measured maximum slope, detrended roughness, local relief and mapped hazard fraction beyond their configured limits trigger hard failures. A high weighted score cannot erase a failure. Missing constraints give `not_established`, never `safe`. Historical thermal range excursions are warnings, not future mission-specific measured failures. Compare only sites with comparable factor/terrain coverage; the UI warns when rankings could otherwise mislead.

Defaults: radius 100 m; good slope 2°; maximum slope 15°; maximum roughness 5 m; maximum relief 50 m; scoring DEM pixel limit 20 m; hazard penalty 100; maximum mapped hazard fraction 0.05; operating range 100–350 K. These are research settings, not spacecraft certification requirements.

## Download, preprocessing and configuration

Install existing backend dependencies (Python 3.12 recommended):
```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend/requirements.txt
.\.venv\Scripts\python scripts/prepare_lunar_research.py
```
The downloader retrieves fixed official products (about 210 MB once), bounds each file to 100 MB, validates readability and lunar CRS, applies scale/offset, masks invalid temperatures, and writes tiled compressed GeoTIFFs plus SHA-256 manifests. Processing is offline so it does not occupy a user's map request; run it in a separate terminal/background batch when adding data. Partial downloads use a distinct `.download` suffix. It reports failures in `manifest.json` and can reuse completed valid raw files. It does not overwrite app code or silently fabricate a product.

If the Diviner server presents an incomplete TLS certificate chain to Python, **do not disable certificate verification**. Obtain the exact numeric files through a normal verified browser download or Windows `curl.exe`, place them at `data/lunar/raw/temperature_min.tif` and `temperature_max.tif`, then rerun preparation. The direct URLs and original SHA-256 values are in `data/lunar_preview/manifest.json`. No credentials or NASA API key is needed.

Configuration search order: `LUNAR_DATA_MANIFEST` → local `data/lunar/manifest.json` → bundled `data/lunar_preview/manifest.json`. Set the environment variable to an administrator-maintained manifest for additional local products. Paths are relative to the manifest. Keep raw downloads outside the Git repository. Rebuild the public image to update bundled subsets, or mount persistent scientific storage and set the environment variable. No public upload/admin endpoint is exposed.

Each `products` entry has `path`, `sha256`, `name`, `source_url`, `documentation`, `resolution_m`, `observation_period`, `quality`, `frame`, `units`. LOLA additionally needs `reference: radius_minus_1737400m` and `frame: MOON_ME_DE421`; thermal units are `K`. Hazard/ice units are `fraction`, numeric range 0–1, with nodata declared in the raster. Hazards require `method: manual|automatic|published`; ice requires `interpretation: mapped_ice_evidence|psr_fraction`. Preserve nodata and native resolution during conversion. Validate projection, datum, footprint semantics and coverage before registration. A map's absence of a classified feature must not be interpreted as a confirmed absence unless supported by its product definition.

`python scripts/package_lunar_preview.py` creates the small native-resolution crops after preparation. The public Docker image copies only `data/lunar_preview`—no large scientific downloads happen on startup or map clicks. A broad mosaic is required before full 20 km terrain horizon analysis becomes available. `LOLA_MANIFEST` remains the separate legacy terrain-page configuration; the new research registry does not silently change the old SPICE workflow.

## Running and validation

Existing `docker compose up --build` remains supported. Public single-service build: `docker build -f Dockerfile.public -t lunar-navigator .`; run with `docker run --rm -p 3000:10000 lunar-navigator`. For development, start `.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000`, then in `frontend` use `npm ci` and `npm run dev` with `BACKEND_URL=http://127.0.0.1:8000`.

Tests: `python -m pytest backend/tests -q`; frontend `npm run typecheck` and changed-source ESLint. On restricted Windows environments, set pytest `--basetemp work/pytest-<unique-name>` if the system temp directory is unavailable.

Validation on 5 November 2026 (Malaysia): all 91 backend tests passed, including 18 new research cases. Tests cover authentic Horizons response parsing and site/target mismatch, nodata rejection, hash integrity, plane slope/roughness, incomplete horizon coverage, limit validation, provisional renormalization, hard failures despite a high score and API failure isolation. TypeScript and changed-source lint passed. Real Site01 centre measurement: p95 slope ~10.51°, max slope ~17.04°, detrended roughness ~1.32 m, seasonal temperature range ~86.18–218.29 K. The default 15° slope constraint correctly fails. Test rasters are synthetic fixtures only and never served as NASA data.

## Files

New: `backend/app/surface_horizons.py`, `lunar_rasters.py`, `landing_research.py`; `backend/tests/test_landing_research.py` and authentic observer fixture; `frontend/components/LandingResearch.tsx`; `scripts/prepare_lunar_research.py`, `package_lunar_preview.py`; `data/lunar_preview/{manifest.json,lola.tif,temperature_min.tif,temperature_max.tif}`; this document.

Modified: `backend/app/main.py` (router registration), `frontend/app/page.tsx` (panel integration), `frontend/app/globals.css` (scoped styles), `Dockerfile.public` and `backend/Dockerfile` (small data bundle), `.gitignore`, `.dockerignore` and `frontend/.dockerignore` (large local files/build artifacts), `README.md` (feature guide). Original API semantics and dependencies are unchanged.

Apollo LM uncertainty layers and backup-point screening are documented in [APOLLO_RELIABILITY.md](APOLLO_RELIABILITY.md).

The [wide terrain integration](WIDE_TERRAIN.md) supplies a native 20 m regional DEM. Landing research prefers the 5 m crop and uses a complete regional DEM window for provisional slope, relief and detrended roughness when the 5 m crop is unavailable. The configured DEM pixel limit still applies. The Apollo footprint and uncertainty assessment requires the fine-scale inputs. Regional pixel spacing leaves smaller slopes and hazards unresolved.

The dedicated Terrain analysis page now reads the verified research raster registry through GET /api/research/terrain. The legacy SPICE API retains its separate LOLA_MANIFEST configuration. See [the integration audit](NASA_INTEGRATION_AUDIT.md) for the current dataset coverage, page controls, setup and validation.
