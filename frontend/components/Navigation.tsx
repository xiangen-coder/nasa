"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Archive,
  ArrowUpRight,
  ChevronDown,
  Compass,
  FileText,
  Layers,
  Moon,
  Orbit,
  Rocket,
  Settings,
  SlidersHorizontal,
  X,
  UserRound,
  FlaskConical,
} from "lucide-react";
import PreferencesControls, { type Preferences } from "./Preferences";

export const viewPaths = [
  "map-explorer",
  "horizon-simulator",
  "terrain-analysis",
  "site-comparison",
  "mission-archive",
  "3d-observatory",
  "reserved",
  "search",
  "result",
  "about",
  "settings",
  "pre-results",
  "mission-lab",
  "account",
  "education",
  "mission-report",
  "mission-planner",
];
export const toolItems = [
  { view: 0, label: "Map explorer", icon: Compass, detail: "Coordinates & geographic references" },
  { view: 15, label: "Mission report", icon: FileText, detail: "Current Result evidence & exports" },
  { view: 5, label: "3D observatory", icon: Orbit, detail: "NASA positions & computed local sky" },
  { view: 16, label: "Mission planner", icon: Rocket, detail: "Vehicle worksheet & launch weather" },
  { view: 4, label: "Lunar mission archive", icon: Archive, detail: "Historical missions & documented 3D paths" },
  { view: 12, label: "Mission lab", icon: FlaskConical, detail: "Scenarios, equipment & classroom activities" },
  { view: 13, label: "Account & saved searches", icon: UserRound, detail: "Sign in to save and reopen your searches" },
  {
    view: 11,
    label: "Pre-result comparison",
    icon: Layers,
    detail: "Choose up to two alternatives",
  },
  {
    view: 1,
    label: "Horizon simulator",
    icon: Activity,
    detail: "Sun, Earth & time playback",
  },
  {
    view: 2,
    label: "Terrain analysis",
    icon: Layers,
    detail: "Elevation, slope & obstructions",
  },
  {
    view: 3,
    label: "Site comparison",
    icon: SlidersHorizontal,
    detail: "Alternatives & weighted ranking",
  },
];

export default function Navigation({
  view,
  education,
  onNavigate,
  health,
  preferences,
  onPreferences,
}: {
  view: number;
  education: boolean;
  onNavigate: (view: number) => void;
  health: string;
  preferences: Preferences;
  onPreferences: (value: Preferences) => void;
}) {
  const [more, setMore] = useState(false);
  const dropdown = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const settings = useRef<HTMLDialogElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!dropdown.current?.contains(e.target as Node)) setMore(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const navigate = (next: number) => {
    setMore(false);
    onNavigate(next);
  };
  return (
    <header className="lunar-topbar">
      <a
        className="lunar-brand"
        href="#search"
        onClick={(e) => {
          e.preventDefault();
          navigate(7);
        }}
        aria-label="Lunar Navigator home"
      >
        <Moon size={27} strokeWidth={1.6} />
        <span>
          LUNAR<span className="brand-caption">A NEW PERSPECTIVE</span>
        </span>
      </a>
      <nav className="nav-pill glass" aria-label="Main navigation">
        {[
          { label: "Configure", view: education ? 14 : 7 },
          { label: "Compare", view: 11 },
          { label: "Result", view: 8 },
        ].map((item) => (
          <a
            key={item.view}
            href={`#${viewPaths[item.view]}`}
            aria-current={
              view === item.view
                ? "page"
                : undefined
            }
            onClick={(e) => {
              e.preventDefault();
              navigate(item.view);
            }}
          >
            {item.label}
          </a>
        ))}
        <div
          className="more-menu-wrap"
          ref={dropdown}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setMore(false);
              moreButton.current?.focus();
            }
            const buttons = [
              ...(dropdown.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ) || []),
            ];
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              setMore(true);
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? buttons.length - 1
                    : (index +
                        (e.key === "ArrowDown" ? 1 : -1) +
                        buttons.length) %
                      buttons.length;
              requestAnimationFrame(() => buttons[next]?.focus());
            }
          }}
        >
          <button
            ref={moreButton}
            className={toolItems.some((item) => item.view === view) && view !== 11 ? "active" : ""}
            aria-haspopup="menu"
            aria-expanded={more}
            aria-controls="more-tools"
            onClick={() => setMore(!more)}
          >
            More <ChevronDown size={14} className={more ? "rotated" : ""} />
          </button>
          <div
            className="more-menu"
            id="more-tools"
            role="menu"
            aria-label="More tools"
            hidden={!more}
          >
            <span className="menu-caption">THE MISSION WORKSPACE</span>
            {toolItems.map(({ view: next, label, icon: Icon, detail }) => (
              <button
                key={next}
                role="menuitem"
                aria-current={view === next ? "page" : undefined}
                onClick={() => navigate(next)}
              >
                <Icon size={18} />
                <span>
                  {label}
                  <small>{detail}</small>
                </span>
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        </div>
        <a
          href="#about"
          aria-current={view === 9 ? "page" : undefined}
          onClick={(e) => {
            e.preventDefault();
            navigate(9);
          }}
        >
          About Us
        </a>
      </nav>
      <div className="topbar-actions">
        <div className="header-mode-switch" role="group" aria-label="Experience mode">
          <button type="button" aria-pressed={!education} onClick={() => navigate(7)}>
            Professional
          </button>
          <button type="button" aria-pressed={education} onClick={() => navigate(14)}>
            Education
          </button>
        </div>
        <div className="system-state">
          <span
            className={health === "SPICE online" ? "live-dot" : "offline-dot"}
          />
          {health}
        </div>
        <button
          ref={settingsButton}
          className="settings-trigger glass"
          aria-label="Open settings"
          onClick={() => settings.current?.showModal()}
        >
          <Settings size={19} />
        </button>
      </div>
      <dialog
        className="settings-dialog glass"
        ref={settings}
        aria-labelledby="settings-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) settings.current?.close();
        }}
        onClose={() => settingsButton.current?.focus()}
      >
        <div className="dialog-heading">
          <h2 id="settings-title">Make it your own.</h2>
          <button
            className="round-button"
            aria-label="Close settings"
            onClick={() => settings.current?.close()}
          >
            <X size={19} />
          </button>
        </div>
        <PreferencesControls value={preferences} onChange={onPreferences} />
        <button
          className="text-button"
          onClick={() => {
            settings.current?.close();
            navigate(10);
          }}
        >
          All preferences <ArrowUpRight size={14} />
        </button>
      </dialog>
    </header>
  );
}
