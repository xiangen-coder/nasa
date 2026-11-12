# Lunar elevation data

All elevations use metres above a spherical lunar reference radius of 1,737,400 m. The global GeoTIFF and the USGS crop store integer values with a scale of 0.5 m per unit. The LROC crop stores floating-point metres.

| File | Coverage | Source |
| --- | --- | --- |
| Moon_LOLA_global_16ppd.tif | Whole Moon, 16 pixels per degree, about 1.9 km per pixel at the equator. Suitable for broad terrain and approximate horizons. | [NASA PDS LOLA](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) |
| Chandrayaan-3_LOLA_118m_horizon.tif | Chandrayaan-3 surroundings, 118 m nominal spacing. Valid samples verified along 72 rays out to 20 km. | [USGS LOLA elevation map](https://astrogeology.usgs.gov/search/map/moon_lro_lola_dem_118m) |
| Chandrayaan-3_LROC_3m_local.tif | About 1 km across at 3 m per pixel, with a complete 100 m landing neighbourhood. | [LROC NAC VIKRAMSITE1](https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_VIKRAMSITE1) |

SHA-256 checksums for the complete GeoTIFFs:

```text
88f42411677b119d33c42a15628ccd0c9a2148a9a2ad3c2075b5a891f27a4a88  Moon_LOLA_global_16ppd.tif
8ccb93cd23c743f3b0642334a0c397e14bc4e00e4129b721c47d024998d04779  Chandrayaan-3_LOLA_118m_horizon.tif
6533597f5228bd99f93a8efa5db472d8e4acc1d57ae97a1e0e5a9a485fee7c85  Chandrayaan-3_LROC_3m_local.tif
```
