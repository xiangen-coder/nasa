"use client";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Minus, Newspaper, RefreshCw, X } from "lucide-react";
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
export default function NewsSidebar() {
  const [feed, setFeed] = useState<Feed | null>(null),
    [loading, setLoading] = useState(true),
    [open, setOpen] = useState<Article | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    origin: { x: number; y: number };
    bounds: DOMRect;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/news", {
          signal: controller.signal,
        });
        if (!response.ok) throw Error();
        setFeed(await response.json());
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
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);
  return (
    <aside
      className={`news-sidebar panel glass ${minimized ? "minimized" : ""}`}
      aria-label="Lunar exploration news"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      <div
        className="panel-heading news-drag-handle"
        onPointerDown={(e) => {
          if (
            (e.target as HTMLElement).closest("button") ||
            window.innerWidth < 700
          )
            return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            origin: offset,
            bounds: e.currentTarget.parentElement!.getBoundingClientRect(),
          };
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start) return;
          setOffset({
            x:
              start.origin.x +
              Math.max(
                -start.bounds.left + 12,
                Math.min(
                  window.innerWidth - start.bounds.right - 12,
                  e.clientX - start.x,
                ),
              ),
            y:
              start.origin.y +
              Math.max(
                80 - start.bounds.top,
                Math.min(
                  window.innerHeight - 60 - start.bounds.top,
                  e.clientY - start.y,
                ),
              ),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div>
          <h2>
            <Newspaper size={17} /> Lunar dispatch
          </h2>
          <p>Moon exploration · NASA sources</p>
        </div>
        <span
          className={`news-state ${feed?.status === "stale" ? "stale" : ""}`}
        >
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
          aria-label={
            minimized ? "Expand Lunar Dispatch" : "Minimize Lunar Dispatch"
          }
          aria-expanded={!minimized}
          onClick={() => setMinimized(!minimized)}
        >
          {minimized ? <Newspaper size={17} /> : <Minus size={17} />}
        </button>
      </div>
      {!minimized && (
        <>
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
        </>
      )}
    </aside>
  );
}
