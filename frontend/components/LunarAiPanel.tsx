"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";

type Message = { role: "user" | "model"; text: string };

export default function LunarAiPanel({ context, onClose }: { context: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    input.current?.focus();
    return () => pending.current?.abort();
  }, []);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || pending.current) return;
    const next: Message[] = [...messages.slice(-8), { role: "user", text }];
    const controller = new AbortController();
    pending.current = controller;
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
      setMessages([...next, { role: "model", text: data.answer }]);
      setQuestion("");
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section id="lunar-ai-popover" className="news-sidebar news-popover panel glass lunar-ai-popover"
      aria-label="Lunar AI" onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}>
      <div className="panel-heading">
        <h2>Lunar AI</h2>
        <button type="button" className="news-minimize" aria-label="Close Lunar AI" onClick={onClose}><X size={17} /></button>
      </div>
      <p>Ask about your landing assessment or mission plan. Your question and available mission summary are sent to Google Gemini.</p>
      <div role="log" aria-label="Conversation">
        {messages.map((message, index) => (
          <p key={index}><strong>{message.role === "user" ? "You" : "Lunar AI"}</strong><br />{message.text}</p>
        ))}
      </div>
      <form onSubmit={send}>
        <label htmlFor="lunar-ai-question">Your question</label>
        <textarea ref={input} id="lunar-ai-question" rows={2} maxLength={2000}
          value={question} onChange={(event) => setQuestion(event.target.value)} readOnly={busy} required />
        <button type="submit" className="button primary" disabled={busy || !question.trim()}>{busy ? "Thinking…" : "Send"}</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
