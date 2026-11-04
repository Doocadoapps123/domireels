// Lab: one draft clip. Usage: node --env-file=../.env lab/draft.mjs <start.jpg> "<prompt>" <out.mp4> [end.jpg]
// RES=720p|1080p for finals. BUDGET (USD, default 10) caps the total in lab/out/ledger.jsonl.
import { omni } from "../src/video.mjs";
const [start, prompt, out, end] = process.argv.slice(2);
const r = await omni({ start, prompt, out, end, res: process.env.RES || "360p", duration: +(process.env.DUR || 4) });
console.log(`${r.out} $${r.cost} (total $${r.total})`);
