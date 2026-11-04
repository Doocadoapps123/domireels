// Lab: Friday. Muse searches the web for what is working in food Reels this week (src/trends.mjs), then invents six
// ideas for every restaurant from that and from what each one has (src/ideas.mjs, src/menu.mjs menuPitch), and its judge
// ranks them. Then the week's Reels are handed out so no two restaurants tell theirs the same way: the restaurant with
// the strongest idea chooses first, and each takes its best idea worth making whose combo (who tells it / moment /
// dishes) is still free this week.
// Usage: node --env-file=../.env lab/friday.mjs [kit dirs...]
//   Default: the kits of the restaurants Domi Reels serves (its database), or every kit in kits/ without one.
//   Writes kits/<kit>/week-<date>.json with the week's Reel first, and resumes from it. No video: a Reel is made from it
//   with reel({ menu: kit, dir, pitch: week file, spend }) once its spend is agreed.
import fs from "node:fs";
import { readMenu, menuPitch } from "../src/menu.mjs";
import { loadHistory, chooseWeek } from "../src/director.mjs";
import { weekStyles } from "../src/week.mjs";
import { weekTrends, trendsText } from "../src/trends.mjs";
import { comboLimit, worthMaking, styleOfCombo } from "../src/ideas.mjs";
import { pull, layoutKit } from "../src/kit.mjs";
import { sortAssets } from "../src/assets.mjs";

// Variety counts only the restaurants that really make Reels (Yansel, 4 Nov: "al ser nada más tres, nosotros no podemos
// repetir"): kits left from lab tests are not this week's restaurants.
// With the database, each kit is laid out from its source the way the worker does it (src/server/kits.mjs).
const sources = {};
async function served() {
  if (!process.env.DR_SUPABASE_URL) return fs.readdirSync("kits").filter((k) => fs.existsSync(`kits/${k}/menu.json`)).map((k) => `kits/${k}`);
  const { db, must } = await import("../src/server/db.mjs"), { kitDir, kitFor } = await import("../src/server/kits.mjs");
  const rs = await must(db.from("restaurants").select("*, accounts(*)").eq("active", true));
  for (const r of rs) sources[kitDir(r, r.accounts)] = () => kitFor(r, r.accounts);
  return rs.map((r) => kitDir(r, r.accounts)).filter((k) => fs.existsSync(`${k}/menu.json`) || !process.env.NO_PULL);
}
const all = await served();
const kits = process.argv.slice(2).length ? process.argv.slice(2) : all;
// WEEK=<date> plans another week than today's (a next Reel the same day gets its own week file and run folder).
const date = process.env.WEEK || new Date().toISOString().slice(0, 10), file = (kit) => `${kit}/week-${date}.json`;
// REHAND=1 hands the week out again from the ideas already pitched (no new pitch for a kit that has its week file).
const todo = process.env.REHAND ? kits : kits.filter((k) => !fs.existsSync(file(k)));
// The week starts from each restaurant's kit as it is today: new dishes, new photos, new photos from the owner.
// The server lays the kit out itself before it plans (NO_PULL=1); the lab pulls it from Doocado here.
if (!process.env.NO_PULL) for (const kit of todo.filter((k) => !fs.existsSync(file(k)))) {
  const fresh = sources[kit] ? layoutKit(await sources[kit](), kit).then(() => sortAssets(kit)) : pull(readMenu(kit).restaurant_id, kit);
  await fresh.catch((e) => console.log(`${kit}: kit not refreshed (${e.message}), last week's is used`));
}
// A week is the last 7 days, not a calendar week: each restaurant plans on its own day, and what any other planned in the
// 6 days before counts as this week's.
const weekOf = (k) => { const d = new Date(date); for (let i = 0; i < 7; i++, d.setDate(d.getDate() - 1)) { const f = `${k}/week-${d.toISOString().slice(0, 10)}.json`; if (fs.existsSync(f)) return f; } };
const others = [...new Set([...all, ...kits])].filter((k) => !todo.includes(k) && weekOf(k));
const head = (k) => JSON.parse(fs.readFileSync(weekOf(k), "utf8"))[0];
// The combo each other restaurant tells this week: the one its Reel was made of (history), else its week's first idea.
const madeOf = (k) => loadHistory().filter((h) => h.run.startsWith(`lab/out/auto/${k.split("/").pop()}-w${weekOf(k).slice(-15, -5)}`)).at(-1);
const used = {};
for (const k of others) { const c = madeOf(k)?.combo || head(k).combo; if (c) used[styleOfCombo(c)] = (used[styleOfCombo(c)] || 0) + 1; }
const limit = comboLimit(todo.length + others.length);
const full = () => Object.keys(used).filter((c) => used[c] >= limit);
// The ideas other restaurants make this week, so the pitch and its judge see them like Reels already made.
const thisWeek = others.map((k) => ({ run: k, date: new Date().toLocaleDateString("en-CA"), restaurant: readMenu(k).restaurant, dish: readMenu(k).items.find((m) => m.id === head(k).dishes[0])?.name || "", title: head(k).title, kind: head(k).kind, format: head(k).format, cast: head(k).cast, combo: head(k).combo || "" }))
  .filter((p) => !loadHistory().some((h) => h.title === p.title));

