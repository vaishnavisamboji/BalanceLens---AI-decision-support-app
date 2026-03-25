"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type PageType = "landing" | "reflect" | "balance" | "scripts";
type BoundaryScript = { audience: string; script: string };
type WeeklyPlan = {
  current_pressure_points: string;
  what_to_protect_first: string;
  one_boundary_to_set: string;
  one_recovery_action: string;
  one_achievable_academic_step: string;
};
type BackendResponse = {
  situation_summary: string;
  likely_pressures: string[];
  what_might_help_this_week: string[];
  boundary_scripts: BoundaryScript[];
  weekly_balance_plan: WeeklyPlan;
  citations: { source: string; excerpt: string }[];
  safety_note: string;
};
type AIResult = {
  summary: string;
  pressures: string[];
  actions: string[];
  scripts: BoundaryScript[];
  plan: WeeklyPlan;
  safetyNote: string;
};
type Message =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "ai"; result: AIResult }
  | { id: string; role: "chat"; content: string }
  | { id: string; role: "error"; content: string };
type Theme = "light" | "dark" | "system";
type HistoryItem = { role: string; content: string };

// ─── Color tokens ─────────────────────────────────────────────────────────────
// All colours live here — change once, affects everywhere.
function useColors(dark: boolean) {
  return {
    // Page backgrounds
    pageBg:       dark ? "#0f1621" : "#f7f5f0",
    surfaceBg:    dark ? "#171f2e" : "#ffffff",
    surfaceAlt:   dark ? "#1c2537" : "#f2efe9",
    surfaceHover: dark ? "#202c3e" : "#ede9e1",
    cardBorder:   dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",

    // Text
    textPrimary:  dark ? "#e8e6e0" : "#1e2a32",
    textSecondary:dark ? "#a8a49c" : "#5a6672",
    textMuted:    dark ? "#6b6760" : "#8e9aa4",
    textOnAccent: "#ffffff",

    // Accents
    accentGreen:  "#6b9e96",    // softer teal — not blinding
    accentOrange: "#c97a5a",    // warm terracotta
    accentPurple: "#7d6aaa",    // muted lavender

    // Semantic
    danger:       dark ? "#c47070" : "#b85c5c",
    safetyBg:     dark ? "rgba(196,112,112,0.12)" : "rgba(184,92,92,0.08)",

    // Input
    inputBg:      dark ? "#1a2333" : "#ffffff",
    inputBorder:  dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)",
    inputText:    dark ? "#e8e6e0" : "#1e2a32",
    placeholder:  dark ? "rgba(232,230,224,0.3)" : "rgba(30,42,50,0.35)",

    // Pills / tags
    pillBg:       dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
    pillBorder:   dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
    pillText:     dark ? "#c8c5be" : "#3a4852",

    // Nav
    navBg:        dark ? "rgba(15,22,33,0.94)" : "rgba(247,245,240,0.94)",
    navBorder:    dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)",

    // Blockquote / scripts
    quoteBg:      dark ? "#1e2a3a" : "#faf8f4",
    quoteBorder:  dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
    quoteText:    dark ? "#d4d0c8" : "#2e3c46",

    // Badge backgrounds for pressure pills
    pressureAcademic: dark ? "rgba(107,158,150,0.2)"  : "rgba(107,158,150,0.12)",
    pressureBurnout:  dark ? "rgba(201,122,90,0.22)"  : "rgba(201,122,90,0.12)",
    pressureFinance:  dark ? "rgba(201,175,100,0.22)" : "rgba(201,175,100,0.12)",
    pressureSocial:   dark ? "rgba(125,106,170,0.22)" : "rgba(125,106,170,0.12)",
    pressureDefault:  dark ? "rgba(107,158,150,0.15)" : "rgba(107,158,150,0.08)",
  };
}

// ─── API ──────────────────────────────────────────────────────────────────────
const API_BASE =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000")
    : "http://localhost:8000";

async function callBackend(
  prompt: string,
  _history: HistoryItem[] = [],
  _mode = "auto"
): Promise<AIResult | { type: "chat"; message: string }> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: prompt }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const raw = await res.json();
  if (raw.type === "chat") return { type: "chat", message: raw.message };
  const typed = raw as BackendResponse;
  return {
    summary: typed.situation_summary,
    pressures: typed.likely_pressures ?? [],
    actions: typed.what_might_help_this_week ?? [],
    scripts: typed.boundary_scripts ?? [],
    plan: typed.weekly_balance_plan ?? ({} as WeeklyPlan),
    safetyNote: typed.safety_note ?? "",
  };
}

