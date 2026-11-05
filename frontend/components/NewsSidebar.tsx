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
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(Math.max(lo, hi), n));
export default function NewsSidebar() {
  const [feed, setFeed] = useState<Feed | null>(null),
    [loading, setLoading] = useState(false),
    [open, setOpen] = useState<Article | null>(null);
  const [panelOpen, setPanelOpen] = useState(false),
    [position, setPosition] = useState<{ x: number; y: number } | null>(null),
    [viewport, setViewport] = useState({ width: 0, height: 0 });
  const launcher = useRef<HTMLButtonElement>(null),
    suppressClick = useRef(false);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  useEffect(() => {
    const resize = () => {
      setViewport({
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
      });
      setPosition((p) =>
        p
          ? {
              x: clamp(p.x, 12, document.documentElement.clientWidth - 68),
              y: clamp(p.y, 12, window.innerHeight - 68),
            }
          : null,
      );
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
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
  const width = viewport.width || 1024,
    height = viewport.height || 768;
  const icon = position ?? { x: width - 80, y: height - 156 };
  const panelWidth = Math.min(380, width - 24),
    panelHeight = Math.min(520, height - 100);
  const panelStyle = {
    width: panelWidth,
    maxHeight: panelHeight,
    left: clamp(
      icon.x > width / 2 ? icon.x + 56 - panelWidth : icon.x,
      12,
      width - panelWidth - 12,
    ),
    top: clamp(
      icon.y > height / 2 ? icon.y - panelHeight - 12 : icon.y + 68,
      12,
      height - panelHeight - 12,
    ),
  };
  return (
    <>
      <button
        ref={launcher}
        className="news-launcher"
        aria-label={panelOpen ? "Close Lunar Dispatch" : "Open Lunar Dispatch"}
        title="Lunar Dispatch · drag to move"
        aria-expanded={panelOpen}
        aria-controls="lunar-news-popover"
        style={
          position
            ? {
                left: position.x,
                top: position.y,
                right: "auto",
                bottom: "auto",
              }
            : undefined
        }
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          suppressClick.current = false;
          const r = e.currentTarget.getBoundingClientRect();
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: r.left,
            top: r.top,
            moved: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start) return;
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5)
            start.moved = true;
          if (start.moved)
            setPosition({
              x: clamp(
                start.left + e.clientX - start.x,
                12,
                document.documentElement.clientWidth - 68,
              ),
              y: clamp(
                start.top + e.clientY - start.y,
                12,
                window.innerHeight - 68,
              ),
            });
        }}
        onPointerUp={(e) => {
          suppressClick.current = drag.current?.moved ?? false;
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
          suppressClick.current = false;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onClick={(e) => {
          if (e.detail > 0 && suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          setPanelOpen((v) => !v);
          setOpen(null);
        }}
        onKeyDown={(e) => {
          const delta = 10;
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setPosition({
              x: clamp(
                r.left +
                  (e.key === "ArrowRight"
                    ? delta
                    : e.key === "ArrowLeft"
                      ? -delta
                      : 0),
                12,
                document.documentElement.clientWidth - 68,
              ),
              y: clamp(
                r.top +
                  (e.key === "ArrowDown"
                    ? delta
                    : e.key === "ArrowUp"
                      ? -delta
                      : 0),
                12,
                window.innerHeight - 68,
              ),
            });
          }
        }}
      >
        <Newspaper size={22} />
        <span className="sr-only">
          Drag to move, or use arrow keys when focused.
        </span>
      </button>
      {panelOpen && (
        <aside
          id="lunar-news-popover"
          className="news-sidebar news-popover panel glass"
          aria-label="Lunar exploration news"
          style={panelStyle}
        >
          <div className="panel-heading">
            <div>
              <h2>
                <Newspaper size={17} /> Lunar dispatch
              </h2>
              <p>Moon exploration · NASA sources</p>
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