// Muse searches once for the week, for the cities of the restaurants it serves (src/trends.mjs).
const cities = [...new Set(all.map((k) => readMenu(k).city).filter(Boolean))];
const trends = trendsText(await weekTrends(date, cities).catch((e) => (console.log(`no research this week (${e.message})`), null)));
const restaurants = todo.map((kit) => ({ kit, name: readMenu(kit).restaurant }));
// Music registers and text styles spread the same way: nobody shares one this week while there are enough.
const styles = weekStyles(restaurants, loadHistory(), { music: others.flatMap((k) => head(k).look?.music || []), text: others.flatMap((k) => head(k).look?.text || []) });
await Promise.all(todo.filter((k) => !fs.existsSync(file(k))).map(async (kit) => fs.writeFileSync(file(kit), JSON.stringify(await menuPitch(kit, styles[kit], thisWeek, { trends, taken: full() }), null, 2) + "\n")));

const ranked = Object.fromEntries(todo.map((k) => [k, JSON.parse(fs.readFileSync(file(k), "utf8"))]));
// The hand-out gives a Reel to as many restaurants as it can, and among those the best ideas: on its first run Pikalo
// fell back to a combo that was Santia's only idea worth making, and Santia's got none. Each restaurant tries its ideas
// best first; a combo that is full can be taken back from a restaurant that has another free one (augmenting paths).
// Each restaurant's best idea worth making in each style, in the order Muse would make them this week (chooseWeek).
const cands = {};
await Promise.all(todo.map(async (k) => {
  const best = {};
  for (const [i, c] of ranked[k].entries()) if (worthMaking(c) && !c.muse?.off && (!best[c.combo] || c.total > ranked[k][best[c.combo]].total)) best[c.combo] = i;
  const list = Object.values(best).map((i) => ({ c: ranked[k][i], i }));
  if (list.length < 2) { cands[k] = list; return; }
  const choice = await chooseWeek(readMenu(k).restaurant, list.map((x) => x.c), trends, loadHistory()).catch(() => null);
  const order = choice ? [...new Set([...choice.order.filter((j) => list[j]), ...list.keys()])] : [...list.keys()].sort((a, b) => list[b].c.total - list[a].c.total);
  cands[k] = order.map((j) => list[j]);
  if (choice) console.log(`${readMenu(k).location}: Muse would make ${list[order[0]].c.combo} first. ${choice.why}`);
}));
const holders = {}, got = {};
for (const [c, n] of Object.entries(used)) holders[c] = Array(n).fill(null);
function assign(k, seen) {
  for (const { c, i } of cands[k]) {
    if (seen.has(c.combo)) continue;
    seen.add(c.combo);
    const h = (holders[c.combo] ||= []);
    if (h.length < limit) { h.push(k); got[k] = i; return true; }
    for (const [j, other] of h.entries()) if (other && assign(other, seen)) { h[j] = k; got[k] = i; return true; }
  }
  return false;
}
for (const kit of [...todo].sort((a, b) => cands[a].length - cands[b].length)) assign(kit, new Set());
for (const kit of todo) {
  const list = ranked[kit], i = got[kit];
  if (i === undefined) { console.log(`${readMenu(kit).location}: no idea Muse expects to come out this week (none made)`); continue; }
  fs.writeFileSync(file(kit), JSON.stringify([list[i], ...list.filter((_, j) => j !== i)], null, 2) + "\n");
  console.log(`${readMenu(kit).location}: [${list[i].combo}] ${list[i].title} (${list[i].total}/50, realism ${list[i].muse.realism})\n  ${list[i].idea}`);
}
