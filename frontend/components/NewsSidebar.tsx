"use client";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Newspaper, RefreshCw, X } from "lucide-react";
type Article = {
  title: string;
  summary: string;
  url: string;
  published_at: string;
  source: string;
};
type Feed = {
  status: string;
  articles: Article[];
  fetched_at: string | null;
  message: string;
  warnings?: string[];
};
const canadianRoverData = "https://data.asc-csa.gc.ca/dataset/9151430-4v0p-4t5c-468vnhj714ao64";

function ShortcutArt({ label, illustration }: { label: string; illustration: "ufo" | "moon" }) {
  return (
    <>
      <span className="lunar-shortcut-label">{label}</span>
      <img src={`/illustration/shortcut-${illustration}.webp`} alt="" width={64} height={64} />
    </>
  );
}

export default function NewsSidebar() {
  const [feed, setFeed] = useState<Feed | null>(null),
    [loading, setLoading] = useState(false),
    [open, setOpen] = useState<Article | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!panelOpen) return;
    const controller = new AbortController();
    const update = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/news", {
          signal: controller.signal,
        });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!controller.signal.aborted) setFeed(data);
      } catch {
        if (!controller.signal.aborted)
          setFeed({
            status: "unavailable",
            articles: [],
            fetched_at: null,
            message:
              "News service unavailable. No substitute headlines are shown.",
          });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void update();
    const timer = window.setInterval(update, 15 * 60 * 1000);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanelOpen(false);
        setOpen(null);
        launcher.current?.focus();
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("keydown", escape);
    };
  }, [panelOpen]);
  return (
    <>
      <div className="lunar-shortcuts">
        <div className="lunar-shortcut-placeholder">
          <ShortcutArt label="Ask Lunar AI" illustration="ufo" />
        </div>
        <button
          type="button"
          ref={launcher}
          className="news-launcher"
          aria-expanded={panelOpen}
          aria-controls="lunar-news-popover"
          onClick={() => {
            setPanelOpen((value) => !value);
            setOpen(null);
          }}
        >
          <ShortcutArt label="Moon news" illustration="moon" />
        </button>
      </div>
      {panelOpen && (
        <aside
          id="lunar-news-popover"
          className="news-sidebar news-popover panel glass"
          aria-label="Lunar exploration news"
        >
          <div className="panel-heading">
            <div>
              <h2>
                <Newspaper size={17} /> Lunar dispatch
              </h2>
              <p>Moon exploration news &amp; data</p>
            </div>
            <span className="news-state">
              {loading ? (
                <RefreshCw size={12} className="spin" />
              ) : feed?.status === "live" ? (
                "RSS"
              ) : (
                "OFFLINE"
              )}
            </span>
            <button
              className="news-minimize"
              aria-label="Close news panel"
              onClick={() => {
                setPanelOpen(false);
                setOpen(null);
                launcher.current?.focus();
              }}
            >
              <X size={17} />
            </button>
          </div>
          <div
            className="news-inner"
            style={{ display: open ? "none" : undefined }}
          >
            <article className="news-card">
              <span>Canadian Space Agency · Open data</span>
              <h3>Lunar rover field-test data</h3>
              <p>Imagery, LiDAR and rover position estimates from a simulated lunar mission in a Québec quarry.</p>
              <a className="text-button" href={canadianRoverData} target="_blank" rel="noreferrer">
                Open CSA dataset <ExternalLink size={12} aria-hidden="true" />
              </a>
            </article>
            {loading && !feed ? (
              <p role="status">Checking source feeds…</p>
            ) : (
              <>
                <p className="news-disclosure">
                  {feed?.status === "stale"
                    ? "Cached headlines · live refresh failed."
                    : feed?.message}
                </p>
                {feed?.fetched_at && (
                  <p className="news-timestamp">
                    Retrieved{" "}
                    {new Date(feed.fetched_at).toLocaleString(undefined, {
                      timeZoneName: "short",
                    })}
                    {feed.status === "stale" ? " · STALE" : ""}
                  </p>
                )}
                {feed?.warnings?.map((w) => (
                  <p className="news-warning" key={w}>
                    {w}
                  </p>
                ))}
                {feed?.articles?.length ? (
                  feed.articles.map((article) => (
                    <article className="news-card" key={article.url}>
                      <span>
                        {article.source}{" "}
                        <span>
                          ·{" "}
                          {new Date(article.published_at).toLocaleDateString(
                            undefined,
                            { day: "numeric", month: "short", year: "numeric" },
                          )}
                        </span>
                      </span>
                      <h3>
                        <button onClick={() => setOpen(article)}>
                          {article.title}
                        </button>
                      </h3>
                      <p>
                        {article.summary.slice(0, 150)}
                        {article.summary.length > 150 ? "…" : ""}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setOpen(article)}
                      >
                        Read summary →
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="news-empty">
                    <Newspaper size={28} />
                    <p>
                      {feed?.status === "live"
                        ? "No lunar stories appeared in the current feed window."
                        : "Live news needs access to NASA’s feeds. Your scientific calculations still work offline."}
                    </p>
                  </div>
                )}
                <a
                  className="text-button"
                  href="https://www.nasa.gov/missions/artemis/"
                  target="_blank"
                  rel="noreferrer"
                >
                  NASA Artemis coverage <ExternalLink size={12} />
                </a>
              </>
            )}
          </div>
          {open && (
            <div
              className="news-reader"
              role="region"
              aria-label="Article summary"
            >
              <button
                className="reader-close"
                aria-label="Close article summary"
                onClick={() => setOpen(null)}
              >
                <X size={17} />
              </button>
              <span className="section-label">
                {open.source} · FEED EXCERPT
              </span>
              <h3>{open.title}</h3>
              <p>{open.summary || "This source did not provide a summary."}</p>
              <p className="muted">
                This is the source’s RSS excerpt, not the complete article or an
                AI summary.
              </p>
              <a
                className="button subtle"
                href={open.url}
                target="_blank"
                rel="noreferrer"
              >
                Read full story at NASA <ExternalLink size={13} />
              </a>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
