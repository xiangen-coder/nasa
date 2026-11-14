"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  ChevronDown,
  Moon,
  Orbit,
  Rocket,
  Settings,
  X,
  UserRound,
  LogOut,
  FlaskConical,
} from "lucide-react";
import { accountApi } from "../lib/account-api";
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
  { view: 5, label: "3D observatory", icon: Orbit, detail: "Earth-to-Moon journey & NASA positions" },
  { view: 16, label: "Mission planner", icon: Rocket, detail: "Vehicle worksheet & launch weather" },
  { view: 4, label: "Lunar mission archive", icon: Archive, detail: "Historical missions & documented 3D paths" },
  { view: 12, label: "Mission lab", icon: FlaskConical, detail: "Scenarios, equipment & classroom activities" },
];

const educationLinks = [
  { label: "Explore", heading: "school-moon-title" },
  { label: "Experiments", heading: "school-lab-title" },
  { label: "Landing Challenge", heading: "school-challenge-title" },
  { label: "Quiz", heading: "school-quiz-title" },
] as const;

export default function Navigation({
  view,
  education,
  accountName,
  onLogout,
  onNavigate,
  preferences,
  onPreferences,
}: {
  view: number;
  education: boolean;
  accountName?: string | null;
  onLogout: () => void;
  onNavigate: (view: number) => void;
  preferences: Preferences;
  onPreferences: (value: Preferences) => void;
}) {
  const [more, setMore] = useState(false);
  const [educationSection, setEducationSection] = useState<string>(educationLinks[0].heading);
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const accountMenu = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setAccountOpen(false);
    setLogoutError("");
  }, [view]);
  async function logout() {
    setLogoutPending(true);
    setLogoutError("");
    try {
      await accountApi("", "POST", { action: "logout" });
      setAccountOpen(false);
      onLogout();
      accountButton.current?.focus();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Could not log out. Try again.");
    } finally {
      setLogoutPending(false);
    }
  }
  const dropdown = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const settings = useRef<HTMLDialogElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!dropdown.current?.contains(e.target as Node)) setMore(false);
      if (!accountMenu.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const navigate = (next: number) => {
    setMore(false);
    setAccountOpen(false);
    setEducationSection(educationLinks[0].heading);
    onNavigate(next);
  };
  return (
    <header className="lunar-topbar">
      <a
        className="lunar-brand"
        href={education ? "#education" : "#search"}
        onClick={(e) => {
          e.preventDefault();
          navigate(education ? 14 : 7);
        }}
        aria-label="Lunar Navigator home"
      >
        <Moon size={27} strokeWidth={1.6} />
        <span>
          LUNAR<span className="brand-caption">A NEW PERSPECTIVE</span>
        </span>
      </a>
      {education ? (
        <nav className="nav-pill glass" aria-label="Education navigation">
          {educationLinks.map(({ label, heading }) => (
            <a
              key={heading}
              href="#education"
              aria-current={educationSection === heading ? "location" : undefined}
              onClick={(event) => {
                const target = document.querySelector("lunar-education")?.shadowRoot
                  ?.querySelector<HTMLElement>(`[id$="-${heading}"]`);
                if (!target) return;

                event.preventDefault();
                setEducationSection(heading);
                setAccountOpen(false);
                const headerHeight = event.currentTarget.closest("header")?.offsetHeight ?? 0;
                target.tabIndex = -1;
                target.focus({ preventScroll: true });
                window.scrollTo({
                  top: target.getBoundingClientRect().top + window.scrollY - headerHeight - 16,
                  behavior: preferences.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches
                    ? "smooth"
                    : "instant",
                });
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      ) : <nav className="nav-pill glass" aria-label="Main navigation">
        {[
          { label: "Configure", view: 7 },
          { label: "Compare", view: 11 },
          { label: "Result", view: 8 },
        ].map((item) => (
          <a
            key={item.view}
            href={`#${viewPaths[item.view]}`}
            aria-current={
              view === item.view || (item.view === 8 && view === 15)
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
            className={toolItems.some((item) => item.view === view) ? "active" : ""}
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
      </nav>}
      <div className="topbar-actions">
        <div className="header-mode-switch" role="group" aria-label="Experience mode">
          <button type="button" aria-pressed={!education} onClick={() => navigate(7)}>
            Professional
          </button>
          <button type="button" aria-pressed={education} onClick={() => navigate(14)}>
            Education
          </button>
        </div>
        <div className="header-account" ref={accountMenu} onKeyDown={(event) => {
          if (event.key === "Escape" && accountOpen) {
            event.stopPropagation();
            setAccountOpen(false);
            accountButton.current?.focus();
          }
        }}>
          <button
            ref={accountButton}
            type="button"
            className="header-login button subtle"
            aria-current={!accountName && view === 13 ? "page" : undefined}
            aria-expanded={accountName ? accountOpen : undefined}
            aria-controls={accountName && accountOpen ? "header-account-actions" : undefined}
            onClick={() => {
              if (accountName) {
                setMore(false);
                setAccountOpen(!accountOpen);
              } else {
                navigate(13);
              }
            }}
          >
            <span>{accountName ? `Hi, ${accountName}` : "Login"}</span>
            {accountName && <ChevronDown size={14} aria-hidden="true" />}
          </button>
          {accountName && accountOpen && (
            <div id="header-account-actions" className="header-account-menu">
              <button type="button" onClick={() => navigate(13)}>
                <UserRound size={17} aria-hidden="true" /> Account &amp; saved searches
              </button>
              <button type="button" className="header-logout" disabled={logoutPending} onClick={() => void logout()}>
                <LogOut size={17} aria-hidden="true" /> Log out
              </button>
            </div>
          )}
          {logoutError && <p className="header-account-error" role="alert">{logoutError}</p>}
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
