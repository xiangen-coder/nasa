# Lunar mission archive integration

The former Mission report navigation slot now opens Lunar mission archive. Its same-origin embedded module is bundled under frontend/public/mission-archive; it needs no external hosting or ChatGPT login. It reuses the source of the user's Lunar Atlas Site, with its decorative landing page removed and colours/fonts adapted to Lunar Navigator. CSV/JSON downloads for the current site analysis remain above the archive when analysis exists.

The catalog snapshot has 123 NASA lunar mission/spacecraft records. Search, country/type/outcome/decade filters, sorting, detail dialogs, and 78 eligible successful/partial mission stage reconstructions are retained. Source: https://science.nasa.gov/moon/missions/ . Catalog dates/outcomes and individual route sources are disclosed in the interface. This is a bundled snapshot, not a live NASA API feed.

3D playback uses illustrative stage geometry, fixed Earth/Moon, enlarged bodies, compressed distance, a generic spacecraft and equal-duration stages. It is not historical ephemeris data or simulated flight dynamics. Existing JPL Horizons simulation remains independently available in Sun–Earth–Moon.

Changed: frontend/app/page.tsx, frontend/components/ResultExplanation.tsx, frontend/tests/workflow.spec.ts. New: frontend/public/mission-archive/{index.html,app.js,missions.json,profiles.mjs,viewer.mjs,style.css,trajectory.css,integration.css,vendor/three.module.js,vendor/THREE-LICENSE.txt}. Three.js MIT notice is retained. No new npm dependencies.

Run the existing frontend/backend commands or Docker deployment as before. Next.js serves the bundled static module automatically.
