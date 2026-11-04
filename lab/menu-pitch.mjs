// Lab: Muse looks at a restaurant's whole menu and pitches the next Reel itself, one dish or many (src/menu.mjs).
// Usage: node --env-file=../.env lab/menu-pitch.mjs <menu dir with menu.json and the photos>
//   FREE=1 pitches without the toolbox, playbook and studied formats (writes pitch-free.json).
import fs from "node:fs";
import { menuPitch } from "../src/menu.mjs";

const dir = process.argv[2], ranked = await menuPitch(dir);
fs.writeFileSync(`${dir}/pitch${process.env.FREE ? "-free" : ""}.json`, JSON.stringify(ranked, null, 2));
for (const c of ranked) console.log(`${c.total}/50  ${c.title} [${c.style}] dishes ${c.dishes.join(",")}\n   ${c.idea}\n   ${c.muse.note}`);
