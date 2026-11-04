// Lab: run a shot-by-shot script agreed with the owner. Real stock footage for the equipment,
// the real photo for the dish, AI only where the dish has to move (started from real pixels).
// Usage: node --env-file=../.env lab/scripted.mjs <script.json> prep
//        node --env-file=../.env lab/scripted.mjs <script.json> draft <shot n> [start.jpg] [end.jpg]
//        node --env-file=../.env lab/scripted.mjs <script.json> cut <draft for each ai shot, in order...>
//        node --env-file=../.env lab/scripted.mjs <script.json> music
//        node --env-file=../.env lab/scripted.mjs <script.json> edit
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { museEdit } from "../src/film.mjs";
import { omni } from "../src/video.mjs";
import { reviewDraft, loadPlaybook } from "../src/director.mjs";
import { measure, spills, pct } from "../src/contain.mjs";
import { V, music, render, source as stockClip } from "../src/edit.mjs";

const [file, step, ...args] = process.argv.slice(2);
const script = JSON.parse(fs.readFileSync(file, "utf8"));
const out = `lab/out/scripted/${path.basename(file, ".json")}`;
fs.mkdirSync(out, { recursive: true });
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
const source = (name) => stockClip(script, out, name);

// Shot 4: the real photo, handheld. A slow push-in with a small shake that lands on the crop shot 5 starts from.
// Worked at 2x so the move stays smooth; the shake fades out so the last frame is exactly CROP.
const CROP = script.crop || { w: 800, h: 1422, x: 60, y: 230 }, FROM = { w: 1040, x: 20, y: 35 };
function photoShot(shot) {
  const n = Math.round(shot.dur * 24), t = `(on/${n - 1})`;
  const z = `2160/(2*(${FROM.w}+(${CROP.w - FROM.w})*${t}))`;
  const x = `2*(${FROM.x}+${CROP.x - FROM.x}*${t})+6*(1-${t})*sin(on/3)`;
  const y = `2*(${FROM.y}+${CROP.y - FROM.y}*${t})+6*(1-${t})*cos(on/4)`;
  ff("-i", script.real, "-vf", `scale=2160:3840,zoompan=z='${z}':x='${x}':y='${y}':d=${n}:s=1080x1920:fps=24,setsar=1`,
    "-frames:v", String(n), "-c:v", "libx264", "-pix_fmt", "yuv420p", `${out}/shot-${shot.n}.mp4`);
}

if (step === "prep") {
  for (const s of script.shots) {
    if (s.kind === "stock") {
      const vf = s.crop ? `crop=${s.crop},${V}` : V;
      ff("-ss", String(s.at), "-i", await source(s.src), "-t", String(s.dur), "-an", "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", `${out}/shot-${s.n}.mp4`);
    } else if (s.kind === "photo") photoShot(s);
    else if (s.base === "real-crop") {
      await sharp(script.real).extract({ left: CROP.x, top: CROP.y, width: CROP.w, height: CROP.h }).resize(1080, 1920).jpeg({ quality: 94 }).toFile(`${out}/base-${s.n}.jpg`);
    } else if (s.base?.src && !fs.existsSync(`${out}/base-${s.n}-0.jpg`)) {
      const raw = `${out}/raw-${s.n}.jpg`;
      ff("-ss", String(s.base.at), "-i", await source(s.base.src), "-frames:v", "1", "-vf", V, "-q:v", "2", raw);
      const images = [raw, script.photo, ...(script.refs || [])].map((f) => fs.readFileSync(f));
      for (const i of [0, 1]) fs.writeFileSync(`${out}/base-${s.n}-${i}.jpg`, await museEdit(s.swap, images));
    }
    console.log(`shot ${s.n} ready`);
  }
} else if (step === "draft") {
  // Start and end frames come from the command line, or by name from the shot ("empty" -> <out>/empty.jpg).
  const s = script.shots.find((x) => x.n === +args[0]), frame = (k) => k && (k === "real" ? script.real : `${out}/${k}.jpg`);
  const n = args[0], start = args[1] || frame(s.start), end = args[2] || frame(s.end);
  const k = fs.readdirSync(out).filter((f) => f.startsWith(`draft-${n}-`) && f.endsWith(".mp4")).length;
  const draft = `${out}/draft-${n}-${k}.mp4`, container = script.container || "container";
  // Food hanging outside its container is caught here for free, before the $0.12 draft (src/contain.mjs).
  for (const f of [start, end].filter(Boolean)) {
    const m = await measure(fs.readFileSync(f), container);
    if (spills(m)) throw new Error(`${f}: ${pct(m)} of the food outside the ${container}, no draft made`);
  }
  console.log(await omni({ start, end, prompt: s.motion, out: draft }));
  ff("-sseof", "-0.1", "-i", draft, "-frames:v", "1", "-q:v", "2", `${out}/draft-${n}-${k}-last.jpg`);
  const card = script.card || JSON.parse(fs.readFileSync("lab/out/direct/chicharron/card.json", "utf8"));
  const review = await reviewDraft(script.photo, draft, card, { motion: s.motion, start: s.base?.src ? "drawn" : "real_photo" }, loadPlaybook(), start);
  const last = await measure(fs.readFileSync(`${out}/draft-${n}-${k}-last.jpg`), container);
  review.outside = pct(last);
  if (spills(last)) Object.assign(review, { approved: false, physics_errors: [...review.physics_errors, `last frame: ${pct(last)} of the food outside the ${container}`] });
  fs.writeFileSync(draft.replace(".mp4", ".review.json"), JSON.stringify(review, null, 2));
  console.log(JSON.stringify(review, null, 2));
} else if (step === "cut") {
  // Each AI draft is trimmed to the seconds the script uses; everything is scaled to one 1080x1920 timeline.
  const drafts = [...args];
  const parts = script.shots.map((s) => {
    if (s.kind !== "ai") return `${out}/shot-${s.n}.mp4`;
    const p = `${out}/use-${s.n}.mp4`;
    ff("-i", drafts.shift(), "-t", String(s.use), "-an", "-vf", V, "-c:v", "libx264", "-pix_fmt", "yuv420p", p);
    return p;
  });
  fs.writeFileSync(`${out}/concat.txt`, parts.map((p) => `file '${path.resolve(p)}'`).join("\n"));
  ff("-f", "concat", "-safe", "0", "-i", `${out}/concat.txt`, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", `${out}/preview.mp4`);
  console.log(`${out}/preview.mp4`);
} else if (step === "music") await music(script, out);
else if (step === "edit") await render(script, out);
