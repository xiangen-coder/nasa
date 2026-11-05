# Apollo LM reliability and contingency screening

This extends the existing NASA landing research panel. It adds a separate Apollo-reference assessment without replacing the original five-factor calculation or claiming flight certification.

## New real datasets

NASA PGDA Site01 (Connecting Ridge), https://pgda.gsfc.nasa.gov/products/78 :
- `Site01_final_adj_5mpp_toterr.tif`: published RMS elevation uncertainty, metres.
- `Site01_final_adj_5mpp_slperr.tif`: published RMS slope uncertainty, degrees.
- `Site01_final_adj_5mpp_ldec.tif`: native LOLA laser-shot count per pixel.

The offline command `python scripts/prepare_lunar_research.py` now downloads/processes these with the existing DEM and temperatures. `python scripts/package_lunar_preview.py` bundles aligned 4 km square terrain/quality crops around the Site01 DEM centre (previously 1 km square). All retain 5 m spacing. Numeric files have SHA-256 manifests, original source hashes/URLs, retrieval dates, lunar CRS and units. Measurement code rejects checksum failures, missing/nodata/negative uncertainty, mismatched frame, raster shape or transform, and incomplete footprint windows. Zero shot count means no laser shots in that cell, not zero uncertainty or flat safe ground. It does not establish the count of independent measurements at 5 m spacing. Observation acquisition cutoff remains referred to the source documentation; downloading today does not create newer observations.

Full regional sources remain under ignored `data/lunar`; production uses bundled `data/lunar_preview`. Existing `LUNAR_DATA_MANIFEST` override still applies. New uncertainty files must be aligned with the DEM and declare units `m RMS`, `degree RMS`, `count`, and frame `MOON_ME_DE421`. This release does not add wider horizon DEMs, boulder maps, ice products, winter thermal forecasts or new official region polygons.

## Apollo reference and uncertainty

NASA TN D-6850 reports historical topographic design assumptions of mean slope <=6 degrees, effective slope <=12 degrees and footprint irregularities <=24 inches (0.6096 m): https://ntrs.nasa.gov/api/citations/19720018253/downloads/19720018253.pdf . NASA Apollo 12 press kit gives diagonal gear span 31 ft (9.4488 m): https://science.nasa.gov/wp-content/uploads/2023/09/Apollo_12.pdf . These are historical reference constraints, not a complete operational envelope for every LM variant or a demonstrated polar mission capability.

The landing envelope radius is max(existing analysis radius, user radial position-error bound + gear span/2), at most 500 m. Position error defaults to an explicitly unverified 50 m research assumption; it is not an Apollo accuracy specification. Existing roughness/relief/temperature limits remain editable research inputs.

The sensitivity scenario adds `multiplier * max local RMS slope error` to mean, p95 and maximum slope; adds `multiplier * max local RMS height error` to roughness and twice that amount to relief. Multiplier defaults to 2 and is editable 0-4. This is a deliberately conservative stress test, not statistically propagated uncertainty, a confidence interval or a touchdown probability. Spatial correlations and published terrain-error clones are not modelled. Mean slope is a neighbourhood pixel average, not a measured four-footpad plane. 5 m data cannot validate 0.61 m irregularities, footpad soil bearing, sinkage, touchdown velocities, strut stroking, guidance, visibility through the LM windows or crew illumination constraints.

Apollo screening caps the effective slope limit at 12 degrees and checks mean slope at 6 degrees, even if a looser general threshold was entered. The five-factor margin score recomputes T from stressed measurements using the same mission geometry and other factors as the selected-site nominal score. It remains provisional. Without complete uncertainty layers, the margin-based total is null. The hard-limit status remains separate from scores. No high score establishes spacecraft suitability.

## Alternative points and mitigations

`POST /api/reliability/assess`: existing mission/limits plus optional vehicle assumptions. It queries Horizons once for the selected site, then screens 24 deterministic geodesic candidate positions on three rings and eight azimuths. Search radius defaults to 500 m, bounded 100-2000 m. An optional user diversion distance cap bounds the search, but is not fuel/delta-v evidence. Candidates overlapping the selected evaluation circle are excluded. Returned candidates are separated by at least twice the envelope radius.

Only candidates with complete DEM/uncertainty evidence, acceptable resolution and no stressed terrain-limit failures enter the backup terrain shortlist (at most three, sorted by sensitivity terrain score). Improvement is asserted only against a baseline with the same available uncertainty-based terrain score. This is terrain comparison, not a full mission ranking. Candidate Sun/Earth visibility and thermal suitability are not copied from the selected point. Select a candidate and run full evaluation for its own date/site geometry. If none pass, the response says so; up to three rejected alternatives can be opened separately for investigation and are explicitly not recommended backups. This prevents fabricated safe alternatives.

Mitigations identify footprint-scale data gaps, soil bearing uncertainty, sampled visibility transitions, terrain violations, missing full horizon coverage, historical thermal limits and unknown flight diversion feasibility. Optional battery/load/reserve inputs give only constant-load endurance and comparison with sampled darkness; no Apollo battery/fuel values are invented. The energy model excludes ageing, thermal derating, changing loads, charging and terrain shadows. Engineering mission analysis is required before any actual operation.

The browser can export the complete assessment and assumptions as JSON. Editing the mission, limits or vehicle assumptions clears stale results and cancels previous requests.

## Validation

Existing backend suite: 91 passed. New tests cover RMS-margin score monotonicity, Apollo slope caps/mean slope, missing quality data, rejection of failed candidates, distance/separation filters, invalid vehicle inputs, and vehicle/position-error envelope sizing. Real NASA crop measurements were evaluated through the API. At the Connecting Ridge demonstration point, the default conservative screen rejects the baseline and all searched candidates; no passing backup is invented.

Created: `backend/app/lunar_uncertainty.py`, `backend/app/landing_reliability.py`, `backend/tests/test_landing_reliability.py`, `frontend/components/LandingReliability.tsx`, and three quality raster files. Modified: backend router registration and mean-slope metric; NASA preparation/packaging scripts; research panel integration; expanded DEM/manifest; build ignores for local preview; this guide.
