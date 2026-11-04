"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourLabel = (h) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}`;

function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, t]) => <button type="button" key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>)}
    </div>
  );
}

export default function SettingsForm({ restaurant: r, timezones }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: r.name || "", cuisine: r.cuisine || "", city: r.city || "", language: r.language || "en", website: r.website || "",
    timezone: r.timezone || "America/New_York", delivery_day: r.delivery_day, delivery_hour: r.delivery_hour,
    reels_per_week: r.reels_per_week, music_options: r.music_options,
  });
  const [state, setState] = useState({ busy: false, msg: "", bad: false });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const put = (k) => (v) => setF({ ...f, [k]: v });

  async function save(e) {
    e.preventDefault();
    setState({ busy: true, msg: "", bad: false });
    try {
      const res = await fetch("/api/app/restaurant", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurant_id: r.id, ...f }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not save.");
      if (j.restaurant?.website !== undefined) setF((x) => ({ ...x, website: j.restaurant.website || "" }));
      setState({ busy: false, msg: "Saved.", bad: false });
      router.refresh();
    } catch (e2) {
      setState({ busy: false, msg: e2.message, bad: true });
    }
  }

  return (
    <form className="card card-lg form" onSubmit={save}>
      <span className="panel-title">Your restaurant</span>
      <label className="field">
        <span className="field-label">Name</span>
        <input className="input" value={f.name} onChange={set("name")} required maxLength={120} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span className="field-label">Cuisine</span>
          <input className="input" value={f.cuisine} onChange={set("cuisine")} placeholder="Dominican, tacos, bakery..." maxLength={120} />
        </label>
        <label className="field">
          <span className="field-label">City</span>
          <input className="input" value={f.city} onChange={set("city")} placeholder="Orlando" maxLength={120} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Website</span>
        <input className="input" value={f.website} onChange={set("website")} placeholder="yourrestaurant.com" inputMode="url" />
      </label>
      <div className="grid-2">
        <div className="field">
          <span className="field-label">Language for your Reels and messages</span>
          <Seg label="Language" value={f.language} onChange={put("language")} options={[["en", "English"], ["es", "Spanish"]]} />
        </div>
        <label className="field">
          <span className="field-label">Timezone</span>
          <select className="select" value={f.timezone} onChange={set("timezone")}>
            {timezones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </label>
      </div>

      <div className="stack gap-4 mt-8">
        <span className="panel-title" style={{ fontSize: "1.15rem" }}>Weekly Reels</span>
        <span className="small dim">Muse makes them the day before and sends them on your day, at your hour.</span>
      </div>
      <div className="field">
        <span className="field-label">Reels per week</span>
        <Seg label="Reels per week" value={+f.reels_per_week} onChange={put("reels_per_week")} options={[[0, "Off"], [1, "1"], [2, "2"], [3, "3"]]} />
      </div>
      <div className="field">
        <span className="field-label">Delivery day</span>
        <Seg label="Delivery day" value={+f.delivery_day} onChange={put("delivery_day")} options={DAYS.map((d, i) => [i, d])} />
      </div>
      <label className="field">
        <span className="field-label">Delivery hour</span>
        <select className="select" value={f.delivery_hour} onChange={(e) => setF({ ...f, delivery_hour: +e.target.value })}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
        </select>
      </label>
      <div className="field">
        <span className="field-label">Music versions of each Reel</span>
        <Seg label="Music versions" value={+f.music_options} onChange={put("music_options")} options={[[1, "1"], [2, "2"], [3, "3"]]} />
        <span className="field-hint">The same cut with different songs. You pick the one you like and Muse learns your taste.</span>
      </div>
      {state.msg ? <div className={`alert ${state.bad ? "alert-bad" : "alert-good"}`}>{state.msg}</div> : null}
      <button className="btn btn-primary" disabled={state.busy}>{state.busy ? "Saving..." : "Save changes"}</button>
    </form>
  );
}
