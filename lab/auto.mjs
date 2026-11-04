// Lab: one Reel from a restaurant's menu, every creative call made by Muse (src/auto.mjs).
// Usage: node --env-file=../.env lab/auto.mjs <menu dir> [concept rank, 0 = Muse's winner] [spend cap in dollars, in all for the run folder]
//   A 4th argument runs a Friday plan instead of the menu's pitch: its week file (lab/friday.mjs), in lab/out/auto/<menu folder>-w<date>.
//   The run lives in lab/out/auto/<menu folder>-<rank>. Muse's questions for the owner land in its questions.json;
//   the answers go in answers.json ({question: answer}) and the same command picks up where it stopped.
//   Without a spend cap it stops after the frames, before any paid video.
import fs from "node:fs";
import path from "node:path";
import { reel } from "../src/auto.mjs";
import { spent } from "../src/video.mjs";
import { readMenu, menuPitch } from "../src/menu.mjs";
import { worthMaking, comboLimit } from "../src/ideas.mjs";
import { weekTrends, trendsText } from "../src/trends.mjs";
import { loadHistory } from "../src/director.mjs";

const [menu, pick = "0", spend = "0", week] = process.argv.slice(2);
const dirOf = (k) => week ? `lab/out/auto/${path.basename(menu)}-w${path.basename(week, ".json").slice(5)}${k ? `-${k}` : ""}` : `lab/out/auto/${path.basename(menu)}-${k}`;
// The spend cap is for the week's Reel in all, across every idea it tries.
// A style Muse invented that no Reel has used yet is tried with at most $3: Bohío's box-cam (4 Nov) passed the judge at
// realism 7 and was rejected at all 4 looks for $4.68. A style that has come out before gets the whole cap.
const firstTry = (() => { try { const c = week && JSON.parse(fs.readFileSync(week, "utf8"))[+pick]; return !!c?.combo?.startsWith("new") && !loadHistory().some((h) => h.combo === c.combo && h.approved); } catch { return false; } })();
const total = firstTry ? Math.min(+spend, 3) : +spend, dirs = [], left = () => +(total - dirs.reduce((t, d) => t + spent("lab/out/ledger.jsonl", `${d}/`), 0)).toFixed(3);
const run = (k, gate) => { const dir = dirOf(k); if (!dirs.includes(dir)) dirs.push(dir); return reel({ menu, dir, pick: k, spend: spent("lab/out/ledger.jsonl", `${dir}/`) + left(), ...(week ? { pitch: week, gate } : {}) }); };

// The next idea is the one Muse's own judge expects to come out (src/ideas.mjs, worthMaking: realism 6 or more, repeats
// nothing, photos that carry it), told in a combo no other restaurant uses up this week. When none is left, Muse thinks
// of new ideas once (no video is paid for that). When those do not come out either, no Reel is made: on 4 Nov Pikalo's
// Big Papi was made from an idea the judge had rated realism 4, because the code took "the best of the rest", and
// Muse rejected it at every look.
// The week is the last 7 days (lab/friday.mjs): a restaurant that planned on another day this week counts.
const days = (() => { const d = new Date(path.basename(week || "week-2000-01-01", ".json").slice(5)), out = []; for (let i = 0; i < 7; i++, d.setDate(d.getDate() - 1)) out.push(d.toISOString().slice(0, 10)); return out; })();
const otherWeeks = () => fs.readdirSync("kits").filter((x) => fs.existsSync(`kits/${x}/menu.json`) && `kits/${x}` !== menu.replace(/\/$/, ""))
  .map((x) => ({ x, d: days.find((d) => fs.existsSync(`kits/${x}/week-${d}.json`)) })).filter((o) => o.d);
const othersCombos = () => otherWeeks().flatMap(({ x, d }) => JSON.parse(fs.readFileSync(`kits/${x}/week-${d}.json`, "utf8"))
  .filter((c, i) => i === 0 || fs.existsSync(`lab/out/auto/${x}-w${d}${i ? `-${i}` : ""}/card.json`)).map((c) => c.combo).filter(Boolean));
