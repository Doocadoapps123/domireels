// Lab: deep study of every reference Reel in lab/inspo -> lab/out/study/<name>.json
// Usage: node --env-file=../.env lab/study.mjs
import fs from "node:fs";
import path from "node:path";
import { study } from "../src/study.mjs";
fs.mkdirSync("lab/out/study", { recursive: true });
const files = fs.readdirSync("lab/inspo").filter((f) => f.endsWith(".mp4"));
await Promise.all(files.map(async (f) => {
  const out = `lab/out/study/${path.basename(f, ".mp4")}.json`;
  if (fs.existsSync(out)) return;
  const s = await study(`lab/inspo/${f}`).catch((e) => ({ error: e.message }));
  fs.writeFileSync(out, JSON.stringify(s, null, 2));
  console.log(f, s.error || `${s.duration}s, ${s.shots.length} shots, feasible ${s.feasible_for_domi}`);
}));
