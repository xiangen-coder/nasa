"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Moon } from "lucide-react";
import { validRecord, type SearchRecord } from "../lib/search-record";

type Saved = {
  id: string;
  name: string;
  payload: SearchRecord;
  created_at: string;
};
type Action = "login" | "signup" | "reset" | "update-password";
const labels = {
  login: "Login",
  signup: "Sign Up",
  reset: "Send recovery email",
  "update-password": "Update password",
};

function LunarMark() {
  return (
    <span className="lunar-auth-mark" aria-hidden="true">
      <Moon strokeWidth={1} />
    </span>
  );
}

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
  onUsernameChange,
}: {
  record: SearchRecord;
  onRestore: (record: SearchRecord) => void;
  onUsernameChange: (username: string | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
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
    onUsernameChange(account.user?.username ?? null);
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
    if (formAction === "signup" && password !== confirmation) {
      setError("Passwords must match.");
      setMessage("");
      return;
    }
    void run(async () => {
      const data = await api("", "POST", {
        action: formAction,
        email,
        password,
        ...(formAction === "signup" ? { username: username.trim() } : {}),
      });
      setPassword("");
      setConfirmation("");
      setAction("login");
      setMessage(data.message);
      await refresh();
    });
  }
  const recovery = action === "update-password" && !!user;
  const formAction = action === "update-password" && !user ? "reset" : action;
  function changeAction(next: Action) {
    setAction(next);
    setPassword("");
    setConfirmation("");
    setMessage("");
    setError("");
  }
  const feedback = (
    <>
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
    </>
  );

  if (!user || recovery) {
    return (
      <section className="lunar-auth" aria-label="Lunar account">
        <div className="lunar-auth-intro">
          <LunarMark />
          <h1>
            Find your place
            <br />
            on the <em>Moon.</em>
          </h1>
          <p>Save and reopen your lunar mission searches.</p>
        </div>
        <div className="lunar-auth-card">
          <header>
            <LunarMark />
            <span className="lunar-auth-wordmark">LUNAR</span>
            <h2>
              {recovery
                ? "New password"
                : formAction === "reset"
                  ? "Reset password"
                  : "Your profile"}
            </h2>
            <p>
              {formAction === "reset"
                ? "Enter your email to receive a recovery link."
                : "A little introduction, under the same sky."}
            </p>
          </header>
          {(formAction === "login" || formAction === "signup") && (
            <div
              className="lunar-auth-switch"
              role="group"
              aria-label="Account action"
            >
              <button
                type="button"
                aria-pressed={formAction === "signup"}
                disabled={busy}
                onClick={() => changeAction("signup")}
              >
                Sign Up
              </button>
              <button
                type="button"
                aria-pressed={formAction === "login"}
                disabled={busy}
                onClick={() => changeAction("login")}
              >
                Login
              </button>
            </div>
          )}
          {feedback}
          <form className="lunar-auth-form" onSubmit={submit}>
            {formAction === "signup" && (
              <label>
                Username
                <input
                  autoComplete="nickname"
                  required
                  minLength={2}
                  maxLength={32}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
            )}
            {!recovery && (
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            )}
            {formAction !== "reset" && (
              <label>
                {recovery ? "New password" : "Password"}
                <input
                  type="password"
                  autoComplete={
                    formAction === "login" ? "current-password" : "new-password"
                  }
                  minLength={8}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            )}
            {formAction === "signup" && (
              <label>
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  maxLength={128}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
            )}
            <button type="submit" className="lunar-auth-submit" disabled={busy}>
              {labels[formAction]}
            </button>
            {formAction === "login" && (
              <button
                type="button"
                className="lunar-auth-link"
                disabled={busy}
                onClick={() => changeAction("reset")}
              >
                Forgot password?
              </button>
            )}
            {formAction === "reset" && (
              <button
                type="button"
                className="lunar-auth-link"
                disabled={busy}
                onClick={() => changeAction("login")}
              >
                Back to login
              </button>
            )}
          </form>
          {busy && <small role="status">Connecting to your account…</small>}
        </div>
      </section>
    );
  }
  return (
    <section
      className="panel account-panel"
      aria-label="Account and saved searches"
    >
      <h2>Saved searches</h2>
      <p>
        Save a site, mission window, and chosen alternatives, then reopen the
        same inputs on another device.
      </p>
      {feedback}
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
              onUsernameChange(null);
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
              {r.payload.mission.name} · {r.payload.mission.start.slice(0, 10)}{" "}
              to {r.payload.mission.end.slice(0, 10)} UTC
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
                  setSaved((items) => items.filter((item) => item.id !== r.id));
                })
              }
            >
              Delete
            </button>
          </div>
        </article>
      ))}
      {busy && <small role="status">Connecting to your account…</small>}
    </section>
  );
}
