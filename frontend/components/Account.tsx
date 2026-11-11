"use client";

import { useEffect, useState, type FormEvent } from "react";
import { validRecord, type SearchRecord } from "../lib/search-record";

type Saved = {
  id: string;
  name: string;
  payload: SearchRecord;
  created_at: string;
};
type Action = "login" | "signup" | "reset" | "update-password";
const labels = {
  login: "Sign in",
  signup: "Create account",
  reset: "Send recovery email",
  "update-password": "Update password",
};

async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/account${path}`, {
    method,
    cache: "no-store",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The account request failed.");
  return data;
}

export default function Account({
  record,
  onRestore,
}: {
  record: SearchRecord;
  onRestore: (record: SearchRecord) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [action, setAction] = useState<Action>("login");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const account = await api("");
    setUser(account.user);
    setSaved(
      account.user
        ? (await api("/history")).records.filter((r: Saved) =>
            validRecord(r.payload),
          )
        : [],
    );
  }
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("recovery")) setAction("update-password");
    if (url.searchParams.has("auth_error"))
      setError(
        "The email link expired or was opened in a different browser. Request a new link here.",
      );
    url.searchParams.delete("recovery");
    url.searchParams.delete("auth_error");
    history.replaceState(null, "", url);
    void refresh()
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, []);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const data = await api("", "POST", {
        action: formAction,
        email,
        password,
      });
      setPassword("");
      setAction("login");
      setMessage(data.message);
      await refresh();
    });
  }
  const recovery = action === "update-password" && !!user;
  const formAction = action === "update-password" && !user ? "reset" : action;
  return (
    <section
      className="panel account-panel"
      aria-label="Account and saved searches"
    >
      <h2>{user && !recovery ? "Saved searches" : "Your Lunar account"}</h2>
      <p>
        Save a site, mission window, and chosen alternatives, then reopen the
        same inputs on another device.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="info" role="status">
          {message}
        </p>
      )}
      {!user || recovery ? (
        <form className="account-form" onSubmit={submit}>
          {!recovery && (
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {formAction !== "reset" && (
            <label>
              {recovery ? "New password" : "Password"}
              <input
                type="password"
                autoComplete={
                  action === "login" ? "current-password" : "new-password"
                }
                minLength={8}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <div className="account-actions">
            <button className="button primary" disabled={busy}>
              {labels[formAction]}
            </button>
            {!recovery &&
              (action === "login" ? (
                <>
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() => setAction("signup")}
                  >
                    Create account
                  </button>
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() => setAction("reset")}
                  >
                    Forgot password?
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button subtle"
                  onClick={() => setAction("login")}
                >
                  Back to sign in
                </button>
              ))}
          </div>
        </form>
      ) : (
        <>
          <div className="account-actions">
            <p>
              Signed in as <strong>{user.email}</strong>
            </p>
            <button
              className="button subtle"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api("", "POST", { action: "logout" });
                  setUser(null);
                  setSaved([]);
                })
              }
            >
              Sign out
            </button>
          </div>
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api("/history", "POST", {
                  name: name.trim() || record.mission.name.slice(0, 80),
                  payload: record,
                });
                setName("");
                setMessage("Search saved to your account.");
                await refresh();
              });
            }}
          >
            <label>
              Save current search: {record.mission.name}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Name (optional)"
              />
            </label>
            <div className="account-actions">
              <button
                className="button primary"
                disabled={busy || !validRecord(record)}
              >
                Save search
              </button>
            </div>
          </form>
          {saved.length === 0 && !busy && <p>No saved searches yet.</p>}
          {saved.map((r) => (
            <article key={r.id} className="saved-search">
              <div>
                <strong>{r.name}</strong>
                <br />
                <small>
                  {r.payload.mission.name} ·{" "}
                  {r.payload.mission.start.slice(0, 10)} to{" "}
                  {r.payload.mission.end.slice(0, 10)} UTC
                </small>
              </div>
              <div className="account-actions">
                <button
                  className="button subtle"
                  disabled={busy}
                  onClick={() => onRestore(r.payload)}
                >
                  Open search
                </button>
                <button
                  className="button subtle"
                  disabled={busy}
                  aria-label={`Delete ${r.name}`}
                  onClick={() =>
                    void run(async () => {
                      await api(`/history?id=${r.id}`, "DELETE");
                      setSaved((items) =>
                        items.filter((item) => item.id !== r.id),
                      );
                    })
                  }
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </>
      )}
      {busy && <small role="status">Connecting to your account…</small>}
    </section>
  );
}
