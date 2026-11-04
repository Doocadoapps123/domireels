// Fix one part of a Reel the owner already has, from what they said on WhatsApp ("the rice looks like soup, take out
// the pot"), instead of making a whole new Reel. Muse reads the owner's words against the Reel's shots and decides which
// shots come out and which are shot again; everything else (the takes already paid for, the music, the plan) stays.
// Then the same run cuts, renders and looks again (src/auto.mjs, FIX=1: two looks at most).
// Usage: node --env-file=../.env lab/fix.mjs <run dir> <kit dir> <week file> "<the owner's words>" [extra spend in dollars]
import fs from "node:fs";
import path from "node:path";
import { reel } from "../src/auto.mjs";
import { spent } from "../src/video.mjs";
import { ask, reviseClip, loadPlaybook } from "../src/director.mjs";

const [dir, kit, week, words, extra = "2.5"] = process.argv.slice(2);
const S = `${dir}/script.json`, read = (f) => JSON.parse(fs.readFileSync(f, "utf8")), save = (f, x) => fs.writeFileSync(f, JSON.stringify(x, null, 2) + "\n");
const script = read(S);
const AI = new Set(["build", "diner", "trick", "guest"]);

// What plays, in order, so Muse can match "the pot at the start" to a shot.
let t = 0;
const plays = (script.edit || []).map((e) => { const at = t; t += e.dur || 0; const n = +String(e.src || "").match(/^draft-(\d+)-/)?.[1] || null; return `${at.toFixed(1)}s ${e.what || e.src}${n ? ` (shot ${n})` : e.src ? ` (${e.src})` : ""}`; });
const FIX = {
  type: "object", additionalProperties: false, required: ["drop", "reshoot", "note"],
  properties: {
    drop: { type: "array", items: { type: "integer" }, description: "Shots to take out of the Reel entirely." },
    reshoot: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "why"], properties: { n: { type: "integer" }, why: { type: "string", description: "What must change in the new take, in the owner's terms, as a direction for the video model." } } }, description: "Video shots to film again because what they show is wrong but the Reel needs that moment." },
    note: { type: "string", description: "The owner's change in one plain English sentence, for the editor and the reviewer." },
  },
};
const fix = await ask([{ type: "input_text", text: `The owner of the restaurant watched this Reel and asked for a change. Decide which shots come out and which are filmed again. Change only what they asked; everything else stays. Take a shot out when the Reel works without it; film it again only when the Reel needs that moment and what it shows is wrong (a dish that looks wrong is filmed again so it looks like the real dish).
The owner said: "${words}"
The Reel: ${script.concept}. ${script.owner_summary || ""}
Dish card: ${JSON.stringify({ ingredients: script.card?.ingredients, assembly: script.card?.assembly })}
Shots: ${script.shots.map((s) => `${s.n}. ${s.kind}${s.dish ? ` (dish ${s.dish})` : ""}: ${s.what}`).join("\n")}
What plays, in order: ${plays.join(" | ")}` }], "fix", FIX);
console.log(`owner: ${words}\nMuse: drop ${fix.drop.join(", ") || "none"}; film again ${fix.reshoot.map((r) => r.n).join(", ") || "none"}. ${fix.note}`);

const playbook = loadPlaybook();
for (const r of fix.reshoot) {
  const s = script.shots.find((x) => x.n === r.n);
  if (!s) continue;
  if (!AI.has(s.kind)) { fix.drop.push(r.n); continue; }
  const { clip } = await reviseClip(script.card, { start: s.kind === "diner" || s.kind === "spread" ? "real_photo" : "drawn", first_frame: s.what, present: [], motion: s.motion }, { approved: false, physics_errors: [r.why], truth_errors: [], fixes: [r.why] }, playbook);
  let from = 0;
  while (fs.existsSync(`${dir}/draft-${s.n}-${from}.mp4`) || fs.existsSync(`${dir}/draft-${s.n}-${from}.dailies.json`)) from++;
  Object.assign(s, { motion: clip.motion, retryFrom: from });
  delete s.draft; delete s.approved; delete s.usable;
}
// Never all of them: a Reel needs something left to cut.
const drop = new Set(fix.drop.filter((n) => script.shots.some((s) => s.n === n)));
if (drop.size && drop.size < script.shots.length - 1) script.shots = script.shots.filter((s) => !drop.has(s.n));
script.owner_note = fix.note || words;
script.fixes = [...(script.fixes || []), { at: new Date().toISOString(), words, ...fix }];
script.edit = null;
save(S, script);
for (const f of fs.readdirSync(dir).filter((x) => /^(review|fix)-\d+\.json$|^review\.json$/.test(x))) fs.rmSync(`${dir}/${f}`);

const pick = +(path.basename(dir).match(/-w\d{4}-\d{2}-\d{2}[a-z]*-(\d+)$/)?.[1] || 0);
const r = await reel({ menu: kit, dir, pick, spend: spent("lab/out/ledger.jsonl", `${dir}/`) + +extra, pitch: week });
console.log(`RESULT ${JSON.stringify({ stop: r.stop, dir, questions: r.questions || null, final: r.final || null, cost: r.cost ?? null, review: r.review || null, fix })}`);
