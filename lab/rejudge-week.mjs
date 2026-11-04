// Lab: Muse's judge again on some ideas of a week file (after its rules change), in place: the order and the indexes the
// worker picks by stay the same. No video.
// Usage: node --env-file=../.env lab/rejudge-week.mjs <kit> <week date> [index,index,...]
import fs from "node:fs";
import { readMenu, sheets } from "../src/menu.mjs";
import { judgeMenu, loadPlaybook, loadHistory } from "../src/director.mjs";
import { inventory } from "../src/inventory.mjs";
import { worthMaking } from "../src/ideas.mjs";

const [kit, date, which] = process.argv.slice(2), file = `${kit}/week-${date}.json`;
const week = JSON.parse(fs.readFileSync(file, "utf8")), idx = which ? which.split(",").map(Number) : week.map((_, i) => i);
const { restaurant, items } = readMenu(kit);
const total = (x) => x.appetite + x.scroll_stop + x.realism + x.originality + x.photos;
const scores = await judgeMenu(await sheets(kit, items), idx.map((i) => { const { muse, total, ...c } = week[i]; return c; }), loadPlaybook(), loadHistory(), restaurant, await inventory(kit));
for (const x of scores) {
  const i = idx[x.index], before = week[i].muse;
  week[i] = { ...week[i], muse: { ...x, off: before.off, photos: Math.min(x.photos, before.photos ?? 10) }, total: total({ ...x, photos: Math.min(x.photos, before.photos ?? 10) }) };
  console.log(`${i} ${week[i].combo} ${worthMaking(week[i]) && !week[i].muse.off ? "OK" : "--"} ${week[i].total}/50 r${before.realism}->${x.realism} | ${week[i].title} | ${x.note}`);
}
fs.writeFileSync(file, JSON.stringify(week, null, 2) + "\n");
