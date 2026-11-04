"use client";
// "Make a Reel now" and what Muse is working on, refreshed every few seconds while something is in the works.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSpark, IconWhatsApp } from "./Icons";
import { WA_LINK } from "@/lib/constants";

const ACTIVE = ["queued", "running", "waiting_owner"];
const KIND = { reel: "New Reel", remusic: "New music", storyboard: "Storyboard", import: "Menu import", equipment: "Kitchen equipment" };
const STATUS = {
  queued: { t: "In line", c: "chip", dot: true },
  running: { t: "Muse is working on it", c: "chip chip-accent", dot: true, pulse: true },
  waiting_owner: { t: "Muse has a question", c: "chip chip-warn", dot: true, pulse: true },
  done: { t: "Ready", c: "chip chip-good" },
  failed: { t: "Did not make it", c: "chip chip-bad" },
  cancelled: { t: "Cancelled", c: "chip" },
};
const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function JobCard({ j, reelLink }) {
  const s = STATUS[j.status] || { t: j.status, c: "chip" };
  return (
    <div className="job">
      <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="row gap-8"><strong>{KIND[j.kind] || j.kind}</strong><span className="small dim" suppressHydrationWarning>{ago(j.created_at)}</span></div>
        <span className={s.c}>{s.dot ? <span className={`dot ${s.pulse ? "dot-pulse" : ""}`} /> : null}{s.t}</span>
      </div>
      {j.status === "running" && j.kind === "reel" ? <p className="small muted">Muse is planning the shots, filming takes and keeping only the good seconds. This takes a while.</p> : null}
      {j.status === "queued" ? <p className="small muted">Muse will start on it shortly.</p> : null}
      {j.kind === "import" && j.url ? <p className="small dim" style={{ wordBreak: "break-all" }}>{j.url}</p> : null}
      {j.status === "waiting_owner" ? (
        <div className="job-q">
          <span className="small" style={{ fontWeight: 600 }}>Before it continues, Muse needs to know:</span>
          {j.questions?.length ? <ol className="small">{j.questions.map((q, i) => <li key={i}>{q.ask}{q.options?.length ? <span className="dim"> ({q.options.join(" / ")})</span> : null}</li>)}</ol> : null}
          <a href={WA_LINK} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm mt-12"><IconWhatsApp size={18} /> Answer on WhatsApp</a>
        </div>
      ) : null}
      {j.status === "done" && j.kind === "reel" && reelLink ? <a href={reelLink} className="link small">Watch it</a> : null}
      {j.status === "failed" ? (
        <details className="small muted">
          <summary style={{ cursor: "pointer" }}>Muse could not finish this one. Details</summary>
          <p className="dim mt-8" style={{ wordBreak: "break-word" }}>{j.error || "No details."}</p>
        </details>
      ) : null}
    </div>
  );
}

// Jobs still in the works, and the ones that ended in the last three days.
const recent = (list) => list
  .filter((j) => j.kind !== "import" && j.status !== "cancelled")
  .filter((j) => ACTIVE.includes(j.status) || Date.now() - new Date(j.updated_at).getTime() < 3 * 86400000)
  .slice(0, 6);

export default function ReelStudio({ restaurantId, initialJobs, reelLinks, canMake, cannotWhy }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [fromServer, setFromServer] = useState(initialJobs);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ t: "", bad: false });
  const current = useRef(initialJobs);

  // A refresh from the server (after a job finished) brings new jobs and new Reels.
  if (fromServer !== initialJobs) {
    setFromServer(initialJobs);
    setJobs(initialJobs);
  }
  useEffect(() => { current.current = jobs; }, [jobs]);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/app/jobs?restaurant_id=${restaurantId}`, { cache: "no-store" });
      if (!r.ok) return;
      const next = recent((await r.json()).jobs || []);
      const finished = current.current.some((o) => ACTIVE.includes(o.status) && next.find((n) => n.id === o.id && !ACTIVE.includes(n.status)));
      setJobs(next);
      if (finished) router.refresh();
    } catch {}
  }, [restaurantId, router]);

  const anyActive = jobs.some((j) => ACTIVE.includes(j.status));
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [anyActive, poll]);

  async function make() {
    setBusy(true);
    setMsg({ t: "", bad: false });
    try {
      const r = await fetch("/api/app/reels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurant_id: restaurantId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not start the Reel.");
      setMsg({ t: "Muse is on it. Your Reel will arrive on WhatsApp, and here.", bad: false });
      await poll();
    } catch (e) {
      setMsg({ t: e.message, bad: true });
    } finally {
      setBusy(false);
    }
  }

  const shown = jobs;

  return (
    <div className="stack gap-16">
      <div className="make">
        <div className="stack gap-8">
          <p className="display" style={{ fontSize: "clamp(1.5rem, 4.5vw, 2rem)", lineHeight: 1.15 }}>Muse picks the dish, directs the shots and sends you the Reel.</p>
          {!canMake && cannotWhy ? <p className="small muted">{cannotWhy}</p> : null}
        </div>
        <button className="btn btn-primary" onClick={make} disabled={busy || !canMake || jobs.some((j) => j.kind === "reel" && ACTIVE.includes(j.status))}>
          <IconSpark size={20} /> {busy ? "Starting..." : "Make a Reel now"}
        </button>
      </div>
      {msg.t ? <div className={`alert ${msg.bad ? "alert-bad" : "alert-good"}`}>{msg.t}</div> : null}
      {shown.length ? (
        <div className="stack gap-12">
          <span className="panel-title">In the works</span>
          <div className="jobs">{shown.map((j) => <JobCard key={j.id} j={j} reelLink={j.reel_id ? reelLinks?.[j.reel_id] : null} />)}</div>
        </div>
      ) : null}
    </div>
  );
}
