"use client";
import { useRef, useState } from "react";
import { ORDERS } from "@/lib/orders";

const GREETING = "Hello, this is Aria from Aura Skincare. How can I help you today?";
const COLORS = { idle: "#999", listening: "#2e8b57", thinking: "#e0a100", speaking: "#3a6ee8" };

export default function Home() {
  const [state, setState] = useState("idle");
  const [inCall, setInCall] = useState(false);
  const [log, setLog] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const active = useRef(false);
  const msgs = useRef([]);
  const rec = useRef(null);
  const busy = useRef(false); const cancelled = useRef([]);

  const push = (role, text, extra) => { msgs.current.push({ role, text, ...extra }); setLog([...msgs.current]); };

  function speak(text) {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = synth.getVoices();
      const voice = v.find((x) => x.lang === "en-IN") || v.find((x) => x.lang.startsWith("hi")) || v.find((x) => x.lang.startsWith("en"));
      if (voice) u.voice = voice;
      u.lang = voice?.lang || "en-IN";
      u.rate = 1.05;
      u.onend = u.onerror = resolve;
      setState("speaking");
      synth.speak(u);
    });
  }

  function listen() {
    if (!active.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    rec.current = r;
    r.lang = "en-IN";
    r.interimResults = false;
    r.continuous = false;
    let got = false;
    r.onresult = (e) => {
      got = true;
      const text = e.results[0][0].transcript.trim();
      if (text) handleUser(text); else listen();
    };
    r.onerror = (e) => { if (e.error === "not-allowed") { setError("Microphone permission denied."); endCall(); } };
    r.onend = () => { if (!got && active.current && !busy.current) listen(); }; // silence -> keep listening
    setState("listening");
    try { r.start(); } catch {}
  }

  async function handleUser(text) {
    busy.current = true;
    push("user", text);
    setState("thinking");
    let reply = "Sorry, could you please repeat that?", toolCalls = [];
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: msgs.current.map(({ role, text }) => ({ role, text })), cancelled: cancelled.current }) });
      const d = await res.json(); ({ reply, toolCalls = [] } = d); if (d.cancelled) cancelled.current = d.cancelled;
    } catch { reply = "Sorry, I'm having connection trouble. Could you try again?"; }
    if (!active.current) return;
    push("agent", reply, { toolCalls });
    await speak(reply);
    busy.current = false;
    listen();
  }

  async function startCall() {
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) { setError("Please use Google Chrome or Edge (speech recognition isn't supported in this browser)."); return; }
    setError(""); setSummary(null); msgs.current = []; setLog([]); cancelled.current = [];
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); }
    catch { setError("Please allow microphone access and try again."); return; }
    active.current = true; busy.current = true; setInCall(true);
    push("agent", GREETING);
    await speak(GREETING);
    busy.current = false;
    listen();
  }

  async function endCall() {
    active.current = false; busy.current = false; setInCall(false);
    try { rec.current?.abort(); } catch {}
    window.speechSynthesis.cancel();
    setState("idle");
    setSummary({ loading: true });
    try {
      const r = await fetch("/api/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: msgs.current.map(({ role, text }) => ({ role, text })) }) });
      setSummary(await r.json());
    } catch { setSummary({ call_summary: "Summary unavailable." }); }
  }

  const card = { background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" };
  const btn = (bg) => ({ background: bg, color: "#fff", border: 0, borderRadius: 8, padding: "12px 22px", fontSize: 16, cursor: "pointer" });

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 20, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Aria · Aura Skincare Support</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          {!inCall ? <button style={btn("#2e8b57")} onClick={startCall}>Start Call</button> : <button style={btn("#c0392b")} onClick={endCall}>End Call</button>}
          <span style={{ padding: "6px 14px", borderRadius: 20, color: "#fff", background: COLORS[state], textTransform: "capitalize" }}>{state === "idle" ? "Not in call" : state}</span>
        </div>
        {error && <p style={{ color: "#c0392b" }}>{error}</p>}
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          {log.map((m, i) => (
            <p key={i} style={{ margin: "8px 0" }}>
              <b>{m.role === "user" ? "You" : "Aria"}:</b> {m.text}
              {m.toolCalls?.map((t, j) => <code key={j} style={{ display: "block", fontSize: 12, color: "#666" }}>🔧 {t.name}({JSON.stringify(t.args)})</code>)}
            </p>
          ))}
        </div>
        {summary && (
          <div style={{ marginTop: 12 }}>
            <h3>Call Summary</h3>
            {summary.loading ? <p>Generating…</p> : <pre style={{ background: "#f2f2f2", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(summary, null, 2)}</pre>}
          </div>
        )}
      </section>
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Test Orders</h3>
        {Object.values(ORDERS).map((o) => (
          <div key={o.id} style={{ borderBottom: "1px solid #eee", padding: "8px 0", fontSize: 14 }}>
            <b>{o.id}</b> · {o.customer}<br />{o.product} · ₹{o.value}<br />Status: {o.status}<br /><small>{o.notes}</small>
          </div>
        ))}
        <h4>Try saying</h4>
        <ul style={{ fontSize: 14, paddingLeft: 18 }}>
          <li>"Where is my order ORD-101?"</li>
          <li>"I bought ORD-102 and opened it, can I return it?"</li>
          <li>"Cancel ORD-103" / "Track ORD-999"</li>
          <li>"Can you book me a flight to Goa?"</li>
          <li>"Do you offer COD?"</li>
        </ul>
        <small>Use Chrome or Edge with headphones, so the agent doesn't hear itself.</small>
      </section>
    </main>
  );
}
