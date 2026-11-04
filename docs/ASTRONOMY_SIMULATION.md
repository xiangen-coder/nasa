# Sun–Earth–Moon astronomical simulation

This is an additive section in the existing Lunar Navigator. It reuses React/Next.js, Three.js, OrbitControls, the original dark workspace, the existing textured Earth GLB, FastAPI, httpx and SQLite. No new runtime dependencies were added. The original landing-site SPICE calculations and data types are unchanged.

## Integration

The sidebar adds **Sun–Earth–Moon** as its ninth entry. `frontend/components/AstronomySimulation.tsx` owns the separate date/time and playback state. `AstronomyScene.tsx` renders the ephemeris. `astronomy-types.ts` defines the new response types. The parent page keeps the section mounted after first use so results survive navigation; hidden sections stop playback and release their WebGL scene. The existing Simple/Full switch does not reset it.

`backend/app/astronomy.py` adds POST `/api/astronomy`; `main.py` registers its router. The endpoint is independent of the existing `/api/ephemeris` endpoint. Next.js's proxy timeout is explicitly 150 seconds because a cold Horizons request is serialized and may exceed 30 seconds. Existing endpoints keep their routes and validation.

## Requests and time

Example request:

```json
{"local_time":"2026-11-04T08:00:00","timezone":"Asia/Kuala_Lumpur","window_days":30,"include_paths":true}
```

The backend converts IANA local time to a UTC clock time. Missing/ambiguous DST times return 422 and ask for UTC. Seconds are accepted; fractional seconds and explicitly offset local input are rejected. Date controls support calendar years 0001–9999; actual body coverage is checked by Horizons rather than promised for every date. The selectable zones include UTC, Kuala Lumpur, Kolkata, Tokyo, New York, London and Sydney.

Horizons TIME_TYPE=UT means UTC from 1962 onward and UT1 before 1962. Future UTC leap seconds are unknown. Historical local-zone offsets can include seconds. Dates are submitted as Gregorian-derived Julian Days with explicit TLIST_TYPE=JD and CAL_TYPE=GREGORIAN. These conventions are disclosed in the interface. Ancient-time and future-clock accuracy is not overstated.

## Data contract

All three bodies are requested from `https://ssd.jpl.nasa.gov/api/horizons.api`:

- Sun ID 10, Earth 399, Moon 301.
- VECTORS, CENTER=500@0 (solar-system barycentre).
- REF_SYSTEM=ICRF and REF_PLANE=ECLIPTIC (fixed J2000.0 ecliptic).
- OUT_UNITS=KM-S, VEC_TABLE=2, VEC_CORR=NONE (geometric simultaneous vectors).
- Each body receives the identical ordered time list.

The parser rejects mismatched body/origin/frame/units/time metadata, missing samples, mismatched epochs and non-finite vectors. GET batches contain at most 32 dates to avoid URL-length gateway errors. Requests are serialized. The endpoint returns 429 if another calculation owns the query slot, 422 for invalid/unsupported dates and 503 for upstream failure. It never generates fallback orbital positions.

Validated response bundles are cached for 24 hours in a separate SQLite table in CACHE_PATH; at most 48 bundles are retained. There is no artificial runtime example or synthetic orbit. No API key is needed. Deployment needs outbound HTTPS access to ssd.jpl.nasa.gov. The cache is disposable on free hosting; browser-local saved mission plans remain independent.

## Samples, trajectories and playback

A 2, 7, 30 or 366-day animation window has up to 121 actual Horizons samples and includes the exact requested instant. Calendar boundaries can shorten the window. The Earth path has up to 73 samples over 366 days around that instant. All returned states share matching epochs and axes.

Playback advances through samples only. The UI labels the sampling cadence and simulated hours per real second. Forward/back, timeline slider, pause and reset never invent intermediate positions. Reset returns to the original selected instant. API calls occur on Show Position / Current Time, not on each animation frame. Changed controls are labelled until a new result is loaded; a failed refresh leaves the last result's timestamp explicit.

Earth path = Earth minus Sun at each annual epoch. Moon path = Moon minus Earth at each animation epoch. Paths are translated to the currently displayed central body. They are relative orbital tracks, not SSB inertial flight paths. Line segments join samples; paths are not artificially closed circles. Short lunar windows show partial arcs; long windows can contain multiple revolutions.

## Rendering and scaling

Position mapping is (X,Y,Z) → (X,Z,−Y), followed by one common translation and one uniform distance scale: 1 scene unit = 1,000,000 km. This preserves centre-to-centre relative geometry. Camera modes focus Sun, Earth, Moon or the whole system; perspectives are oblique, ecliptic north and ecliptic edge. OrbitControls supports rotation, zoom and pan.

Body radii can be enlarged independently of distances using a labelled common factor (1–50, default 10). Reference radii are Sun 695,700 km, Earth 6,371 km and Moon 1,737.4 km. The physical-size button selects factor 1. Spheres can overlap when enlarged; this is disclosed. Glow and labels are visual aids. No orbit distance is stretched or log-scaled to make the Moon more visible.

Earth reuses `public/models/earth.glb` with its original UV mapping, textures and existing unverified-authorship attribution. Moon uses NASA SVS / LRO's CGI Moon Kit colour map; provenance is in `public/astronomy/manifest.json`. Neither is an elevation dataset. Texture orientation, planetary spin, axial attitude, and eclipse darkening are not calculated. Lighting is illustrative directional sunlight; this is not a surface-attitude or photometric simulator.

## Distances, phase and uncertainty

Distances are Euclidean norms of vector differences. Moon illuminated fraction = (1 + cos(Sun–Moon–Earth phase angle))/2. Phase category uses geocentric ecliptic elongation, with 22.5° bins around new/quarter/full and crescent/gibbous intervals between. Categories do not predict phase-event times. Light-time, topocentric parallax and eclipse darkening are excluded.

The actual vectors, distances and current phase are shown beside the timestamp, coordinate origin and method explanation. The major-body responses do not provide a validated error distribution here. The UI says uncertainty is not quantified; it does not invent a percentage error, confidence band or accuracy claim.

## Validation (4 November 2026)

- 31 new backend tests passed: timezone/DST, Julian dates, real NASA reference parsing, incorrect frame/body/origin/units/epoch rejection, malformed responses, analytic new/full/quarter phase, translation invariance, caching, validation, failure behaviour and bounded batches.
- The complete backend suite passed: 73 tests. Three reference-reader tests initially required installing the repository's existing Skyfield dependency locally; all then passed.
- Live NASA DE441 query returned 121 animation frames and 73 Earth-path samples. Kuala Lumpur 2026-11-04 08:00 mapped to 2026-11-04T00:00:00Z. Earth–Moon 380,046.7296 km; Earth–Sun 148,391,339.7603 km; Moon illumination 27.3054%.
- Separate live requests for all three bodies succeeded at 1950-01-01 and 2100-01-01, using DE441.
- TypeScript noEmit and changed-source ESLint passed. Production compile and static page generation passed; local Windows standalone packaging encountered EPERM on generated dependency directories. Linux hosting build is the deployment validation path.
- Browser checks exercised actual API loading, time-zone conversion, sampled forward/play/pause/reset, navigation retention, Sun/Moon focus and a 390px mobile layout with no page-level overflow.

## References

- https://ssd-api.jpl.nasa.gov/doc/horizons.html
- https://ssd.jpl.nasa.gov/horizons/manual.html
- https://svs.gsfc.nasa.gov/4720/
