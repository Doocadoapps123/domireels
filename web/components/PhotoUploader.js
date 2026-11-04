"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCamera } from "./Icons";
import { uploadPhoto } from "@/lib/upload-client";

export default function PhotoUploader({ restaurantId }) {
  const router = useRouter();
  const input = useRef(null);
  const [items, setItems] = useState([]);
  const [over, setOver] = useState(false);
  const busy = items.some((i) => i.state === "uploading" || i.state === "waiting");

  async function take(files) {
    const list = [...files].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)).slice(0, 30);
    if (!list.length) return;
    const start = items.length;
    setItems((x) => [...x, ...list.map((f) => ({ name: f.name, state: "waiting" }))]);
    let added = 0;
    // Three at a time: fast on wifi, gentle on a phone's data.
    let next = 0;
    const work = async () => {
      while (next < list.length) {
        const i = next++, f = list[i], at = start + i;
        setItems((x) => x.map((it, j) => (j === at ? { ...it, state: "uploading" } : it)));
        try {
          const r = await uploadPhoto(f, { restaurantId, kind: "library" });
          if (!r.exists) added++;
          setItems((x) => x.map((it, j) => (j === at ? { ...it, state: r.exists ? "already" : "done" } : it)));
        } catch (e) {
          setItems((x) => x.map((it, j) => (j === at ? { ...it, state: "error", error: e.message } : it)));
        }
      }
    };
    await Promise.all([work(), work(), work()]);
    if (added) router.refresh();
  }

  const label = { waiting: "Waiting", uploading: "Uploading", done: "Added", already: "Already here", error: "Failed" };
  const color = { done: "var(--good)", already: "var(--dim)", error: "var(--bad)" };

  return (
    <div className="stack gap-12">
      <div
        className={`dropzone ${over ? "over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      >
        <IconCamera size={30} />
        <strong>{busy ? "Uploading your photos..." : "Add photos"}</strong>
        <span className="small muted">Your food, the kitchen, the fryer, the plancha, the storefront. Tap to choose, or drop them here.</span>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      </div>
      {items.length ? (
        <div className="progress-list">
          {items.map((it, i) => (
            <div key={i} className="row between">
              <span className="dim" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
              <span style={{ color: color[it.state] || "var(--muted)", flex: "none" }} title={it.error || ""}>{label[it.state]}{it.error ? `: ${it.error}` : ""}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
