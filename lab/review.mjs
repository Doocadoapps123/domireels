// Lab: Muse Spark reviews one draft of a direct.mjs run again (free to re-run, no video cost).
// Usage: node --env-file=../.env lab/review.mjs <run dir> <clip index> <draft.mp4> [<first frame.jpg>]
//   The first frame defaults to REAL or <dir>/real.jpg for real_photo clips. PHOTO defaults to lab/photos/<run>.jpg.
import fs from "node:fs";
import path from "node:path";
import { reviewDraft, loadPlaybook } from "../src/director.mjs";
const [dir, idx, video, startArg] = process.argv.slice(2);
const json = (f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
const clip = json("concepts.json")[json("verdict.json").winner].clips[+idx];
const start = startArg || (clip.start === "real_photo" ? process.env.REAL || `${dir}/real.jpg` : null);
const photo = fs.readFileSync(process.env.PHOTO || `lab/photos/${path.basename(dir)}.jpg`);
const r = await reviewDraft(photo, video, json("card.json"), clip, loadPlaybook(), start && fs.readFileSync(start));
console.log(JSON.stringify(r, null, 2));
