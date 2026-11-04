// Lab: the whole director loop for one dish.
//   dish card (menu + photo + owner answers) -> SAM ingredient crops -> concepts -> blind pick
//   -> drawn first frames checked against the photo -> 360p drafts reviewed by Muse, revised once if rejected.
// Usage: node --env-file=../.env lab/direct.mjs <photo> <menu.json> [--draft]
//   REAL=<9:16 jpg> overrides the real-photo start frame. Owner answers go in <dir>/answers.json.
//   ONLY=1 (or 0,2) drafts only those clips again; the rest reuse their newest draft.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { dishCard, ingredientRefs } from "../src/dish.mjs";
import { ideate, pick, checkFrame, reviewDraft, reviseClip, loadRecipes, loadPlaybook, loadHistory } from "../src/director.mjs";
import { museEdit, realFrame, stageCook } from "../src/film.mjs";
import { omni } from "../src/video.mjs";

const [photo, menuFile, flag] = process.argv.slice(2);
const dir = `lab/out/direct/${path.basename(photo, path.extname(photo))}`;
fs.mkdirSync(dir, { recursive: true });
const src = fs.readFileSync(photo), menu = JSON.parse(fs.readFileSync(menuFile, "utf8"));
const playbook = loadPlaybook(), history = loadHistory();
const json = (f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
const cached = async (file, fn) => fs.existsSync(`${dir}/${file}`) ? json(file)
  : fn().then((v) => (fs.writeFileSync(`${dir}/${file}`, JSON.stringify(v, null, 2)), v));
const log = (...a) => console.log(...a);

// 1. Dish card. Questions for the owner stop the run until answers.json exists.
const answers = fs.existsSync(`${dir}/answers.json`) ? json("answers.json") : {};
const card = await cached("card.json", () => dishCard({ photo: src, menu, answers }));
log(`dish: ${card.dish}`);
card.ingredients.forEach((i) => log(`  ${i.name} [${i.source}${i.visible_in_photo ? ", visible" : ""}, ${i.confidence}] ${i.looks} | ${i.kitchen}`));
log(`assembly: ${card.assembly.join(" > ")}`);
if (card.conflicts.length) log(`conflicts: ${card.conflicts.join(" | ")}`);
if (card.questions.length && !Object.keys(answers).length) {
  log("QUESTIONS FOR THE OWNER:");
  card.questions.forEach((q) => log(`  - ${q.ask} [${q.options.join(" / ")}] (${q.why})`));
  process.exit(2);
}

// 2. Real ingredient crops (SAM 3.1).
let refs = fs.existsSync(`${dir}/refs.json`) ? json("refs.json") : null;
if (!refs) {
  const found = await ingredientRefs(src, card);
  refs = found.map((r, i) => { const f = `${dir}/ref-${i}.jpg`; fs.writeFileSync(f, r.crop); return { name: r.name, file: f, share: r.share }; });
  fs.writeFileSync(`${dir}/refs.json`, JSON.stringify(refs, null, 2));
}
log(`refs: ${refs.map((r) => `${r.name} ${r.share}`).join(", ")}`);

// 3. Concepts and the blind pick.
const concepts = await cached("concepts.json", () => ideate(src, card, loadRecipes(), playbook, history));
concepts.forEach((c, i) => log(`${i}. ${c.new_format ? "[NEW] " : ""}${c.title}: ${c.idea}`));
const verdict = await cached("verdict.json", () => pick(src, card, concepts, playbook, history));
for (const s of verdict.scores) log(`${s.index}: hunger ${s.appetite} stop ${s.scroll_stop} real ${s.realism} kitchen ${s.kitchen_logic} truth ${s.truth} feasible ${s.feasible} | ${s.note}`);
const win = concepts[verdict.winner];
log(`WINNER ${verdict.winner}: ${win.title} [${win.format} | ${win.cast}]\n  ${win.idea}\n  fixes: ${verdict.fixes.join(" | ")}`);

// 4. First frames. Drawn ones use only the crops of the ingredients present at that moment.
const realStart = process.env.REAL || `${dir}/real.jpg`;
if (!fs.existsSync(realStart)) fs.writeFileSync(realStart, await realFrame(src));
const refFor = (present) => refs.filter((r) => present.some((p) => p.toLowerCase().includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(p.toLowerCase())));
async function drawFrame(i, clip) {
  const mine = refFor(clip.present);
  const here = card.ingredients.filter((x) => mine.some((r) => r.name === x.name) || clip.present.some((p) => p.toLowerCase().includes(x.name.toLowerCase())));
  let brief = `${clip.first_frame} The reference images are the restaurant's real ${mine.map((r) => r.name).join(", ") || "dish"}: draw them exactly like that. Only these ingredients are in the frame: ${here.map((x) => `${x.name} (${x.looks})`).join("; ")}. Nothing else from the dish is there yet. A real photo taken in a working restaurant kitchen, vertical 9:16, no text.`;
  const images = mine.length ? mine.map((r) => fs.readFileSync(r.file)) : [src];
  let best;
  for (let attempt = 0; attempt < 3; attempt++) {
    const frame = await museEdit(brief, images);
    const file = `${dir}/clip-${i}-try${attempt}.jpg`;
    fs.writeFileSync(file, frame);
    const check = await checkFrame(src, frame, card, clip.first_frame, clip.present);
    log(`  frame ${i} try ${attempt} (${check.score}): ${check.matches ? "MATCH" : "NO " + check.problems.join("; ")}`);
    if (check.matches) return file;
    if (!best || check.score > best.score) best = { file, score: check.score };
    brief = check.fix_prompt || brief;
  }
  return best.file;
}
// A real-photo clip with hands starts with the cook already in place, so nobody pops in.
async function stageFrame(i, clip) {
  let best, avoid = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const frame = await stageCook(fs.readFileSync(realStart), win.cast, avoid).catch((e) => (log(`  staged ${i} try ${attempt}: ${e.message}`), null));
    if (!frame) continue;
    const file = `${dir}/clip-${i}-staged${attempt}.jpg`;
    fs.writeFileSync(file, frame);
    const check = await checkFrame(src, frame, card, `The real dish with ${win.cast} already in place, hands empty and resting at the sides, touching no food.`, clip.present);
    log(`  staged ${i} try ${attempt} (${check.score}): ${check.matches ? "MATCH" : "NO " + check.problems.join("; ")}`);
    if (check.matches) return file;
    if (!best || check.score > best.score) best = { file, score: check.score };
    avoid = check.problems;
  }
  return best?.file ?? realStart;
}
// Nobody to stage when the cast is gravity or a pour.
const needsCook = (clip) => !/^(nobody|none)/i.test(win.cast) && /hand|glove|cook|chef|diner|finger|fork/i.test(clip.motion);
const only = process.env.ONLY?.split(",").map(Number);
const starts = [];
for (const [i, clip] of win.clips.entries()) {
  if (only && !only.includes(i)) continue;
  // The chosen first frame is kept, so a re-run (e.g. ONLY=1) drafts from the same picture.
  const chosen = `${dir}/clip-${i}-start.jpg`;
  if (!fs.existsSync(chosen)) fs.copyFileSync(clip.start === "drawn" ? await drawFrame(i, clip) : needsCook(clip) ? await stageFrame(i, clip) : realStart, chosen);
  starts[i] = chosen;
}

