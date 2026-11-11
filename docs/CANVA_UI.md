# Lunar glass UI integration

Visual reference supplied by the user: https://www.canva.com/design/DAHaAiahIgc/QljwJ-sg24W1YAOPzMOP0w/view . This updates the existing Next.js website rather than embedding the Canva prototype or replacing the scientific backend.

The navy star field, serif hero, pill navigation and glass search controls are in `app/canva-theme.css` and `components/SearchConsole.tsx`. The opening Moon has since been replaced by the cinematic spacecraft concept in `components/CinematicHero.tsx` and `app/cinematic-hero.css`; see CINEMATIC_HERO.md. The existing `app/page.tsx` owns the shared selection and mission window. The theme is loaded after the existing stylesheet; the archive iframe receives equivalent scoped colors through its existing integration stylesheet.

Search returns to the coordinate form; Result scrolls to the NASA landing research panel; Alternative opens the existing comparison workspace. About Us opens a native keyboard-accessible dialog. The workspace drawer retains all six tools, Simple/Full detail preferences and the news setting. Lunar Dispatch is also available as a floating button. The drawer supports Escape, keyboard focus trapping and focus restoration on desktop and mobile.

Go uses the existing research evaluation with the selected dates, explicit UTC departure/return times, coordinates, interval and Earth clearance. There is no simulated assessment or new backend scoring algorithm. Priority highlights the chosen terrain, sunlight or communication factor; it does not alter the fixed five-factor scoring weights or silently change safety limits. The existing reference-sphere SPICE calculation remains available separately. Both calculation flows use the shared UTC times; loading a precomputed example restores its midnight times.

The opening scene is an illustration, separate from the actual Sun–Earth–Moon observatory. It reuses the installed Three.js and a lightweight version of the existing Earth model, with explicit pause and reduced-motion support. No package was added.

Verification includes TypeScript, ESLint, desktop and 390 px phone checks, real NASA terrain-screened evaluation with a non-midnight start, fixed-weight priority highlighting, comparison navigation, About dialog Escape and observatory access. SVG-only screen coordinates are rounded to six decimals to avoid server/browser trigonometric hydration mismatches; scientific coordinates are unchanged.
