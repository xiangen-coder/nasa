# Wider lunar terrain integration

The NASA landing research evaluation now uses an actual regional subset of NASA PGDA product 90: `LDEM_80S_20MPP_ADJ.TIF`, https://pgda.gsfc.nasa.gov/products/90 . The source is a cloud-optimized 20 m elevation GeoTIFF in south polar stereographic, MOON_ME/DE421. Offline processing reads native raster windows through verified HTTPS range access. It preserves native float32 elevations and nodata without upsampling or synthetic fill.

The deployed subset spans projected X=-70 to +30 km and Y=-40 to +45 km: about 100 x 85 km. It covers the existing finite 20 km horizon neighbourhoods around Connecting Ridge and the three default map reference coordinates. It is not whole-Moon coverage. Effective resolution varies; no corresponding broad DEM error maps have been imported yet.

## Using the website

Map explorer -> NASA landing research -> Evaluate selected point. When covered, the result says terrain_screened and identifies the 20 m DEM horizon method. The graph shows the actual Sun and Earth elevations as solid lines, and their sampled terrain thresholds as dashed lines. Earth clearance is included in its threshold. The horizon model has 72 azimuths (5-degree spacing), nearest-neighbour samples at 25 m radial steps out to 20 km, and spherical curvature. It excludes farther terrain, subpixel obstacles, finite body disks and eclipses. It is provisional screening; ephemeris/DEM frame alignment and horizon uncertainty remain unquantified.

Local terrain slope/roughness and Apollo footprint screening continue to use the existing native 5 m dataset with its own quality layers. Where that local DEM is absent, the wider dataset can supply the observer elevation and horizon, but does not supply a fabricated fine-footprint terrain score. A body may be above zero degrees and still be obstructed by terrain. Missing horizon information is represented as unknown, not plotted as a flat horizon.

The original top-level SPICE visibility overview continues to use its separate optional LOLA_MANIFEST configuration; it has not silently been switched between IAU_MOON and mean-Earth frames. Use the NASA landing research panel for this new wider terrain integration.

## Deployment and preparation

Run existing `python scripts/prepare_lunar_research.py`, then `python scripts/prepare_horizon_dem.py`. The latter prepares the bounded regional subset and records URLs, units, frame, native pixel spacing, bounds, retrieval date and SHA-256. Use `--bounds xmin ymin xmax ymax` for another region (at most 30 million pixels, compressed artifact at most 100 MB). Observation acquisition dates are not inferred from download time. The helper registers the dataset in both local and bundled manifests.

The native cropped GeoTIFF is about 49 MB and stored in source control as 25 ordered immutable binary parts. The original TIFF is excluded from Git/Docker context. On first use, the backend assembles the parts in the writable CACHE_PATH directory, verifies every part and the complete raster, then opens it window-by-window. Assembly is atomic, bounded and process-locked. Runtime cache persists only as long as the host filesystem; it is reproducible from the image's bundled parts. Corrupt or missing products fail closed to unavailable terrain. No browser downloads the large raster and no map click downloads a global product.

`package_lunar_preview.py` retains this product without recropping it. Routine base-product preparation preserves unrelated registered products.

## Finer 1 m package

The published 76,134,049-byte LUPEX package was also downloaded and its published MD5 verified (`4ad67232e49b502897ecff197336da29`). It is retained locally under ignored `data/lunar/raw/LUPEX_DataS1.zip`. It contains six 1 m shape-from-shading DTMs, orthomosaics, height-error maps, ROI polygons and a README. Source: https://zenodo.org/records/17153447 . The CR1 DTM has 1 m pixels and a lunar spherical stereographic CRS, near our demonstration region. Its TIFF tags do not independently establish the detailed body-frame/vertical-reference registration needed for automatic scoring. It is therefore NOT yet substituted into scoring or published as validated 1 m landing terrain. Frame registration, error interpretation and independent cross-validation remain prerequisites. Retain authors' CC BY 4.0 attribution if integrating it later.

## Checks

Backend tests cover wide-horizon selection, broad observer elevation without invented local terrain scores, checksum rejection and atomic-part assembly. All four demonstration reference coordinates produced complete finite 20 km profiles. At the Connecting Ridge DEM centre, the 20 m DEM elevation is 1944.8103 m versus 1944.9460 m from the local DEM (about 0.136 m difference); this is a consistency check, not an accuracy bound or full validation. The research API was exercised with the parts-only production layout.
