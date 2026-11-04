"use client";
// First time in the app: which equipment the kitchen uses, then where to send photos. Until the owner sends a photo of
// a piece of equipment, Muse uses a provisional one when a Reel needs it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconWhatsApp } from "./Icons";
import { WA_LINK, WA_PRETTY } from "@/lib/constants";
import { EQUIPMENT } from "@/lib/equipment";

export default function EquipmentSetup({ restaurantId }) {
  const router = useRouter();
  const [picked, setPicked] = useState([]), [other, setOther] = useState(""), [step, setStep] = useState(1), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  async function save() {
    // Nobody cooks without equipment: with nothing marked, the owner writes what they use.
    if (!picked.length && other.trim().length < 3) { setErr("Every kitchen cooks with something. Write what you use (a stove, a fryer, a comal, a rice cooker...)."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/app/equipment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurant_id: restaurantId, equipment: picked, other: other.trim() }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Could not save.");
      setStep(2);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  if (step === 2) return (
    <section className="card stack gap-16">
      <span className="panel-title">Now send your photos</span>
      <p>Send photos of your food{picked.length ? " and of your equipment" : ""}. Upload them here or send them to Domi Reels on WhatsApp. You can also write or send a voice note there.</p>
      {picked.length ? <p className="small muted">Until you send a photo of your own equipment, Muse uses a provisional one if a Reel needs it. Your photo replaces it as soon as it arrives.</p> : null}
      <div className="row-wrap" style={{ gap: 8 }}>
        <Link href="/app/photos" className="btn btn-primary">Upload photos</Link>
        <a href={WA_LINK} target="_blank" rel="noreferrer" className="btn btn-ghost"><IconWhatsApp size={18} />{WA_PRETTY}</a>
        <button className="btn btn-quiet" onClick={() => router.refresh()}>Done</button>
      </div>
    </section>
  );
  return (
    <section className="card stack gap-16">
      <span className="panel-title">What does your kitchen cook with?</span>
      <p className="muted">Pick everything you use. Muse films your food where it is really made.</p>
      <div className="chips">
        {EQUIPMENT.map((e) => (
          <button key={e.key} type="button" onClick={() => toggle(e.key)} className={`chip ${picked.includes(e.key) ? "chip-accent" : ""}`} style={{ cursor: "pointer" }} aria-pressed={picked.includes(e.key)}>
            {picked.includes(e.key) ? "✓ " : ""}{e.label}
          </button>
        ))}
      </div>
      <label className="stack gap-8">
        <span className="small muted">{picked.length ? "Anything else? (optional)" : "Not on the list? Write what you cook with"}</span>
        <input className="input" value={other} onChange={(e) => setOther(e.target.value)} placeholder="e.g. comal, rice cooker, smoker" maxLength={200} />
      </label>
      {err ? <p className="small" style={{ color: "var(--bad, #d33)" }}>{err}</p> : null}
      <div><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving..." : "Continue"}</button></div>
    </section>
  );
}
