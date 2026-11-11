# Canva reference refinement — 6 November 2026

Reference: https://www.canva.com/design/DAHaAiahIgc/QljwJ-sg24W1YAOPzMOP0w/view

Inspected the current shared design through the Canva connector and interactive preview. Adapted the navy glass-panel search layout and Result dashboard to the existing Next.js frontend. The search form now spans the page, with a centred pill action and coordinated input panels. Both UTC start and end time controls are preserved. Existing news remains available below the form. Result uses a large visibility panel beside four compact cards, followed by research score and assessment guidance.

The reference's illustrative launch placeholder and example percentages are replaced with the existing real Horizons observation series and factor scores. The overview chart renders Sun/Earth elevations and available terrain skyline thresholds; missing skyline data stays missing. UTC timeline, unavailable footprint terrain, evidence weight, missing factors and independent constraint failures remain visible. Factor calculations, backend endpoints, NASA registry, spacecraft assumptions and existing full evidence panel are unchanged.

The existing cinematic spacecraft/Earth renderer, models, motion controls, wall-clock animation and reduced-motion handling are preserved without editing their files. No new dependencies.

Files: new `frontend/app/canva-reference.css`; modified `frontend/app/layout.tsx` (load scoped refinement last), `frontend/components/ResearchOverview.tsx`; this guide. Other tools retain their existing styling and functionality.

Validation: TypeScript and changed-source ESLint passed. Desktop 1440 px and phone 390 px checked, with phone document width 375 px matching its available viewport. Search controls, centred action and Result cards fit without horizontal overflow. Real research evaluation rendered sunlight 92.86%, Earth visibility 69.05%, score 78.96 provisional, available weight 60%, missing T/I, and four chart paths. Chart size on phone was 300 × 230 px. Observatory navigation and return retained the result. Actual renderer time advanced from 3.69 to 10.62 seconds; Pause/Play changed the visible motion status correctly. Empty/loading states display no fabricated scores.