const taken = () => { const n = {}, lim = comboLimit(otherWeeks().length + 1); for (const c of othersCombos()) n[c] = (n[c] || 0) + 1; return Object.keys(n).filter((c) => n[c] >= lim); };
const list = () => JSON.parse(fs.readFileSync(week, "utf8"));
const tried = [];
let thoughtAgain = false;
async function nextIdea() {
  const best = () => list().map((c, i) => ({ c, i })).filter(({ c, i }) => !tried.includes(i) && worthMaking(c) && !c.muse?.off && !taken().includes(c.combo))
    .sort((a, b) => b.c.muse.realism - a.c.muse.realism || b.c.total - a.c.total)[0]?.i;
  if (best() !== undefined || thoughtAgain) return best();
  thoughtAgain = true;
  console.log("no idea left that Muse expects to come out; Muse thinks of new ones");
  const trends = trendsText(await weekTrends(path.basename(week, ".json").slice(5)).catch(() => null));
  const triedCombos = tried.map((j) => list()[j]?.combo).filter(Boolean);
  fs.writeFileSync(week, JSON.stringify([...list(), ...(await menuPitch(menu, list()[+pick]?.look || null, [], { trends, taken: [...new Set([...taken(), ...triedCombos])] }))], null, 2) + "\n");
  return best();
}

let k = +pick;
// An idea Muse does not expect to come out is never the one made: the next worth making goes first, or none.
if (week && !worthMaking(list()[k] || {})) {
  tried.push(k);
  const next = await nextIdea();
  // A restaurant always gets its Reel (Yansel, 4 Nov: "NOSOTROS NO PODEMOS DEJAR DE ENTREGAR EL REEL NUNCA"): when no
  // idea reaches the bar, the one Muse expects most to come out is made anyway.
  if (next === undefined) {
    const best = list().map((c, i) => ({ c, i })).sort((a, b) => (b.c.muse?.realism ?? 0) - (a.c.muse?.realism ?? 0) || (b.c.total ?? 0) - (a.c.total ?? 0))[0].i;
    console.log(`no idea reaches the bar this week; the most likely to come out is made anyway: idea ${best}`);
    k = best;
  } else {
    console.log(`idea ${k} is not worth making (realism ${list()[k]?.muse?.realism}); idea ${next} instead`);
    k = next;
  }
}
let dir = dirOf(k);
tried.push(k);
let r = await run(k, true);
// A week always gets a Reel: when Muse cannot draw an idea's frames (before any paid video), or under half of its video
// shots pass (src/auto.mjs, gate), the next idea goes with the money left. The third paid idea always ends in a Reel.
while (week && (r.stop === "frames" || r.stop === "drafts") && tried.length < 4) {
  const why = r.stop === "frames" ? `Muse could not draw its frames (${r.failed.map((l) => l.name).join(", ")})` : `${r.passed} of ${r.of} video shots passed for $${r.cost}`;
  const next = await nextIdea();
  if (next === undefined) break;
  console.log(`"${dir}": ${why}; next idea of the week, ${next}, with $${left()} left`);
  k = next; dir = dirOf(k); tried.push(k);
  r = await run(k, tried.filter((j) => fs.existsSync(`${dirOf(j)}/script.json`) && spent("lab/out/ledger.jsonl", `${dirOf(j)}/`) > 0).length < 2);
}
// With no idea left, the last one tried makes the Reel from what passed.
if (week && r.stop === "drafts") r = await run(k, false);
if (r.stop === "questions") console.log(`Muse asks the owner (answer in ${dir}/answers.json):\n${r.questions.map((q) => `- ${q.ask} [${q.options.join(" / ")}]`).join("\n")}`);
if (r.stop === "plan") {
  const s = r.script;
  console.log(`\n${s.concept}\n${s.owner_summary}\ncontainer: ${s.container}; table: ${s.surface || "the photo's own"}\nmusic: ${s.music.prompt}`);
  for (const l of s.layers) console.log(`layer ${l.name} <- ${l.from}: ${l.remove}`);
  for (const x of s.shots) console.log(`shot ${x.n} ${x.kind} ${[x.start, x.end].filter(Boolean).join(" -> ")}${x.focus ? ` [${x.focus}]` : ""}: ${x.motion || x.what}`);
  console.log(`\nplan and frames in ${dir}. Drafts would cost about $${r.estimate}: run again with a spend cap.`);
}
if (r.stop === "frames") console.log(`Muse could not draw these layers, even after planning again:\n${r.failed.map((l) => `- ${l.name}: ${l.problems.join(" ")}`).join("\n")}`);
if (r.stop === "done") console.log(`\n${r.final} (${r.seconds.toFixed(1)} s), cost $${r.cost}\n${JSON.stringify(r.review, null, 2)}`);
// One line the server reads (src/server/worker.mjs): how the run ended and where.
console.log(`RESULT ${JSON.stringify({ stop: r.stop, dir, questions: r.questions || null, final: r.final || null, cost: r.cost ?? null, review: r.review || null, failed: r.failed?.map((l) => l.name) || null })}`);
