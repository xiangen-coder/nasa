# Additional feature ideas: implementation boundaries

The user's PDF suggested the following ideas. It is a planning reference, not an authoritative source for scientific claims or rocket parameters.

| Idea | Delivered | Remaining |
| --- | --- | --- |
| Moon exploration news | Cached NASA RSS sidebar, publication/retrieval dates, excerpt reader, source links, explicit stale/unavailable states | Live source verification after required outbound hosts are enabled |
| Earth / Sun 3D models | Uploaded GLBs bundled and tested in WebGL; original USDZs downloadable | Original asset licensing/authorship verification |
| Moon model / south pole | Reference sphere with south-pole annotation; browser-local GLB/USDZ import | Actual uploaded large USDZ could not be transferred; optimized GLB requested for reliable bundling; lunar frame/orientation verification |
| Planet movement | Computed local Sun/Earth-center sky animation tied to the existing SPICE time series | No heliocentric display or rocket trajectory is implied |
| Weather forecast | Short-range Earth launch-area Open-Meteo adapter, forecasts only within allowed date horizon | Live feed verification; no official launch go/no-go, space weather or lunar temperature forecast |
| Rocket specifications | Editable footprint, landed mass, power, panel output and transit/tolerance inputs; circular platform and panel arithmetic | No manufacturer specifications inserted without evidence; no structural or propellant model |
| Saved itinerary | Browser-local mission plans, restore/delete, explicit ETA from user inputs, JSON export | Account sync, actual launch-service schedules, verified trajectory-derived travel times |
| Expanded alternative landing search | Existing coordinate selection and 2–3-site comparison | No nearby site is certified safe without terrain and vehicle constraints; automatic ±30 minute/position optimization deferred |
| Research value | Not scored | Scientific objectives and evidence-based scoring need to be defined |
| Moving-body rocket route | Not represented by the local-sky viewer | Requires a separately validated trajectory/dynamics model and mission parameters |

UI explanations and exported worksheets must continue to distinguish user assumptions, real ephemerides, external information and unavailable data. Do not substitute fabricated values when a source is missing.
