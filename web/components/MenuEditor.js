"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IconCamera, IconPlus } from "./Icons";
import { JobCard } from "./ReelStudio";
import { uploadPhoto } from "@/lib/upload-client";

const ACTIVE = ["queued", "running", "waiting_owner"];
const money = (p) => (p == null || p === "" ? "" : `$${Number(p).toFixed(2)}`);
const send = async (url, method, body) => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j;
};

function ImportMenu({ restaurantId, website, initialJob }) {
  const router = useRouter();
  const [url, setUrl] = useState(website || "");
  const [job, setJob] = useState(initialJob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = job && ACTIVE.includes(job.status);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/app/jobs?restaurant_id=${restaurantId}&kind=import`, { cache: "no-store" });
        const { jobs } = await r.json();
        const j = jobs?.[0];
        if (!j) return;
        setJob(j);
        if (!ACTIVE.includes(j.status)) router.refresh();
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [active, restaurantId, router]);

  async function start(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const j = await send("/api/app/import", "POST", { restaurant_id: restaurantId, url });
      setJob(j.job);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-lg stack gap-16">
      <div className="stack gap-4">
        <span className="panel-title">Import my menu from my website</span>
        <p className="small muted">Muse reads your website and brings in your dishes, prices and photos. You can edit everything after.</p>
      </div>
      <form className="row-wrap" onSubmit={start}>
        <input className="input" style={{ flex: "1 1 240px" }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourrestaurant.com" inputMode="url" autoComplete="url" aria-label="Your website" />
        <button className="btn btn-ghost" disabled={busy || active || !url.trim()}>{busy ? "Starting..." : active ? "Importing..." : "Import my menu"}</button>
      </form>
      {error ? <div className="alert alert-bad">{error}</div> : null}
      {job ? <JobCard j={job} /> : null}
    </div>
  );
}

function DishSheet({ restaurantId, dish, onClose, onSaved }) {
  const [f, setF] = useState({
    name: dish?.name || "", description: dish?.description || "", price: dish?.price ?? "", ai_note: dish?.ai_note || "", active: dish ? dish.active : true,
  });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(dish?.thumb || null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const input = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      setBusy("Saving...");
      const payload = { restaurant_id: restaurantId, name: f.name, description: f.description, price: f.price, ai_note: f.ai_note };
      const { dish: saved } = dish
        ? await send(`/api/app/dishes/${dish.id}`, "PATCH", { ...payload, active: f.active })
        : await send("/api/app/dishes", "POST", payload);
      if (file) {
        setBusy("Uploading the photo...");
        await uploadPhoto(file, { restaurantId, kind: "dish", dishId: saved.id });
      }
      onSaved();
    } catch (e2) {
      setError(e2.message);
      setBusy("");
    }
  }

  // On the body, above the page and its bottom bar (main is its own stacking context).
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={dish ? `Edit ${dish.name}` : "Add a dish"} onClick={(e) => e.stopPropagation()}>
        <form className="form" onSubmit={save}>
          <div className="row between">
            <span className="panel-title">{dish ? "Edit dish" : "Add a dish"}</span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>Close</button>
          </div>
          <div className="row gap-16">
            <button type="button" className="dish-thumb" style={{ width: 96, height: 96, border: 0, cursor: "pointer" }} onClick={() => input.current?.click()} aria-label="Choose a photo">
              {preview ? <img src={preview} alt="" /> : <IconCamera size={28} />}
            </button>
            <div className="stack gap-4">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>{preview ? "Change photo" : "Add a photo"}</button>
              <span className="field-hint">A real photo of this dish. Muse never invents the food.</span>
            </div>
            <input ref={input} type="file" accept="image/*" hidden onChange={(e) => {
              const fl = e.target.files?.[0];
              if (!fl) return;
              setFile(fl);
              setPreview(URL.createObjectURL(fl));
            }} />
          </div>
          <label className="field">
            <span className="field-label">Name</span>
            <input className="input" value={f.name} onChange={set("name")} required maxLength={120} />
          </label>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Price</span>
              <input className="input" value={f.price} onChange={set("price")} inputMode="decimal" placeholder="12.50" />
            </label>
            {dish ? (
              <div className="field">
                <span className="field-label">In Reels</span>
                <label className="toggle" style={{ minHeight: 48 }}>
                  <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
                  Muse can use this dish
                </label>
              </div>
            ) : null}
          </div>
          <label className="field">
            <span className="field-label">Description</span>
            <textarea className="textarea" value={f.description} onChange={set("description")} maxLength={1500} placeholder="What the customer reads on the menu." />
          </label>
          <label className="field">
            <span className="field-label">Anything Muse should know about this dish?</span>
            <textarea className="textarea" value={f.ai_note} onChange={set("ai_note")} maxLength={1500} placeholder="The cheese is Dominican cheddar. The onion goes on the plancha, the tomato never does." />
            <span className="field-hint">Muse takes your word above what it sees in the photo.</span>
          </label>
          {error ? <div className="alert alert-bad">{error}</div> : null}
          <button className="btn btn-primary btn-block" disabled={!!busy}>{busy || (dish ? "Save" : "Add dish")}</button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function DishPhotoButton({ restaurantId, dish, onDone }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className="dish-thumb" style={{ border: 0, cursor: "pointer", padding: 0 }} onClick={() => input.current?.click()} aria-label={dish.thumb ? `Change the photo of ${dish.name}` : `Add a photo of ${dish.name}`}>
        {dish.thumb ? <img src={dish.thumb} alt={dish.name} loading="lazy" /> : <IconCamera size={24} />}
        {busy ? <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.55)", fontSize: 12 }}>Uploading</span> : null}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={async (e) => {
        const fl = e.target.files?.[0];
        e.target.value = "";
        if (!fl) return;
        setBusy(true);
        try { await uploadPhoto(fl, { restaurantId, kind: "dish", dishId: dish.id }); onDone(); }
        catch (err) { alert(err.message); }
        finally { setBusy(false); }
      }} />
    </>
  );
}

export default function MenuEditor({ restaurantId, dishes, website, importJob }) {
  const router = useRouter();
  const [open, setOpen] = useState(null); // null | "new" | dish
  const withPhoto = dishes.filter((d) => d.thumb).length;
  const done = () => { setOpen(null); router.refresh(); };

  return (
    <>
      <ImportMenu restaurantId={restaurantId} website={website} initialJob={importJob} />
      <section className="stack gap-16">
        <div className="row between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="stack gap-4">
            <span className="panel-title">Your dishes</span>
            <span className="small dim">{dishes.length ? `${dishes.length} dish${dishes.length === 1 ? "" : "es"}, ${withPhoto} with a photo` : "Nothing here yet"}</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setOpen("new")}><IconPlus size={18} /> Add a dish</button>
        </div>
        {dishes.length ? (
          <div className="dish-list">
            {dishes.map((d) => (
              <div className={`dish ${d.active ? "" : "dish-off"}`} key={d.id}>
                <DishPhotoButton restaurantId={restaurantId} dish={d} onDone={() => router.refresh()} />
                <div className="stack gap-4" style={{ minWidth: 0 }}>
                  <div className="row between" style={{ alignItems: "flex-start" }}>
                    <span className="dish-name">{d.name}</span>
                    <span className="small" style={{ fontWeight: 600, flex: "none" }}>{money(d.price)}</span>
                  </div>
                  {d.description ? <span className="small muted" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{d.description}</span> : null}
                  {d.ai_note ? <span className="small" style={{ color: "var(--accent-2)" }}>Note for Muse: {d.ai_note}</span> : null}
                  <div className="row-wrap" style={{ gap: 6 }}>
                    {!d.thumb ? <span className="chip chip-warn">Needs a photo</span> : null}
                    {!d.active ? <span className="chip">Not in Reels</span> : null}
                    <button className="btn btn-quiet btn-sm" style={{ paddingLeft: 0 }} onClick={() => setOpen(d)}>Edit</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">Import your menu from your website, or add your dishes one by one. Each one with a real photo.</div>
        )}
      </section>
      {open ? <DishSheet restaurantId={restaurantId} dish={open === "new" ? null : open} onClose={() => setOpen(null)} onSaved={done} /> : null}
    </>
  );
}
