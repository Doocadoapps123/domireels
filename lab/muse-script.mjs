// Lab: Muse writes the words of a script (each hidden layer's edit and each shot's motion) from the real
// photo and the owner's card. The script keeps its frames and shots; only the words come from Muse.
// Usage: node --env-file=../.env lab/muse-script.mjs <script.json> [layer names and shot numbers to take]
//   With no names it takes all of them. Muse's full answer is saved next to the frames as muse-words.json.
import fs from "node:fs";
import path from "node:path";
import { writeScript, loadPlaybook } from "../src/director.mjs";

const [file, ...take] = process.argv.slice(2);
const script = JSON.parse(fs.readFileSync(file, "utf8")), dir = path.dirname(script.real);
const plan = {
  layers: script.layers.map(({ name, from, shows }) => ({ name, from, shows })),
  shots: script.shots.filter((s) => s.kind !== "stock").map(({ n, start, end, what }) => ({ n, start, end, what })),
};
const words = await writeScript(fs.readFileSync(script.photo), script.card, plan, loadPlaybook());
fs.writeFileSync(`${dir}/muse-words.json`, JSON.stringify(words, null, 2));
const wanted = (k) => !take.length || take.includes(String(k));
for (const l of words.layers) if (wanted(l.name)) Object.assign(script.layers.find((x) => x.name === l.name) || {}, { remove: l.remove, by: "muse" });
for (const s of words.shots) if (wanted(s.n)) Object.assign(script.shots.find((x) => x.n === s.n) || {}, { motion: s.motion, by: "muse" });
fs.writeFileSync(file, JSON.stringify(script, null, 2) + "\n");
console.log(JSON.stringify(words, null, 2));
