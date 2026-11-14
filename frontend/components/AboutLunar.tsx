import { ArrowRight, CalendarDays, Eye, Layers3, MapPin, RadioTower, Sun } from "lucide-react";

const challenges = [
  { Icon: Sun, title: "Extreme lighting", text: "Understand changing sunlight near the lunar south pole." },
  { Icon: RadioTower, title: "Communication windows", text: "Explore when Earth is visible above the local horizon." },
  { Icon: Layers3, title: "Complex tools", text: "Bring essential information into one intuitive experience." },
];

const features = [
  { Icon: MapPin, title: "Landing sites", text: "Explore and compare lunar south pole locations." },
  { Icon: CalendarDays, title: "Mission dates", text: "Test different mission dates to see how conditions change." },
  { Icon: Sun, title: "Solar power potential", text: "Understand illumination patterns and identify promising periods for solar power." },
  { Icon: Eye, title: "Direct-to-Earth visibility", text: "See when Earth is above the horizon to support communication planning." },
];

const steps = [
  { title: "Select a site", text: "Choose a lunar south pole location to explore." },
  { title: "Choose a date", text: "Pick a mission date to analyse conditions." },
  { title: "Compare Sun & Earth positions", text: "View Sun and Earth positions relative to the horizon." },
];

export default function AboutLunar({ onExplore, onResults }: { onExplore: () => void; onResults: () => void }) {
  return (
    <article className="about-lunar">
      <section className="about-lunar-hero" aria-labelledby="about-lunar-title">
        <div className="about-lunar-hero-copy">
          <p className="eyebrow">About Lunar</p>
          <h1 id="about-lunar-title">Explore landing sites.<br />Understand the possibilities.</h1>
          <p>Compare lunar south pole locations and mission dates through intuitive visualisations of sunlight and Earth visibility.</p>
          <div className="about-lunar-actions">
            <button className="button primary" onClick={onExplore}>Start exploring <ArrowRight size={17} /></button>
            <button className="button subtle" onClick={() => {
              const mission = document.getElementById("about-lunar-mission");
              mission?.focus({ preventScroll: true });
              mission?.scrollIntoView({ block: "start" });
            }}>Our mission</button>
          </div>
        </div>
        <small>Illustrative scene</small>
      </section>

      <div className="about-lunar-body">
        <section id="about-lunar-mission" tabIndex={-1} className="about-lunar-mission">
          <h2>Complex lunar science.<br className="about-lunar-mission-break" /> A clearer perspective.</h2>
          <p>We make lunar geometry easier to explore for mission planners, educators and the public.</p>
        </section>

        <section>
          <h2>The challenges of lunar exploration</h2>
          <ul className="about-lunar-challenges">
            {challenges.map(({ Icon, title, text }) => (
              <li className="about-lunar-card" key={title}>
                <Icon aria-hidden="true" />
                <div><h3>{title}</h3><p>{text}</p></div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Compare the conditions that matter</h2>
          <ul className="about-lunar-features">
            {features.map(({ Icon, title, text }) => (
              <li key={title}>
                <Icon aria-hidden="true" />
                <h3>{title}</h3><p>{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>How it works</h2>
          <ol className="about-lunar-steps">
            {steps.map(({ title, text }, index) => (
              <li className="about-lunar-card" key={title}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{title}</h3><p>{text}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="about-lunar-evidence about-lunar-card">
          <div className="about-lunar-terrain" aria-hidden="true" />
          <div className="about-lunar-evidence-copy">
            <h2>Evidence with context.</h2>
            <p>Explore Sun and Earth positions relative to the horizon to understand potential illumination and communication windows.</p>
            <p>Research visualisations support exploration. They do not establish landing safety or mission success.</p>
            <details>
              <summary>Data sources &amp; limitations</summary>
              <p>JPL Horizons and the existing SPICE workflow provide astronomical geometry. Regional LOLA, LROC and historical Diviner products support terrain and temperature evidence where coverage is available.</p>
              <p>The regional 20 m DEM screens finite horizons. The 5 m footprint product has limited coverage. Apollo LM screening uses historical assumptions. Research scores and reference-sphere visibility use distinct models. Diversion fuel feasibility and landing safety require independent assessment.</p>
              <div className="about-lunar-actions">
                <a href="https://github.com/xiangen-coder/nasa/blob/public-preview/docs/WIDE_TERRAIN.md">Terrain methods &amp; coverage</a>
                <a href="https://ssd-api.jpl.nasa.gov/doc/horizons.html">JPL Horizons</a>
                <button className="text-button" onClick={onResults}>Review assessment &amp; provenance <ArrowRight size={15} /></button>
              </div>
            </details>
          </div>
        </section>

        <section className="about-lunar-team">
          <p className="eyebrow">From Sarawak. Exploring beyond.</p>
          <h2>Meet Road to 10000.</h2>
          <div className="about-lunar-wordmark" aria-hidden="true">Road to<strong>10000</strong></div>
          <div className="about-lunar-team-main">
            <p>We are first-year students at <strong>Universiti Teknologi PETRONAS</strong>, bringing together Electrical and Electronic Engineering (EEE), Mechanical Engineering (ME), and Computer Science (CS).</p>
            <p>Our different backgrounds shape how we approach a shared question: how can complex lunar data become easier to explore and understand? Through LUNAR, we combine engineering thinking, computing and clear design to make lunar research more accessible.</p>
          </div>
          <p className="about-lunar-team-highlight">Different disciplines. All from Sarawak.</p>
        </section>

        <section className="about-lunar-cta">
          <h2>A new perspective starts with a question.</h2>
          <button className="button primary" onClick={onExplore}>Start exploring <ArrowRight size={17} /></button>
        </section>
      </div>
    </article>
  );
}