if (flag !== "--draft") process.exit(0);

// 5. 360p drafts, each reviewed by Muse; one revision if rejected.
const drafts = (i) => fs.readdirSync(dir).filter((f) => new RegExp(`^c${i}-d\\d+\\.mp4$`).test(f)).length;
const results = await Promise.all(win.clips.map(async (clip0, i) => {
  if (only && !only.includes(i)) return `${dir}/c${i}-d${drafts(i) - 1}.mp4`;
  // When no draft passes, the preview keeps the one Muse scored best, not the last one.
  let clip = clip0, start = starts[i], best;
  const first = drafts(i);
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = `${dir}/c${i}-d${first + attempt}.mp4`;
    const r = await omni({ start, prompt: `${clip.motion} Every change has a visible cause. Generous portions, realistic amounts. Locked camera. Whoever is in the shot is there from the first frame or enters from the edge of the frame; nothing appears by magic and the background does not change. No faces, no text, no morphing.`, out });
    const review = await reviewDraft(src, out, card, clip, playbook, fs.readFileSync(start));
    fs.writeFileSync(out.replace(".mp4", ".review.json"), JSON.stringify(review, null, 2));
    log(`  clip ${i} draft ${attempt} ($${r.cost}, total $${r.total}): ${review.approved ? "APPROVED" : "REJECTED"} craving ${review.craving} realism ${review.realism} | ${[...review.physics_errors, ...review.kitchen_errors, ...review.truth_errors].join(" | ")}`);
    const score = review.craving + review.realism;
    if (!best || score > best.score) best = { out, score };
    if (review.approved) return out;
    if (attempt === 0) {
      const rev = await reviseClip(card, clip, review, playbook);
      clip = rev.clip;
      if (rev.redraw_first_frame && clip.start === "drawn") start = await drawFrame(`${i}r`, clip);
      log(`  clip ${i} revised${rev.redraw_first_frame ? " (new first frame)" : ""}: ${clip.motion}`);
    }
  }
  return best.out;
}));
const list = `${dir}/concat.txt`;
fs.writeFileSync(list, results.map((f) => `file '${path.resolve(f)}'`).join("\n"));
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", `${dir}/preview.mp4`]);
log(`${dir}/preview.mp4`);
// What this reel was, so the next ones do not repeat it.
if (!history.some((r) => r.run === dir && r.title === win.title)) {
  history.push({ run: dir, date: new Date().toISOString().slice(0, 10), restaurant: menu.restaurant, dish: card.dish, title: win.title, format: win.format, cast: win.cast });
  fs.writeFileSync("data/history.json", JSON.stringify(history, null, 2) + "\n");
}
