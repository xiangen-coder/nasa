"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowUp, ArrowUpRight, Info, Layers, MapPin, Minus, Route, SquarePen } from "lucide-react";

import Markdown from "react-markdown";

export function LunarSpacecraft({ size = 64 }: { size?: number }) {
  return <img src="/illustration/shortcut-ufo.webp" alt="" width={size} height={size} />;
}

type Message = { role: "user" | "model"; text: string };
const defaults = {
  contextLabel: "Journey + selected site",
  contextHelp: "When you send a question, Gemini receives the recent conversation and available assessment details, including the selected site and mission window.",
  heading: "Understand your landing site",
  welcome: "Make sense of your landing site, one question at a time.",
  suggestions: ["Explain this journey", "What affects landing here?"] as const,
  placeholder: "Ask about this landing site…",
};

type Props = {
  context: string;
  signedIn: boolean;
  onSignIn: () => void;
  options?: Partial<Omit<typeof defaults, "suggestions">> & { suggestions?: readonly [string, string] };
};

export default function LunarAiPanel({ context, signedIn, onSignIn, options }: Props) {
  const copy = { ...defaults, ...options };
  const [minimized, setMinimized] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const pill = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const id = useId();
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => pending.current?.abort();
  }, []);

  useEffect(() => {
    if (minimized) pill.current?.focus();
    else input.current?.focus();
  }, [minimized]);

  useEffect(() => {
    if (scroll.current && started) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages, busy, error, started, minimized]);

  function reset() {
    pending.current?.abort();
    pending.current = null;
    setMessages([]);
    setQuestion("");
    setError("");
    setBusy(false);
    setStarted(false);
    input.current?.focus();
  }

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = question.trim();
    if (!signedIn || !text || pending.current) return;
    const next: Message[] = [...messages.slice(-8), { role: "user", text }];
    const controller = new AbortController();
    pending.current = controller;
    setStarted(true);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/lunar-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || typeof data.answer !== "string")
        throw new Error(data.error ?? "Lunar AI could not answer.");
      if (controller.signal.aborted) return;
      setMessages([...messages, next[next.length - 1], { role: "model", text: data.answer }]);
      setQuestion("");
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  if (minimized) return (
    <button className="lunar-ai-pill" ref={pill} type="button" onClick={() => setMinimized(false)}
      aria-label="Restore Lunar AI" title="Restore Lunar AI">
      <LunarSpacecraft />
    </button>
  );

  return (
    <section id="lunar-ai-popover" className="lunar-ai-companion" aria-label="Lunar AI"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setMinimized(true);
        }
      }}>
      <header className="lunar-ai-header">
        <span className="lunar-ai-spacecraft"><LunarSpacecraft size={38} /></span>
        <div><h2>Lunar AI</h2><p>Your mission, in context</p></div>
        <button type="button" aria-label="New conversation" title="New conversation" onClick={reset}><SquarePen size={16} /></button>
        <button type="button" aria-label="Minimize Lunar AI" title="Minimize Lunar AI" onClick={() => setMinimized(true)}><Minus size={17} /></button>
      </header>
      <div className="lunar-ai-context">
        <Layers size={15} aria-hidden="true" /><span>{copy.contextLabel}</span>
        <button type="button" aria-label="About shared context" title="About shared context"
          aria-expanded={contextOpen} aria-controls={id + "-context"} onClick={() => setContextOpen(!contextOpen)}>
          <Info size={15} />
        </button>
        {contextOpen && <p id={id + "-context"}>{copy.contextHelp}</p>}
      </div>
      <div className="lunar-ai-body" ref={scroll}>
        {!started ? (
          <>
            <p className="lunar-ai-eyebrow">A little guidance, a clearer path</p>
            <h3>{copy.heading}</h3>
            <p className="lunar-ai-welcome">{copy.welcome}</p>
            <div className="lunar-ai-suggestions">
              {copy.suggestions.map((suggestion, index) => {
                const Icon = index === 0 ? Route : MapPin;
                return <button type="button" key={suggestion} onClick={() => {
                  setQuestion(suggestion);
                  input.current?.focus();
                }}><Icon size={16} aria-hidden="true" />{suggestion}<ArrowUpRight size={14} aria-hidden="true" /></button>;
              })}
            </div>
          </>
        ) : (
          <>
            <div role="log" aria-label="Conversation" aria-live="polite">
              {messages.map((message, index) => (
                <article key={index} className={`lunar-ai-message lunar-ai-${message.role}`}>
                  <strong>{message.role === "user" ? "You" : "Lunar AI"}</strong>
                  {message.role === "model" ? <Markdown skipHtml disallowedElements={["img"]}>{message.text}</Markdown> : <p>{message.text}</p>}
                </article>
              ))}
              {(busy || error) && <article className="lunar-ai-message lunar-ai-user"><strong>You</strong><p>{question}</p></article>}
            </div>
            {busy && <p role="status">Lunar AI is thinking…</p>}
            {error && <div><p role="alert">{error}</p><button type="button" className="lunar-ai-retry"
              disabled={!signedIn || !question.trim()} onClick={() => void send()}>Retry</button></div>}
          </>
        )}
      </div>
      <form className="lunar-ai-composer" onSubmit={send}>
        <textarea ref={input} aria-label="Your question" placeholder={copy.placeholder} rows={2} maxLength={2000}
          value={question} onChange={(event) => setQuestion(event.target.value)} readOnly={busy}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }} />
        <div><small>Enter to send ↵</small><button type="submit" aria-label="Send question" title="Send question"
          disabled={!signedIn || busy || !question.trim()}><ArrowUp size={17} /></button></div>
      </form>
      <footer className="lunar-ai-footer">
        <p>Powered by Gemini · Check answers against source data.</p>
        {!signedIn && <button type="button" onClick={onSignIn}>Sign in to ask Lunar AI</button>}
      </footer>
    </section>
  );
}
