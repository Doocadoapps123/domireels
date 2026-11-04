// The way out: a finished Reel goes back to the restaurant's ordering platform as a draft for the owner, never a post.
// Contract domi-reels/drop@1 (docs/CONTRACT.md): open -> upload reel.mp4 and cover.jpg -> close with the words.
// The platform takes it to the owner on its own channel (Doocado: WhatsApp); the owner posts it.
// Only a Reel Muse approved in its last look goes out, unless `force` (a person decided).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { ask } from "./director.mjs";

const PLATFORMS = { doocado: () => ({ url: process.env.DOOCADO_DROP_URL, token: process.env.DOOCADO_REELS_TOKEN }) };
const LANG = { en: "English", es: "Spanish" };

// target: the platform's drop url and token, when the server passes them from the platform's account.
export async function deliver({ dir, menuDir, platform = "doocado", force = false, target = null }) {
  const script = JSON.parse(fs.readFileSync(`${dir}/script.json`, "utf8")), review = JSON.parse(fs.readFileSync(`${dir}/review.json`, "utf8"));
  const menu = JSON.parse(fs.readFileSync(`${menuDir}/menu.json`, "utf8")), final = `${dir}/final.mp4`;
  if (!review.approved && !force) return { stop: "review", problems: review.problems };
  if (!menu.restaurant_id) throw new Error(`${menuDir} is not a kit: no restaurant_id`);
  const p = target || PLATFORMS[platform]?.();
  if (!p?.url || !p.token) throw new Error(`${platform}: no drop url or token in the environment`);
  const post = (body) => fetch(p.url, { method: "POST", headers: { "x-reels-token": p.token, "Content-Type": "application/json" }, body: JSON.stringify({ restaurant_id: menu.restaurant_id, run: dir.split("/").pop(), ...body }) })
    .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(`${platform} drop ${r.status}: ${j.error}`); return j; });

  // The cover is the payoff frame: the moment the Reel was built for.
  const payoff = script.edit.reduce((t, e) => (e.payoff != null ? { at: t.at + e.payoff, done: true } : t.done ? t : { at: t.at + e.dur }), { at: 0 }).at;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(payoff), "-i", final, "-frames:v", "1", "-q:v", "2", `${dir}/cover.jpg`]);
  const dishIds = [...new Set(script.dishes || [menu.items.find((m) => script.dish?.startsWith(`${m.name} (`))?.id, ...script.shots.map((s) => s.dish)].filter(Boolean))];
  const dishes = dishIds.map((id) => menu.items.find((m) => m.id === id)).filter(Boolean);

  // The platform's storage takes up to 50 MB a file. Our master is ~37 Mbps (Santia's: 54 MB for 11.6 s, refused 487
  // times on 4 Nov). Instagram re-encodes every Reel to a few Mbps, so a copy capped to fit 45 MB (~30 Mbps for 12 s) is
  // the same Reel to the eye. The master stays as it is; only the delivered copy is capped.
  let send = final;
  if (fs.statSync(final).size > 45e6) {
    const dur = +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", final]).toString().trim();
    const kbps = Math.floor((45e6 * 8) / dur / 1000) - 320;
    send = `${dir}/final-deliver.mp4`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", final, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-maxrate", `${kbps}k`, "-bufsize", `${kbps}k`, "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", send]);
  }
  const { upload } = await post({ action: "open" });
  for (const [name, file, type] of [["reel.mp4", send, "video/mp4"], ["cover.jpg", `${dir}/cover.jpg`, "image/jpeg"]]) {
    const r = await fetch(upload[name], { method: "PUT", headers: { "Content-Type": type, "x-upsert": "true" }, body: fs.readFileSync(file) });
    if (!r.ok) throw new Error(`upload ${name}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  const ledger = "lab/out/ledger.jsonl", cost = fs.readFileSync(ledger, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((l) => l.out?.startsWith(dir)).reduce((s, l) => s + l.cost, 0);
  // Every Reel holds AI video, so the owner is told to turn on Instagram's AI label when posting.
  const drop = await post({ action: "close", title: script.concept, owner_summary: script.owner_summary, dishes: dishes.map((d) => d.id), ai_label: true, cost: +cost.toFixed(2) });
  fs.writeFileSync(`${dir}/drop.json`, JSON.stringify(drop, null, 2) + "\n");
  return { stop: "delivered", ...drop };
}
