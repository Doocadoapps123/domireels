// Lab: take the real dish apart, one layer at a time, so every build shot starts and ends on frames made
// from the real photo. Each step edits the previous one, so pan, table, light and framing never move.
// Usage: node --env-file=../.env lab/strip.mjs <real 9:16 frame> <out dir> [in=<container>] <name>="<what to remove>" [ref=<photo>] ...
//   A step whose name starts with "@" edits the real frame instead of the previous step (an empty plate, say).
//   Every step is measured: food outside the container gets one redraw, then the run stops.
// Or: node --env-file=../.env lab/strip.mjs <script.json> [layer names]
//   runs the layers the script lists (Muse writes their words with lab/muse-script.mjs); each edits its "from" frame.
import fs from "node:fs";
import path from "node:path";
import { peel } from "../src/frames.mjs";

let [real, dir, ...steps] = process.argv.slice(2), container = "container";
if (real.endsWith(".json")) {
  const script = JSON.parse(fs.readFileSync(real, "utf8")), names = [dir, ...steps].filter(Boolean);
  real = script.real; dir = path.dirname(real); container = script.container || container;
  steps = script.layers.filter((l) => !names.length || names.includes(l.name))
    .map((l) => ({ name: l.name, what: l.remove, from: l.from === "real" ? real : `${dir}/${l.from}.jpg` }));
} else {
  steps = steps.map((s) => { const [k, ...v] = s.split("="); return { k, what: v.join("=") }; });
}
let prev = fs.readFileSync(real), ref = null;
for (const { k = "", what, ...s } of steps) {
  if (k === "ref") { ref = fs.readFileSync(what); continue; }
  if (k === "in") { container = what; continue; }
  const from = s.from ? fs.readFileSync(s.from) : k.startsWith("@") ? fs.readFileSync(real) : prev, name = s.name || k.replace("@", "");
  const { frame, outside } = await peel(from, what, container, ref);
  fs.writeFileSync(`${dir}/${name}.jpg`, frame);
  console.log(`${name}.jpg (${outside} outside the ${container})`);
  if (!k.startsWith("@")) prev = frame;
  ref = null;
}
