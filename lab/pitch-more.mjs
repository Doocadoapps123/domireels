// Lab: more ideas for a restaurant's week, with a brief for this pitch only, judged like the rest and added to its week
// file (the week's first idea stays first). No video.
// Usage: node --env-file=../.env lab/pitch-more.mjs <kit> <week date> "<brief>" [voices, comma separated]
import fs from "node:fs";
import { menuPitch } from "../src/menu.mjs";
import { weekTrends, trendsText } from "../src/trends.mjs";
import { worthMaking } from "../src/ideas.mjs";

const [kit, date, focus, voices] = process.argv.slice(2), file = `${kit}/week-${date}.json`;
const week = JSON.parse(fs.readFileSync(file, "utf8"));
const trends = trendsText(await weekTrends(date).catch(() => null));
const more = await menuPitch(kit, week[0]?.look || null, [], { trends, focus, voicesOnly: voices ? voices.split(",") : null });
fs.writeFileSync(file, JSON.stringify([...week, ...more], null, 2) + "\n");
for (const [j, c] of more.entries()) console.log(`${week.length + j} ${c.combo} ${worthMaking(c) && !c.muse.off ? "OK" : "--"} ${c.total}/50 r${c.muse.realism} | ${c.title} | ${c.muse.note}`);