// ─── Schedule helpers ─────────────────────────────────────────────────────────
function toMins(t: string): number {
  if (!t || t.trim() === "") return -1;
  const clean = t.trim().replace(".", ":");  // ← normalize 8.30 → 8:30
  const m = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return -1;
  let h = parseInt(m[1]);
  const min = parseInt(m[2] ?? "0");
  const ampm = (m[3] ?? "").toLowerCase();
  if (ampm === "pm" && h !== 12) h += 12;
  else if (ampm === "am" && h === 12) h = 0;
  else if (!ampm && h < 7) h += 12;
  return h * 60 + min;
}
function fmtMins(mins: number): string {
  const c = Math.max(0, Math.min(mins, 23 * 60 + 59));
  const h = Math.floor(c / 60);
  const m = c % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hh}:${m.toString().padStart(2, "0")} ${ampm}`;
}
function parseShiftTimes(raw: string): [number, number] {
  if (!raw.trim()) return [-1, -1];
  const tokens = raw.match(/\d{1,2}[:.]\d{2}\s*(?:am|pm)|\d{1,2}\s*(?:am|pm)/gi) ?? [];
  if (tokens.length >= 2) return [toMins(tokens[0]!), toMins(tokens[tokens.length - 1]!)];
  if (tokens.length === 1) return [toMins(tokens[0]!), -1];
  return [-1, -1];
}
function guessDuration(task: string): number {
  const l = task.toLowerCase();
  if (l.includes("cook") && l.includes("dish")) return 80;
  if (l.includes("cook") && (l.includes("lunch") || l.includes("dinner"))) return 80;
  if (l.includes("cook")) return 50;
  if (l.includes("lunch") || l.includes("dinner") || l.includes("meal")) return 30;
  if (l.includes("dish") || l.includes("wash")) return 20;
  if (l.includes("laundry") || l.includes("clean") || l.includes("tidy")) return 30;
  if (l.includes("study") || l.includes("homework") || l.includes("assignment")) return 75;
  if (l.includes("apply") || l.includes("job")) return 60;
  if (l.includes("linkedin") || l.includes("course")) return 45;
  if (l.includes("project")) return 60;
  if (l.includes("parents") || l.includes("call")) return 30;
  if (l.includes("gym") || l.includes("exercise") || l.includes("walk")) return 45;
  if (l.includes("rest") || l.includes("nap")) return 30;
  return 40;
}
function taskType(task: string): string {
  const l = task.toLowerCase();
  if (l.includes("cook") || l.includes("lunch") || l.includes("dinner") || l.includes("breakfast") || l.includes("meal")) return "meal";
  if (l.includes("shift") || (l.includes("work") && !l.includes("homework") && !l.includes("project"))) return "work";
  if (l.includes("study") || l.includes("homework") || l.includes("class") || l.includes("course") || l.includes("project") || l.includes("apply")) return "study";
  if (l.includes("rest") || l.includes("nap") || l.includes("sleep") || l.includes("break")) return "rest";
  return "personal";
}
function splitTasks(raw: string): string[] {
  if (!raw.trim()) return [];
  const normalized = raw.replace(/\.\s+(And\s+I\s+must|I\s+must|Also,|Then,?)/gi, "\n").replace(/\.\s*$/, "");
  const rawLines = normalized.split(/\n+/).map((s: string) => s.trim()).filter((s: string) => s.length > 2);
  const result: string[] = [];
  for (const line of rawLines) {
    if (/cook.*(breakfast|lunch|dinner)/i.test(line) || /(breakfast|lunch).*(and|&).*dinner/i.test(line)) {
      const clean = line.replace(/^(and\s+i\s+must|i\s+must|and\s+)?/i, "").trim();
      if (clean.length > 3) result.push(clean);
      continue;
    }
    const parts = line.split(/,\s+/);
    for (const p of parts) {
      const t = p.replace(/^(and\s+i\s+must|i\s+must|and\s+|also\s+)/i, "").replace(/^[-•*]\s*/, "").trim();
      if (t.length > 3) result.push(t);
    }
  }
  const merged: string[] = [];
  const mealBuf: string[] = [];
  const isMeal = (t: string) => { const l = t.toLowerCase(); return l.includes("cook") || l.includes("lunch") || l.includes("dinner") || l.includes("breakfast") || l.includes("dish") || l.includes("eat") || l.includes("meal"); };
  const flush = () => {
    if (!mealBuf.length) return;
    const all = mealBuf.join(" ").toLowerCase();
    const hasCook = all.includes("cook"), hasDish = all.includes("dish") || all.includes("wash");
    const meals = [all.includes("lunch") && "lunch", all.includes("dinner") && "dinner"].filter(Boolean);
    let label = "";
    if (hasCook && hasDish) label = meals.length ? `Cook ${meals.join(" & ")}, wash dishes` : "Cook & wash dishes";
    else if (hasCook) label = meals.length ? `Cook ${meals.join(" & ")}` : "Cook meal";
    else if (hasDish) label = "Wash dishes";
    else label = mealBuf[0];
    merged.push(label); mealBuf.length = 0;
  };
  for (const t of result) { isMeal(t) ? mealBuf.push(t) : (flush(), merged.push(t)); }
  flush();
  return merged.length > 0 ? merged : [raw.trim()];
}
function buildDaySchedule(wakeTime: string, sleepTime: string, workShifts: string, classes: string, mustDo: string) {
  const blocks: { time: string; task: string; type: string }[] = [];
  const wakeMins = toMins(wakeTime) > 0 ? toMins(wakeTime) : 7 * 60;
  const sleepMins = toMins(sleepTime) > 0 ? toMins(sleepTime) : 23 * 60;
  blocks.push({ time: fmtMins(wakeMins), task: "Wake up, freshen up & breakfast", type: "meal" });
  let cursor = wakeMins + 45;
  let shiftEnd = -1;
  if (workShifts.trim()) {
    const [ss, se] = parseShiftTimes(workShifts);
    if (ss > 0) {
      blocks.push({ time: fmtMins(ss), task: `Part-time work (${workShifts.trim()})`, type: "work" });
      cursor = ss; shiftEnd = se > 0 ? se : ss + 240;
      blocks.push({ time: fmtMins(shiftEnd), task: "Work done — quick break, drink water", type: "rest" });
      cursor = shiftEnd + 20;
    }
  }
  let classStart = -1, classEnd = -1;
  if (classes.trim()) { const [cs, ce] = parseShiftTimes(classes); classStart = cs; classEnd = ce; }
  const allTasks = splitTasks(mustDo);
  const endTasks: string[] = [], dayTasks: string[] = [];
  for (const t of allTasks) {
    const l = t.toLowerCase();
    if (l.includes("boyfriend") || l.includes("girlfriend") || l.includes("partner")) endTasks.push(t);
    else dayTasks.push(t);
  }
  const hardStop = classStart > 0 ? classStart : sleepMins;
  for (const task of dayTasks) {
    const dur = guessDuration(task);
    if (cursor < hardStop) { blocks.push({ time: fmtMins(cursor), task, type: taskType(task) }); cursor += dur; }
    else endTasks.push(task);
  }
  if (classStart > 0) {
    if (cursor < classStart) cursor = classStart;
    blocks.push({ time: fmtMins(classStart), task: `Class: ${classes.trim()}`, type: "study" });
    cursor = classEnd > 0 ? classEnd : classStart + 180;
    blocks.push({ time: fmtMins(cursor), task: "Class done — wind down", type: "rest" });
    cursor += 20;
  }
  for (const task of endTasks) {
    if (cursor < sleepMins - 15) { blocks.push({ time: fmtMins(cursor), task, type: taskType(task) }); cursor += guessDuration(task); }
  }
  blocks.push({ time: fmtMins(sleepMins), task: "Sleep 🌙 — protect this", type: "rest" });
  blocks.sort((a, b) => toMins(a.time.replace(" AM", "am").replace(" PM", "pm").replace(/\s+/g, "")) - toMins(b.time.replace(" AM", "am").replace(" PM", "pm").replace(/\s+/g, "")));
  return blocks;
}

const BLOCK_COLORS: Record<string, string> = {
  work: "#c97a5a", study: "#6b9e96", rest: "#7d6aaa", meal: "#b89650", personal: "#6b8399",
};

// ─── Theme hook ───────────────────────────────────────────────────────────────
function useTheme(): [string, Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("bl-theme") as Theme) || "system";
  });
  const [resolved, setResolved] = useState<string>("light");
  useEffect(() => {
    const update = () => {
      const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      const r = theme === "system" ? sys : theme;
      setResolved(r);
      document.documentElement.setAttribute("data-theme", r);
    };
    update();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [theme]);
  const set = (t: Theme) => { setTheme(t); localStorage.setItem("bl-theme", t); };
  return [resolved, theme, set];
}

// ─── Floating Orbs ────────────────────────────────────────────────────────────
function FloatingOrbs({ dark }: { dark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let animId: number;
    let W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const orbs = Array.from({ length: 14 }, (_, i) => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 50 + Math.random() * 90,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      hue: [160, 22, 270, 45, 200][i % 5],
      alpha: dark ? 0.05 + Math.random() * 0.07 : 0.07 + Math.random() * 0.09,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const o of orbs) {
        o.x += o.vx; o.y += o.vy;
        if (o.x < -o.r) o.x = W + o.r; if (o.x > W + o.r) o.x = -o.r;
        if (o.y < -o.r) o.y = H + o.r; if (o.y > H + o.r) o.y = -o.r;
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, `hsla(${o.hue},45%,${dark ? 65 : 50}%,${o.alpha})`);
        g.addColorStop(1, `hsla(${o.hue},45%,${dark ? 65 : 50}%,0)`);
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    const ro = new ResizeObserver(() => { W = canvas.offsetWidth; H = canvas.offsetHeight; canvas.width = W; canvas.height = H; });
    ro.observe(canvas);
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, [dark]);
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

// ─── Word cycler ──────────────────────────────────────────────────────────────
function WordCycle({ words, color }: { words: string[]; color: string }) {
  const [idx, setIdx] = useState(0);
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setVis(false);
      setTimeout(() => { setIdx(i => (i + 1) % words.length); setVis(true); }, 350);
    }, 2400);
    return () => clearInterval(t);
  }, [words.length]);
  return (
    <span style={{ color, display: "inline-block", transition: "opacity 0.35s, transform 0.35s", opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(6px)" }}>
      {words[idx]}
    </span>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text, idx, copied, onCopy, dark }: { text: string; idx: number; copied: number | null; onCopy: (t: string, i: number) => void; dark: boolean }) {
  const C = useColors(dark);
  return (
    <button onClick={() => onCopy(text, idx)} style={{ position: "absolute", top: 10, right: 10, background: C.surfaceBg, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: 7, cursor: "pointer", color: C.textMuted, display: "flex" }}>
      {copied === idx
        ? <svg width="14" height="14" fill="none" stroke={C.accentGreen} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
        : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
    </button>
  );
}

// ─── AI Result Card ───────────────────────────────────────────────────────────
function AIResultCard({ result, dark }: { result: AIResult; dark: boolean }) {
  const C = useColors(dark);
  const [copied, setCopied] = useState<number | null>(null);
  const copy = (text: string, i: number) => { navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 2000); };

  const pressureColor = (p: string) => {
    const l = p.toLowerCase();
    if (l.includes("academ") || l.includes("exam") || l.includes("class")) return { bg: C.pressureAcademic, border: dark ? "rgba(107,158,150,0.3)" : "rgba(107,158,150,0.25)", text: dark ? "#8dc4bc" : "#3d7a72" };
    if (l.includes("burnout") || l.includes("exhaust") || l.includes("drain")) return { bg: C.pressureBurnout, border: dark ? "rgba(201,122,90,0.35)" : "rgba(201,122,90,0.25)", text: dark ? "#d49070" : "#8a4a30" };
    if (l.includes("financ") || l.includes("money") || l.includes("shift")) return { bg: C.pressureFinance, border: dark ? "rgba(201,175,100,0.35)" : "rgba(201,175,100,0.25)", text: dark ? "#c9b070" : "#7a6020" };
    if (l.includes("social") || l.includes("friend") || l.includes("family")) return { bg: C.pressureSocial, border: dark ? "rgba(125,106,170,0.35)" : "rgba(125,106,170,0.25)", text: dark ? "#a896cc" : "#5a4880" };
    return { bg: C.pressureDefault, border: dark ? "rgba(107,158,150,0.25)" : "rgba(107,158,150,0.2)", text: dark ? "#8dc4bc" : "#3d7a72" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720, width: "100%" }}>
      {/* Summary card */}
      <div style={{ background: C.surfaceBg, borderRadius: 16, padding: "22px 26px", border: `1px solid ${C.cardBorder}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ color: C.accentGreen, fontSize: 14 }}>✦</span>
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 700, color: C.textPrimary, margin: 0 }}>What might be happening</h3>
        </div>
        <p style={{ color: C.textSecondary, lineHeight: 1.75, margin: 0, fontSize: 15 }}>{result.summary}</p>
      </div>

      {/* Pressures */}
      {result.pressures.length > 0 && (
        <div style={{ padding: "0 4px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Pressures at play</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {result.pressures.map((p, i) => {
              const c = pressureColor(p);
              return <span key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, borderRadius: 999, padding: "5px 13px", fontSize: 13, fontWeight: 500 }}>{p}</span>;
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      {result.actions.length > 0 && (
        <div style={{ background: dark ? "rgba(107,158,150,0.1)" : "rgba(107,158,150,0.07)", borderRadius: 16, padding: "20px 24px", border: `1px solid ${dark ? "rgba(107,158,150,0.2)" : "rgba(107,158,150,0.15)"}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 15 }}>🛡</span>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 700, color: C.textPrimary, margin: 0 }}>What might help this week</h3>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {result.actions.map((a, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ color: C.accentGreen, fontSize: 15, flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ color: C.textSecondary, lineHeight: 1.65, fontSize: 14 }}>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Scripts */}
      {result.scripts.length > 0 && (
        <div style={{ background: dark ? "rgba(201,122,90,0.1)" : "rgba(201,122,90,0.06)", borderRadius: 16, padding: "20px 24px", border: `1px solid ${dark ? "rgba(201,122,90,0.2)" : "rgba(201,122,90,0.12)"}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 15 }}>💬</span>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 700, color: C.textPrimary, margin: 0 }}>Scripts you could use</h3>
          </div>
          {result.scripts.map((s, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, marginBottom: 6 }}>{s.audience}</p>
              <div style={{ position: "relative" }}>
                <blockquote style={{ background: C.quoteBg, borderLeft: `3px solid ${C.accentOrange}`, borderRadius: "0 10px 10px 0", padding: "12px 48px 12px 14px", margin: 0, fontStyle: "italic", color: C.quoteText, lineHeight: 1.65, fontSize: 14 }}>"{s.script}"</blockquote>
                <CopyBtn text={s.script} idx={i} copied={copied} onCopy={copy} dark={dark} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mini balance check */}
      {result.plan?.one_achievable_academic_step && (
        <div style={{ background: dark ? "rgba(107,158,150,0.08)" : "rgba(107,158,150,0.06)", borderRadius: 14, padding: "16px 20px", border: `1px solid ${dark ? "rgba(107,158,150,0.18)" : "rgba(107,158,150,0.14)"}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>📅</span>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: 0 }}>Your mini balance check</h3>
          </div>
          <p style={{ color: C.textSecondary, fontWeight: 500, margin: 0, fontSize: 14 }}>{result.plan.one_achievable_academic_step}</p>
        </div>
      )}

      {/* Safety note */}
      {result.safetyNote && (
        <p style={{ fontSize: 12, color: C.textMuted, borderLeft: `2px solid ${C.cardBorder}`, paddingLeft: 12, margin: 0, lineHeight: 1.65 }}>{result.safetyNote}</p>
      )}
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav({ page, onNav, theme, setTheme, dark }: { page: PageType; onNav: (p: PageType) => void; theme: Theme; setTheme: (t: Theme) => void; dark: boolean }) {
  const C = useColors(dark);
  const [open, setOpen] = useState(false);
  const items: { id: PageType; label: string }[] = [
    { id: "landing", label: "Home" }, { id: "reflect", label: "Reflect" },
    { id: "balance", label: "Balance Plan" }, { id: "scripts", label: "Boundary Scripts" },
  ];
  const ThemeBtn = ({ t, label }: { t: Theme; label: string }) => (
    <button onClick={() => setTheme(t)} style={{ background: theme === t ? (dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.1)") : "none", border: "none", borderRadius: 6, padding: "4px 9px", fontSize: 13, color: theme === t ? C.textPrimary : C.textMuted, cursor: "pointer", fontWeight: theme === t ? 600 : 400 }}>{label}</button>
  );
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, background: C.navBg, backdropFilter: "blur(14px)", borderBottom: `1px solid ${C.navBorder}` }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 62 }}>
        <button onClick={() => { onNav("landing"); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ background: C.accentGreen, borderRadius: 9, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>🌿</span>
          <span style={{ fontFamily: "Georgia, serif", fontSize: 21, fontWeight: 700, color: C.textPrimary }}>BalanceLens</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }} className="bl-desktop-nav">
          {items.map(item => (
            <button key={item.id} onClick={() => onNav(item.id)} style={{ background: page === item.id ? (dark ? "rgba(107,158,150,0.2)" : "rgba(107,158,150,0.14)") : "none", color: page === item.id ? C.accentGreen : C.textSecondary, border: `1px solid ${page === item.id ? (dark ? "rgba(107,158,150,0.35)" : "rgba(107,158,150,0.25)") : "transparent"}`, borderRadius: 999, padding: "7px 16px", fontSize: 14, fontWeight: page === item.id ? 600 : 400, cursor: "pointer" }}>{item.label}</button>
          ))}
          <div style={{ display: "flex", gap: 2, background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: 8, padding: 3, marginLeft: 8 }}>
            <ThemeBtn t="light" label="☀" /><ThemeBtn t="system" label="⬤" /><ThemeBtn t="dark" label="☾" />
          </div>
        </div>
        <button onClick={() => setOpen(!open)} className="bl-mobile-btn" style={{ background: "none", border: "none", cursor: "pointer", padding: 8, fontSize: 20, color: C.textPrimary, display: "none" }}>{open ? "✕" : "☰"}</button>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${C.navBorder}`, padding: "8px 16px 16px", background: C.navBg }}>
          {items.map(item => (
            <button key={item.id} onClick={() => { onNav(item.id); setOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", background: page === item.id ? (dark ? "rgba(107,158,150,0.18)" : "rgba(107,158,150,0.1)") : "none", color: page === item.id ? C.accentGreen : C.textSecondary, border: "none", borderRadius: 8, padding: "11px 16px", fontSize: 15, fontWeight: 500, cursor: "pointer", marginBottom: 2 }}>{item.label}</button>
          ))}
          <div style={{ display: "flex", gap: 4, padding: "8px 16px 4px" }}>
            <ThemeBtn t="light" label="☀ Light" /><ThemeBtn t="system" label="⬤ System" /><ThemeBtn t="dark" label="☾ Dark" />
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
function LandingPage({ onNav, dark }: { onNav: (p: PageType) => void; dark: boolean }) {
  const C = useColors(dark);
  const heroBg = dark
    ? "radial-gradient(ellipse 80% 60% at 20% 40%, rgba(107,158,150,0.18) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 20%, rgba(201,122,90,0.15) 0%, transparent 55%), #0f1621"
    : "radial-gradient(ellipse 80% 60% at 20% 40%, rgba(107,158,150,0.22) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 20%, rgba(201,122,90,0.16) 0%, transparent 55%), #f0ede6";

  return (
    <main style={{ background: C.pageBg }}>
      {/* Hero */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "80px 20px", overflow: "hidden", background: heroBg }}>
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}><FloatingOrbs dark={dark} /></div>
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, opacity: 0.35, zIndex: 2, animation: "bl-float1 2.2s ease-in-out infinite" }}>
          <span style={{ fontSize: 10, letterSpacing: "0.14em", color: C.textSecondary, textTransform: "uppercase" }}>scroll</span>
          <svg width="14" height="14" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round"><polyline points="3 5 7 9 11 5" /></svg>
        </div>
        <div style={{ position: "relative", zIndex: 2, maxWidth: 960, width: "100%" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: dark ? "rgba(107,158,150,0.15)" : "rgba(107,158,150,0.12)", color: C.accentGreen, borderRadius: 999, padding: "6px 16px", fontSize: 12, fontWeight: 600, marginBottom: 36, border: `1px solid ${dark ? "rgba(107,158,150,0.3)" : "rgba(107,158,150,0.25)"}`, backdropFilter: "blur(8px)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            ✦ AI Decision Companion for College Women
          </span>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(34px, 5vw, 58px)", fontWeight: 700, color: C.textPrimary, lineHeight: 1.18, marginBottom: 28, letterSpacing: "-0.02em" }}>
            Navigate life&apos;s pressures with{" "}
            <WordCycle words={["clarity", "balance", "confidence", "purpose"]} color={C.accentGreen} />{" "}
            and <WordCycle words={["care", "intention", "grace", "strength"]} color={C.accentOrange} />.
          </h1>
          <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: C.textSecondary, maxWidth: 580, margin: "0 auto 48px", lineHeight: 1.75 }}>
            Balancing college, work, relationships, and wellbeing is hard. BalanceLens helps you untangle the overwhelm, set boundaries without guilt, and prioritize what actually matters today.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => onNav("reflect")} style={{ background: C.accentGreen, color: "#fff", border: "none", borderRadius: 999, padding: "14px 36px", fontSize: 17, fontWeight: 600, cursor: "pointer", boxShadow: dark ? "0 6px 24px rgba(107,158,150,0.35)" : "0 6px 20px rgba(107,158,150,0.3)" }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.88"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
              Start Reflecting →
            </button>
            <button onClick={() => onNav("balance")} style={{ background: dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.8)", color: C.textPrimary, border: `1px solid ${C.cardBorder}`, borderRadius: 999, padding: "14px 36px", fontSize: 17, fontWeight: 500, cursor: "pointer", backdropFilter: "blur(10px)" }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.8"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
              Build My Plan
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div style={{ borderTop: `1px solid ${C.cardBorder}`, borderBottom: `1px solid ${C.cardBorder}`, background: C.surfaceBg, padding: "26px 20px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, textAlign: "center" }}>
          {[{ num: "RAG", label: "Knowledge-grounded" }, { num: "3", label: "Core tools" }, { num: "100%", label: "Situation-specific" }, { num: "Free", label: "No paywalls" }].map(s => (
            <div key={s.num}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 700, color: C.accentGreen, marginBottom: 3 }}>{s.num}</div>
              <div style={{ fontSize: 13, color: C.textMuted }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section style={{ background: C.surfaceBg, padding: "72px 20px" }}>
        <div style={{ maxWidth: 1020, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 30, fontWeight: 700, color: C.textPrimary, textAlign: "center", marginBottom: 10 }}>Tools for the everyday overwhelm</h2>
          <p style={{ textAlign: "center", color: C.textSecondary, fontSize: 16, marginBottom: 48 }}>Every response is grounded in your specific situation — not generic advice.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 20 }}>
            {[
              { emoji: "🫀", title: "Situation Interpreter", desc: "Describe what you're going through. The AI identifies competing pressures and gives concrete next steps.", page: "reflect" as PageType, color: C.accentGreen },
              { emoji: "📅", title: "Balance Plan", desc: "Enter your real schedule — shifts, classes, tasks, energy. Get an hour-by-hour plan for today.", page: "balance" as PageType, color: C.accentOrange },
              { emoji: "💬", title: "Boundary Scripts", desc: "Ready-to-copy messages for declining shifts, asking for extensions, or saying no — tailored to you.", page: "scripts" as PageType, color: C.accentPurple },
            ].map((f, i) => (
              <div key={f.title} onClick={() => onNav(f.page)} style={{ background: C.surfaceAlt, borderRadius: 20, padding: "28px 24px", border: `1px solid ${C.cardBorder}`, cursor: "pointer", transition: "transform 0.18s" }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform = "none"}>
                <div style={{ fontSize: 30, marginBottom: 14, animation: `bl-float${i % 3} 3.5s ease-in-out infinite`, animationDelay: `${i * 0.5}s` }}>{f.emoji}</div>
                <h3 style={{ fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, color: C.textPrimary, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ color: C.textSecondary, lineHeight: 1.65, marginBottom: 16, fontSize: 14 }}>{f.desc}</p>
                <span style={{ color: f.color, fontWeight: 600, fontSize: 13 }}>Try it →</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote */}
      <section style={{ background: dark ? "#162028" : "#e8f0ee", padding: "72px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ fontSize: 32, marginBottom: 20, opacity: 0.6 }}>💬</div>
          <blockquote style={{ fontFamily: "Georgia, serif", fontSize: "clamp(18px, 2.5vw, 24px)", fontWeight: 500, color: dark ? "#c8d8d5" : "#2a4440", lineHeight: 1.6, marginBottom: 18 }}>
            &ldquo;I used to feel guilty every time I said no to an extra shift. BalanceLens helped me realize that protecting my sleep is actually an academic strategy, not a weakness.&rdquo;
          </blockquote>
          <p style={{ color: dark ? "rgba(200,216,213,0.6)" : "rgba(42,68,64,0.6)", fontSize: 14 }}>— Sarah, Junior balancing nursing school and a part-time job</p>
        </div>
      </section>

      {/* Safety */}
      <div style={{ background: C.safetyBg, borderTop: `2px solid ${C.danger}`, padding: "14px 20px", textAlign: "center", fontSize: 13, color: C.textSecondary }}>
        BalanceLens is a decision companion, not a replacement for professional mental health support. If you feel unsafe, contact emergency services or call/text <strong style={{ color: C.danger }}>988</strong> (U.S.).
      </div>

      {/* Disclaimer footer */}
      <div style={{ borderTop: `1px solid ${C.cardBorder}`, padding: "24px 20px", textAlign: "center" }}>
        <p style={{ fontSize: 12, color: C.textMuted, maxWidth: 600, margin: "0 auto", lineHeight: 1.7 }}>
          ⚠️ BalanceLens is an AI decision-support tool, not a licensed therapist or medical advisor.
          It is designed for everyday prioritization decisions only. If you are in crisis, please call or text{" "}
          <strong>988</strong> (Suicide & Crisis Lifeline).
        </p>
      </div>
    </main>
  );
}

// ─── Reflect Page ─────────────────────────────────────────────────────────────
function ReflectPage({ dark = false }: { dark?: boolean }) {
  const C = useColors(dark);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const PROMPTS = [
    "I have three exams this week but my manager keeps asking me to take extra shifts.",
    "I feel guilty saying no when people ask me for help, but I'm completely drained.",
    "I'm working two jobs while going to school and I feel exhausted all the time.",
  ];

  const send = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setMessages(m => [...m, { id: Date.now().toString(), role: "user", content: text }]);
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    setLoading(true);
    try {
      const result = await callBackend(text);
      if ("type" in result && result.type === "chat") {
        setMessages(m => [...m, { id: (Date.now() + 1).toString(), role: "chat", content: result.message }]);
      } else {
        setMessages(m => [...m, { id: (Date.now() + 1).toString(), role: "ai", result: result as AIResult }]);
      }
    } catch (e) {
      setMessages(m => [...m, { id: (Date.now() + 1).toString(), role: "error", content: e instanceof Error ? e.message : "Something went wrong." }]);
    } finally { setLoading(false); }
  }, []);

  return (
    <main style={{ background: C.pageBg, minHeight: "calc(100vh - 62px)", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, maxWidth: 820, width: "100%", margin: "0 auto", padding: "28px 16px", display: "flex", flexDirection: "column" }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", paddingBottom: 40 }}>
            <div style={{ width: 58, height: 58, background: dark ? "rgba(107,158,150,0.15)" : "rgba(107,158,150,0.12)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 24 }}>✦</div>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(26px, 4vw, 34px)", fontWeight: 700, color: C.textPrimary, marginBottom: 10 }}>What&apos;s on your mind?</h1>
            <p style={{ color: C.textSecondary, fontSize: 16, marginBottom: 36, maxWidth: 460, lineHeight: 1.7 }}>Describe what you&apos;re going through. The AI will analyze your specific situation — not give generic advice.</p>
            <div style={{ width: "100%", maxWidth: 600, display: "flex", flexDirection: "column", gap: 8 }}>
              {PROMPTS.map((p, i) => (
                <button key={i} onClick={() => send(p)} style={{ textAlign: "left", background: C.surfaceBg, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: "13px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 11, fontSize: 14, color: C.textSecondary, lineHeight: 1.55, transition: "border-color 0.15s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = dark ? "rgba(107,158,150,0.4)" : "rgba(107,158,150,0.35)"}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = C.cardBorder}>
                  <span style={{ color: C.accentGreen, marginTop: 1, flexShrink: 0 }}>💬</span>
                  <span>&ldquo;{p}&rdquo;</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, paddingBottom: 20 }}>
          {messages.map(m => (
            <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              {m.role === "user" && <div style={{ background: C.accentGreen, color: "#fff", borderRadius: "16px 16px 4px 16px", padding: "12px 18px", fontSize: 15, lineHeight: 1.6, maxWidth: "78%" }}>{m.content}</div>}
              {m.role === "chat" && <div style={{ background: C.surfaceBg, border: `1px solid ${C.cardBorder}`, borderRadius: "4px 16px 16px 16px", padding: "12px 18px", fontSize: 15, color: C.textSecondary, lineHeight: 1.65, maxWidth: "78%" }}>{(m as { id: string; role: "chat"; content: string }).content}</div>}
              {m.role === "ai" && <AIResultCard result={(m as { id: string; role: "ai"; result: AIResult }).result} dark={dark} />}
              {m.role === "error" && <div style={{ background: dark ? "rgba(196,112,112,0.15)" : "#fef2f2", border: `1px solid ${dark ? "rgba(196,112,112,0.3)" : "#fecaca"}`, color: C.danger, borderRadius: 10, padding: "11px 15px", fontSize: 13 }}>{(m as { id: string; role: "error"; content: string }).content}</div>}
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex" }}>
              <div style={{ background: C.surfaceBg, border: `1px solid ${C.cardBorder}`, borderRadius: "4px 16px 16px 16px", padding: "13px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", gap: 5 }}>
                  {[0, 150, 300].map(d => <div key={d} style={{ width: 8, height: 8, borderRadius: "50%", background: C.accentGreen, animation: "bl-bounce 1.2s infinite", animationDelay: `${d}ms`, opacity: 0.7 }} />)}
                </div>
                <span style={{ color: C.textMuted, fontSize: 13 }}>Analyzing your situation…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input box */}
        <div style={{ position: "sticky", bottom: 14 }}>
          <div style={{ background: C.inputBg, borderRadius: 18, border: `1.5px solid ${C.inputBorder}`, boxShadow: dark ? "0 4px 20px rgba(0,0,0,0.4)" : "0 2px 14px rgba(0,0,0,0.08)" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
              }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Describe what you're going through right now…"
              rows={1}
              style={{ width: "100%", border: "none", outline: "none", padding: "13px 18px 9px", fontSize: 15, resize: "none", background: "transparent", color: C.inputText, lineHeight: 1.55, fontFamily: "inherit", minHeight: 42, maxHeight: 150, overflow: "auto", display: "block" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 13px 11px", borderTop: `1px solid ${C.cardBorder}` }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>Enter to send · Shift+Enter for new line</span>
              <button onClick={() => send(input)} disabled={loading || !input.trim()} style={{ background: input.trim() && !loading ? C.accentGreen : (dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"), color: input.trim() && !loading ? "#fff" : C.textMuted, border: "none", borderRadius: "50%", width: 35, height: 35, cursor: input.trim() && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>→</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Balance Form State ───────────────────────────────────────────────────────
interface BalanceFormState {
  step: "form" | "loading" | "result";
  result: AIResult | null;
  wakeTime: string; sleepTime: string;
  workShifts: string; classes: string;
  mustDo: string; canMove: string;
  stress: number; energy: number; extra: string;
}

// ─── Balance Page ─────────────────────────────────────────────────────────────
function BalancePage({ state, setState, dark = false }: { state: BalanceFormState; setState: React.Dispatch<React.SetStateAction<BalanceFormState>>; dark?: boolean }) {
  const C = useColors(dark);
  const [error, setError] = useState<string | null>(null);
  const s = state;
  const upd = (patch: Partial<BalanceFormState>) => setState(prev => ({ ...prev, ...patch }));

  const stressColor = s.stress <= 3 ? C.accentGreen : s.stress <= 6 ? "#b89650" : C.accentOrange;
  const energyColor = s.energy <= 3 ? C.accentOrange : s.energy <= 6 ? "#b89650" : C.accentGreen;

  const iStyle: React.CSSProperties = { width: "100%", border: `1px solid ${C.inputBorder}`, borderRadius: 10, padding: "10px 13px", fontSize: 14, background: C.inputBg, color: C.inputText, outline: "none", fontFamily: "inherit" };
  const lStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: C.textSecondary, marginBottom: 6 };
  const card: React.CSSProperties = { background: C.surfaceBg, borderRadius: 18, padding: "20px 22px", border: `1px solid ${C.cardBorder}`, marginBottom: 14 };
  const h2Style: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, color: C.textPrimary, marginBottom: 14 };

  async function generate() {
    if (!s.mustDo.trim() && !s.workShifts.trim() && !s.classes.trim()) { setError("Please fill in at least your must-do tasks, work shifts, or classes."); return; }
    setError(null); upd({ step: "loading" });
    const parts = ["I need a detailed balance plan for today and this week.", `I wake up at ${s.wakeTime} and aim to sleep by ${s.sleepTime}.`, s.workShifts && `My work shifts today: ${s.workShifts}.`, s.classes && `My classes today: ${s.classes}.`, s.mustDo && `Must-do tasks today: ${s.mustDo}.`, s.canMove && `Tasks I can move to another day: ${s.canMove}.`, `My stress level is ${s.stress}/10 and energy is ${s.energy}/10.`, s.extra && `Additional context: ${s.extra}.`, "Give me: advice on what to protect, recovery actions, boundary suggestions, and academic steps."].filter(Boolean).join(" ");
    try {
      const r = await callBackend(parts);
      if ("type" in r && r.type === "chat") { setError("Please describe your schedule in more detail."); upd({ step: "form" }); }
      else { upd({ result: r as AIResult, step: "result" }); }
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); upd({ step: "form" }); }
  }

  if (s.step === "loading") return (
    <main style={{ background: C.pageBg, minHeight: "calc(100vh - 62px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 18 }}>
          {[0, 150, 300].map(d => <div key={d} style={{ width: 11, height: 11, borderRadius: "50%", background: C.accentOrange, animation: "bl-bounce 1.2s infinite", animationDelay: `${d}ms`, opacity: 0.75 }} />)}
        </div>
        <p style={{ color: C.textSecondary, fontSize: 16 }}>Building your personalized plan…</p>
      </div>
    </main>
  );

  if (s.step === "result" && s.result) {
    const blocks = buildDaySchedule(s.wakeTime, s.sleepTime, s.workShifts, s.classes, s.mustDo);
    return (
      <main style={{ background: C.pageBg, minHeight: "calc(100vh - 62px)", padding: "40px 16px" }}>
        <div style={{ maxWidth: 660, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 27, fontWeight: 700, color: C.textPrimary, marginBottom: 6 }}>Your Personalized Balance Plan</h1>
            <p style={{ color: C.textMuted, fontSize: 13 }}>Based on your actual tasks and schedule.</p>
          </div>
          <div style={card}>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, color: C.accentGreen, marginBottom: 8 }}>✦ What I see happening</h3>
            <p style={{ color: C.textSecondary, lineHeight: 1.72, margin: 0, fontSize: 14 }}>{s.result.summary}</p>
          </div>
          <div style={card}>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>🕐 Today&apos;s Hour-by-Hour Plan</h3>
            <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>{s.wakeTime} — {s.sleepTime}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {blocks.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 11, background: dark ? `${BLOCK_COLORS[b.type] ?? "#6b8399"}15` : `${BLOCK_COLORS[b.type] ?? "#6b8399"}12`, border: `1px solid ${BLOCK_COLORS[b.type] ?? "#6b8399"}30`, borderRadius: 10, padding: "9px 13px" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: BLOCK_COLORS[b.type] ?? "#6b8399", minWidth: 68, flexShrink: 0, marginTop: 2 }}>{b.time}</span>
                  <span style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.5 }}>{b.task}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.cardBorder}` }}>
              {[["work", "Work"], ["study", "Study/Class"], ["rest", "Rest"], ["meal", "Meal"]].map(([type, label]) => (
                <span key={type} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textMuted }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: BLOCK_COLORS[type], display: "inline-block" }} />{label}
                </span>
              ))}
            </div>
          </div>
          {s.result.plan?.what_to_protect_first && (
            <div style={{ background: dark ? "rgba(107,158,150,0.18)" : "rgba(107,158,150,0.14)", borderRadius: 16, padding: "20px 22px", marginBottom: 14, border: `1px solid ${dark ? "rgba(107,158,150,0.3)" : "rgba(107,158,150,0.22)"}` }}>
              <h3 style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, color: dark ? "#8dc4bc" : "#2d6b63", marginBottom: 8 }}>🛡 Protect First</h3>
              <p style={{ color: dark ? "#c4dcd8" : "#2a5550", lineHeight: 1.7, margin: 0, fontSize: 14 }}>{s.result.plan.what_to_protect_first}</p>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            {s.result.plan?.one_recovery_action && (
              <div style={{ background: dark ? "rgba(201,122,90,0.14)" : "rgba(201,122,90,0.08)", borderRadius: 14, padding: "16px 18px", border: `1px solid ${dark ? "rgba(201,122,90,0.25)" : "rgba(201,122,90,0.16)"}` }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.accentOrange, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>🔋 Recovery</p>
                <p style={{ color: C.textSecondary, fontSize: 13, lineHeight: 1.6, margin: 0 }}>{s.result.plan.one_recovery_action}</p>
              </div>
            )}
            {s.result.plan?.one_achievable_academic_step && (
              <div style={{ background: dark ? "rgba(107,158,150,0.12)" : "rgba(107,158,150,0.07)", borderRadius: 14, padding: "16px 18px", border: `1px solid ${dark ? "rgba(107,158,150,0.22)" : "rgba(107,158,150,0.14)"}` }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.accentGreen, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>✅ Academic step</p>
                <p style={{ color: C.textSecondary, fontSize: 13, lineHeight: 1.6, margin: 0 }}>{s.result.plan.one_achievable_academic_step}</p>
              </div>
            )}
          </div>
          {s.result.scripts.length > 0 && (
            <div style={card}>
              <h3 style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, color: C.textPrimary, marginBottom: 12 }}>One Boundary to Set This Week</h3>
              {s.result.plan?.one_boundary_to_set && <p style={{ color: C.textSecondary, fontSize: 13, marginBottom: 12 }}>{s.result.plan.one_boundary_to_set}</p>}
              {s.result.scripts.map((sc, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textMuted, marginBottom: 5 }}>{sc.audience}</p>
                  <blockquote style={{ background: C.quoteBg, borderLeft: `3px solid ${C.accentPurple}`, borderRadius: "0 10px 10px 0", padding: "11px 14px", margin: 0, fontStyle: "italic", color: C.quoteText, fontSize: 13, lineHeight: 1.65 }}>"{sc.script}"</blockquote>
                </div>
              ))}
            </div>
          )}
          {s.result.safetyNote && <p style={{ fontSize: 12, color: C.textMuted, borderLeft: `2px solid ${C.cardBorder}`, paddingLeft: 11, lineHeight: 1.65 }}>{s.result.safetyNote}</p>}
          <div style={{ textAlign: "center", marginTop: 28 }}>
            <button onClick={() => upd({ step: "form", result: null })} style={{ background: C.surfaceBg, border: `1px solid ${C.cardBorder}`, borderRadius: 999, padding: "11px 26px", fontSize: 14, color: C.textSecondary, cursor: "pointer" }}>Plan a different day</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ background: C.pageBg, minHeight: "calc(100vh - 62px)", padding: "40px 16px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 27, fontWeight: 700, color: C.textPrimary, marginBottom: 8 }}>Build Your Balance Plan</h1>
          <p style={{ color: C.textSecondary, fontSize: 15, maxWidth: 440, margin: "0 auto", lineHeight: 1.65 }}>Fill in your actual schedule. Get a real hour-by-hour plan for today.</p>
        </div>
        <div style={card}>
          <h2 style={h2Style}>Today&apos;s Schedule Window</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lStyle}>Wake up time</label><input type="text" value={s.wakeTime} onChange={e => upd({ wakeTime: e.target.value })} placeholder="7:00 AM" style={iStyle} /></div>
            <div><label style={lStyle}>Target sleep time</label><input type="text" value={s.sleepTime} onChange={e => upd({ sleepTime: e.target.value })} placeholder="11:00 PM" style={iStyle} /></div>
          </div>
        </div>
        <div style={card}>
          <h2 style={h2Style}>Fixed Commitments Today</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><label style={lStyle}>Work shifts (include times)</label><input type="text" value={s.workShifts} onChange={e => upd({ workShifts: e.target.value })} placeholder="e.g. 9am to 1pm part-time" style={iStyle} /></div>
            <div><label style={lStyle}>Classes / lectures (include times)</label><input type="text" value={s.classes} onChange={e => upd({ classes: e.target.value })} placeholder="e.g. Biology 10am–11am" style={iStyle} /></div>
          </div>
        </div>
        <div style={card}>
          <h2 style={h2Style}>Tasks</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><label style={lStyle}>Must-do today <span style={{ color: C.accentOrange }}>*</span></label><textarea value={s.mustDo} onChange={e => upd({ mustDo: e.target.value })} rows={3} placeholder="Cook lunch and dinner, wash dishes, apply for jobs, LinkedIn course…" style={{ ...iStyle, resize: "none" }} /></div>
            <div><label style={lStyle}>Can move to another day</label><textarea value={s.canMove} onChange={e => upd({ canMove: e.target.value })} rows={2} placeholder="Deep clean, long gym session, extra reading…" style={{ ...iStyle, resize: "none" }} /></div>
          </div>
        </div>
        <div style={card}>
          <h2 style={h2Style}>How You&apos;re Feeling Right Now</h2>
          {[{ label: "Stress level", val: s.stress, key: "stress" as const, color: stressColor }, { label: "Energy level", val: s.energy, key: "energy" as const, color: energyColor }].map(({ label, val, key, color }) => (
            <div key={key} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color }}>{val}/10</span>
              </div>
              <input type="range" min={1} max={10} value={val} onChange={e => upd({ [key]: Number(e.target.value) })} style={{ width: "100%", accentColor: color }} />
            </div>
          ))}
        </div>
        <div style={card}>
          <label style={{ ...lStyle, fontSize: 14, fontWeight: 700, color: C.textPrimary, marginBottom: 6 }}>Anything else?</label>
          <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 9 }}>Other plans, deadlines, or things the AI should know.</p>
          <textarea value={s.extra} onChange={e => upd({ extra: e.target.value })} rows={3} placeholder="Visiting boyfriend after dinner, midterm Thursday, haven't slept well…" style={{ ...iStyle, resize: "none" }} />
        </div>
        {error && <div style={{ background: dark ? "rgba(196,112,112,0.15)" : "#fef2f2", border: `1px solid ${dark ? "rgba(196,112,112,0.3)" : "#fecaca"}`, color: C.danger, borderRadius: 10, padding: "11px 15px", marginBottom: 14, fontSize: 13 }}>{error}</div>}
        <button onClick={generate} style={{ width: "100%", background: C.accentOrange, color: "#fff", border: "none", borderRadius: 999, padding: "15px 0", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>✦ Build My Plan</button>
      </div>
    </main>
  );
}

// ─── Scripts Page ─────────────────────────────────────────────────────────────
function ScriptsPage({ dark = false }: { dark?: boolean }) {
  const C = useColors(dark);
  const [situation, setSituation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<"work" | "academic" | "social" | "self">("work");
  const copy = (text: string, i: number) => { navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 2000); };

  async function generate() {
    if (!situation.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await callBackend(`I need boundary-setting scripts for this situation: ${situation}. Give me at least 2 ready-to-send scripts tailored exactly to my situation — specific to the people involved.`);
      if ("type" in r && r.type === "chat") { setError("Please describe your situation in more detail."); }
      else { setResult(r as AIResult); }
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setLoading(false); }
  }

  const TEMPLATES = {
    work: [
      { title: "Declining extra shifts", when: "Your manager keeps asking for more hours during exams.", text: "Hi [Manager] — I can't take extra shifts this week because of school deadlines. I can do my scheduled shifts on [days]. If you need coverage next week, I can revisit on [date]." },
      { title: "Requesting fewer hours", when: "You need to scale back for the semester.", text: "Hi [Manager], as we head into a heavier part of my semester, I need to adjust my availability to a maximum of [X] hours per week starting [date]. I wanted to give advance notice so we can plan accordingly." },
    ],
    academic: [
      { title: "Requesting an extension", when: "You're overwhelmed and need a few extra days.", text: "Dear Professor [Name], I'm writing to ask if a short extension on [Assignment] might be possible. I've been managing significant outside pressures and want to submit quality work. Could I submit on [date] instead?" },
      { title: "Asking to catch up", when: "You've fallen behind and need a plan.", text: "Dear Professor [Name], I've fallen behind due to personal circumstances and am committed to catching up. Could I come to office hours to discuss a realistic plan to get back on track?" },
    ],
    social: [
      { title: "Saying no to plans", when: "Friends want to hang out but you're exhausted.", text: "I'd love to see you, but I'm completely drained this week and need the weekend to recharge. Let's plan something next week when I have more energy!" },
      { title: "Setting limits on venting", when: "You don't have the emotional capacity right now.", text: "I care about you and want to support you, but I'm feeling really overwhelmed with my own stuff right now. Can we revisit this tomorrow?" },
    ],
    self: [
      { title: "Permission to rest", when: "You feel guilty for not being productive.", text: "Rest is not a reward for productivity — it's a biological necessity. I've done enough today. My worth is not tied to how much I accomplish." },
      { title: "Saying no to guilt", when: "You keep saying yes when you mean no.", text: "I'm allowed to change my mind. Saying no to this is saying yes to my own recovery. I don't owe anyone an explanation." },
    ],
  };

  const categories = [{ id: "work" as const, label: "Work & Jobs", emoji: "💼" }, { id: "academic" as const, label: "Academic", emoji: "📚" }, { id: "social" as const, label: "Social", emoji: "👥" }, { id: "self" as const, label: "Self-Talk", emoji: "💛" }];

  return (
    <main style={{ background: C.pageBg, minHeight: "calc(100vh - 62px)", padding: "40px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 27, fontWeight: 700, color: C.textPrimary, marginBottom: 8 }}>Words for Difficult Moments</h1>
          <p style={{ color: C.textSecondary, fontSize: 15, maxWidth: 460, margin: "0 auto", lineHeight: 1.7 }}>Describe your situation and get AI-generated scripts tailored to exactly who you need to talk to.</p>
        </div>

        <div style={{ background: C.surfaceBg, borderRadius: 18, padding: "22px", border: `1px solid ${C.cardBorder}`, marginBottom: 28 }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, color: C.textPrimary, marginBottom: 6 }}>Generate scripts for your situation</h2>
          <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>Describe who you need to set a boundary with and what happened.</p>
          <textarea
            value={situation}
            onChange={e => setSituation(e.target.value)}
            rows={3}
            placeholder="e.g. My manager keeps scheduling me on my study days even though I told them I'm unavailable. I need to say something but I'm scared of losing my job."
            style={{ width: "100%", border: `1px solid ${C.inputBorder}`, borderRadius: 12, padding: "11px 13px", fontSize: 14, background: C.inputBg, color: C.inputText, outline: "none", resize: "none", lineHeight: 1.55, fontFamily: "inherit" }}
          />
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["My manager is adding shifts during exam week", "I need an extension from my professor", "My friend expects too much from me"].map(ex => (
              <button key={ex} onClick={() => setSituation(ex)} style={{ background: "none", border: `1px solid ${C.cardBorder}`, borderRadius: 999, padding: "5px 11px", fontSize: 12, color: C.textSecondary, cursor: "pointer" }}>{ex}</button>
            ))}
          </div>
          <button onClick={generate} disabled={loading || !situation.trim()} style={{ marginTop: 12, background: situation.trim() && !loading ? C.accentPurple : (dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"), color: situation.trim() && !loading ? "#fff" : C.textMuted, border: "none", borderRadius: 999, padding: "11px 26px", fontSize: 14, fontWeight: 600, cursor: situation.trim() && !loading ? "pointer" : "not-allowed" }}>
            {loading ? "Writing scripts…" : "✦ Generate my scripts"}
          </button>
          {error && <p style={{ color: C.danger, fontSize: 13, marginTop: 9 }}>{error}</p>}
          {result && (
            <div style={{ marginTop: 20, borderTop: `1px solid ${C.cardBorder}`, paddingTop: 18 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Your personalized scripts</p>
              {result.scripts.map((s, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textMuted, marginBottom: 5 }}>{s.audience}</p>
                  <div style={{ position: "relative" }}>
                    <blockquote style={{ background: C.quoteBg, borderLeft: `3px solid ${C.accentPurple}`, borderRadius: "0 10px 10px 0", padding: "12px 48px 12px 13px", margin: 0, fontStyle: "italic", color: C.quoteText, lineHeight: 1.65, fontSize: 14 }}>"{s.script}"</blockquote>
                    <CopyBtn text={s.script} idx={i} copied={copied} onCopy={copy} dark={dark} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, color: C.textPrimary, marginBottom: 14 }}>Or browse template scripts</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 22 }}>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{ background: activeCategory === cat.id ? (dark ? "rgba(125,106,170,0.2)" : "rgba(125,106,170,0.1)") : C.surfaceBg, border: `${activeCategory === cat.id ? 2 : 1}px solid ${activeCategory === cat.id ? (dark ? "rgba(125,106,170,0.45)" : "rgba(125,106,170,0.35)") : C.cardBorder}`, borderRadius: 12, padding: "11px 6px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 18 }}>{cat.emoji}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: activeCategory === cat.id ? C.accentPurple : C.textSecondary }}>{cat.label}</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {TEMPLATES[activeCategory].map((s, idx) => (
            <div key={idx} style={{ background: C.surfaceBg, borderRadius: 18, padding: "22px", border: `1px solid ${C.cardBorder}` }}>
              <h3 style={{ fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>{s.title}</h3>
              <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}><strong style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>When: </strong>{s.when}</p>
              <div style={{ position: "relative" }}>
                <blockquote style={{ background: C.quoteBg, borderRadius: 12, padding: "14px 48px 14px 16px", margin: 0, borderLeft: `3px solid ${dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`, fontStyle: "italic", color: C.quoteText, lineHeight: 1.7, fontSize: 14 }}>"{s.text}"</blockquote>
                <CopyBtn text={s.text} idx={idx + 100} copied={copied} onCopy={copy} dark={dark} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Page() {
  const [page, setPage] = useState<PageType>("landing");
  const [resolved, theme, setTheme] = useTheme();
  const dark = resolved === "dark";
  const C = useColors(dark);
  const [balanceState, setBalanceState] = useState<BalanceFormState>({
    step: "form", result: null,
    wakeTime: "7:00 AM", sleepTime: "11:00 PM",
    workShifts: "", classes: "", mustDo: "", canMove: "",
    stress: 6, energy: 4, extra: "",
  });
  const navigate = (p: PageType) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <>
      <style>{`
        @keyframes bl-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-7px)}}
        @keyframes bl-float0{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes bl-float1{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes bl-float2{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @media(max-width:640px){.bl-desktop-nav{display:none!important}.bl-mobile-btn{display:flex!important}}
        *{box-sizing:border-box}
        body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:${C.pageBg};color:${C.textPrimary};transition:background 0.25s,color 0.25s}
        input,textarea{background:${C.inputBg}!important;color:${C.inputText}!important;border-color:${C.inputBorder}!important}
        input::placeholder,textarea::placeholder{color:${C.placeholder}!important}
        input:focus,textarea:focus{border-color:${C.accentGreen}!important;box-shadow:0 0 0 3px ${dark ? "rgba(107,158,150,0.18)" : "rgba(107,158,150,0.14)"}!important;outline:none!important}
        ::-webkit-scrollbar{width:6px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"};border-radius:3px}
      `}</style>
      <div style={{ minHeight: "100vh", background: C.pageBg, color: C.textPrimary }}>
        <Nav page={page} onNav={navigate} theme={theme} setTheme={setTheme} dark={dark} />
        {page === "landing"  && <LandingPage onNav={navigate} dark={dark} />}
        {page === "reflect"  && <ReflectPage dark={dark} />}
        {page === "balance"  && <BalancePage state={balanceState} setState={setBalanceState} dark={dark} />}
        {page === "scripts"  && <ScriptsPage dark={dark} />}
      </div>
    </>
  );
}