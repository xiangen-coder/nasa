# Validation record

Validation performed in this managed Linux cloud environment on 30 October 2026 (Asia/Kuala_Lumpur).

- Backend: **32 passed**. Local axes/cardinal azimuths, horizon interpolation and azimuth wrapping, clearance threshold, strict visibility equality, duration-weighted terminal intervals, merged operational windows, blackout/darkness intervals, real kernel time series, API validation/cache/exports/comparison, missing DEM, checksum and Earth-CRS rejection, partial coverage and analytic ring obstruction.
- Independent NASA reference-data checks: NAIF text-kernel published checksums and lunar radii matched; DE421 J2000 Sun/Earth vectors matched Skyfield's independent SPK evaluation at 2000, 2026 and 2050 epochs within the test tolerance (20 metres absolute plus 1e-11 relative). This uses the same NASA dataset and does not independently validate IAU_MOON orientation or local terrain angles.
- Frontend: **5 browser tests passed**, using system Chromium and the real FastAPI / production Next.js servers. Covered calculation, slider and playback, terrain-unavailable disclosure, weighted comparison and invalidation, report and JSON download, input invalidation/errors, offline operation, all three precomputed examples, keyboard map selection and mobile overflow/navigation.
- `npm --prefix frontend run lint`, `typecheck`, and production `build`: passed.
- Reusable `scripts/install.sh`: executed successfully, including pinned dependency installation, kernel verification/example regeneration and standalone frontend build.
- Docker Compose configuration validated and both images built with TLS verification and the managed CA bundle. **Both containers became healthy.** The frontend-proxy smoke test computed 169 real ephemeris samples, compared three sites and exported 169 CSV data rows in reference-sphere mode. Container verification identified and resolved non-root source ownership and the Rasterio `libexpat1` runtime dependency.

Non-failing tooling warnings: the installed Starlette TestClient emits an httpx deprecation warning; Node's Next.js proxy emits a `util._extend` deprecation warning. Next.js notes that the ESLint configuration uses TypeScript rules rather than its optional Next.js lint plugin. These did not prevent validation.

## Scientific and delivery gaps

No measured LOLA raster is installed or independently validated. Terrain calculations are tested on synthetic analytic fixtures only. The shipped map is a coordinate graticule with external Moon Trek / QuickMap links; no lunar imagery tiles are integrated. IAU_MOON is approximate and has not been aligned to a precision lunar terrain frame. No Horizons angular validation was possible because the NASA API host is blocked by the current network policy. No flight-quality hazard, radio link, solar power, eclipse or disk-extent model is claimed. No public deployment or domain is provisioned. GitHub CI is configured but has not run remotely.
