// Lab: the owner's note on one frame, turned by Muse into an edit of that frame (nothing else changes),
// measured for food outside the container. The old frame is kept as <name>-before.jpg.
// Usage: node --env-file=../.env lab/fixframe.mjs <script.json> <frame name> "<note>" [who said it, default the owner]
import fs from "node:fs";
import path from "node:path";
import { museEdit } from "../src/film.mjs";
import { fixFrame } from "../src/director.mjs";
import { measure, spills, pct } from "../src/contain.mjs";

const [file, name, note, who] = process.argv.slice(2);
const script = JSON.parse(fs.readFileSync(file, "utf8")), f = `${path.dirname(script.real)}/${name}.jpg`, container = script.container || "container";
const { edit } = await fixFrame(fs.readFileSync(script.photo), fs.readFileSync(f), script.card, note, who);
console.log(edit);
const out = await museEdit(`${edit} Keep everything else exactly the same: the container, the counter, the light, the camera angle and the framing. No text, no hands.`, fs.readFileSync(f));
const m = await measure(out, container);
if (spills(m)) throw new Error(`${pct(m)} of the food outside the ${container}, not saved`);
fs.copyFileSync(f, f.replace(/\.jpg$/, "-before.jpg"));
fs.writeFileSync(f, out);
console.log(`${name}.jpg (${pct(m)} outside the ${container})`);
