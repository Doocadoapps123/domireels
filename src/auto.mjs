// Domi Reels, end to end. A restaurant's menu goes in, a finished Reel comes out, and Muse makes every
// creative call on the way: no person writes a script, picks a frame or chooses a cut.
//   pitch   Muse sees the whole menu, pitches 8 Reels, and a blind Muse judge ranks them (src/menu.mjs).
//   card    Muse reads the hero dish like a line cook; what it cannot see, it asks the owner.
//   plan    Muse plans the layers of the real photo, every shot, the table and the music, then writes every
//           word the image and video models get.
//   frames  Muse Image takes the real photo apart; SAM measures every frame for food outside its container;
//           Muse compares each frame with the real dish and fixes what is off.
//   drafts  360p clips. Muse watches each one and rewrites the shot when it fails, up to 3 tries.
//   cut     Muse watches the clips it approved, picks the pieces, and assembles the fast cut.
//   music, render, review: the score, the final file, and Muse's last look before the owner sees it.
// Every stage saves what it made in the run folder and is skipped when it is already there, so a run resumes.
// Paid video needs a spend cap (spend, in dollars). Without one the run stops after the frames, so the plan is seen first.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { dishCard } from "./dish.mjs";
import { readMenu, menuPitch, offSite } from "./menu.mjs";
import { planReel, writeScript, checkFrame, fixFrame, dailies, covers, reviseClip, cutReel, reviewReel, fixReel, loadPlaybook, loadHistory } from "./director.mjs";
import { inventory } from "./inventory.mjs";
import { overlay } from "./overlay.mjs";
import { lostFood, cutAways } from "./vanish.mjs";
import { tallFrame, resurface, peel, focusFrame } from "./frames.mjs";
import { spreadFrame, tableScene, buildLayers, plateOnTable } from "./layers.mjs";
import { measure, spills, pct } from "./contain.mjs";
import { omni, upscale, spent } from "./video.mjs";
import { ownStock } from "./assets.mjs";
import { owners, claim, groupOf } from "./stock.mjs";
import { guestFrame, checkGuest, CAST_ON_CAMERA } from "./cast.mjs";
import { music, render, probe, source } from "./edit.mjs";

const LEDGER = "lab/out/ledger.jsonl";
// How long a Reel runs, chosen once for it like a creator would: mostly 8-11 s, sometimes 7 or 12. Yansel, 2 Nov:
// "minimo es quizas que dure 7 seg el 10% de las veces. Necesito reels de 8, 9, 10, 11, no quisiera que el tiempo cohiba
// la creatividad". 7 s stays the floor the cut guarantees.
// Yansel, 2 Nov: "hay que subir de 7 a 10 segundos, necesito un reel no una animacion". 10 s half the time, 9-12 around it.
// Yansel, 3 Nov, on a 6.8 s Reel: "muy corto, parece un comercial corto". The good ones ran 10-11 s.
const pickLength = (r = Math.random()) => (r < 0.15 ? 10 : r < 0.6 ? 11 : r < 0.9 ? 12 : 13);
// Footage that reads as an ad, not a kitchen: flames and smoke on black, city skylines. Two restaurants got the same
// grill flames the same day and the owner called both Reels horrible (2 Nov). Only real equipment and places are offered.
const AD_LOOK = new Set(["fire", "smoke", "city-night"]);
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const save = (f, x) => fs.writeFileSync(f, JSON.stringify(x, null, 2) + "\n");
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// A spread is not a video shot: on Santia's three cakes (4 Nov) the video model changed the food in all 3 tries when
// its camera moved. The edit moves the camera over the real frame instead, so the food is the photos and never fails.
const ai = (s) => s.kind === "build" || s.kind === "diner" || s.kind === "guest" || s.kind === "trick";
// The diner and guest shots start on the finished dish: the real photo framed tight, or a house cast member holding it.
const fromDish = (s) => s.kind === "diner" || s.kind === "guest";
// A guest shot's cast: one or two names ("marisol, diego").
const castOf = (s, cast) => s.who.split(/,|\band\b|\by\b/).map((x) => x.trim().toLowerCase()).filter(Boolean).map((n) => cast.people.find((p) => p.name === n)).filter(Boolean);
async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); }));
}

// pitch: the concepts to pick from; by default the menu's own pitch.json, a Friday plan passes its week file.
export async function reel({ menu: menuDir, dir, pick = 0, spend = 0, pitch = `${menuDir}/pitch.json`, gate = false }) {
  fs.mkdirSync(dir, { recursive: true });
  // The cap counts only this run's spending (its folder), so several runs can go at once.
  const scope = `${dir}/`, playbook = loadPlaybook(), menu = readMenu(menuDir);
  // The stock this restaurant's last Reels used is marked, so the planner reaches for other equipment.
  const usedHere = new Set(loadHistory().filter((h) => h.restaurant.split(" (")[0] === menu.restaurant).slice(-3).flatMap((h) => h.stock || []));
  // The restaurant's own place and equipment first (src/assets.mjs), then the emergency gallery.
  // Library clips another restaurant already used are never offered (src/stock.mjs, claim).
  const taken = owners(), mine = (x) => !taken[groupOf(x)] || taken[groupOf(x)] === menu.restaurant;
  let stock = [...ownStock(menuDir), ...read("data/stock.json").filter(mine).filter((x) => !AD_LOOK.has(groupOf(x)))].map((x) => ({ ...x, used: usedHere.has(x.name) }));
  const cast = CAST_ON_CAMERA && fs.existsSync(`${menuDir}/cast.json`) ? read(`${menuDir}/cast.json`) : null;
  const S = `${dir}/script.json`, f = (name) => `${dir}/${name}.jpg`, failedFile = `${dir}/failed.json`;

  // pitch: shared by every run on this menu.
  const pitchFile = pitch;
  if (!fs.existsSync(pitchFile)) save(pitchFile, await menuPitch(menuDir));
  const concept = read(pitchFile)[pick], item = (id) => menu.items.find((m) => m.id === id);
  const hero = item(concept.dishes[0]), photo = `${menuDir}/${hero.photo}`, real = fs.readFileSync(photo);
  const others = concept.dishes.slice(1).map(item).filter(Boolean).map((m) => ({ id: m.id, name: m.name, photo: `${menuDir}/${m.photo}` }));
  // Up to 3 more dishes with good photos the plan may bring in when the concept's own cannot fill the length; never one
  // that was this restaurant's hero lately.
  const lately = new Set(loadHistory().filter((h) => h.restaurant.split(" (")[0] === menu.restaurant).slice(-3).map((h) => h.dish));
  // Only a Reel of several dishes gets extra ones: dropped into a one-dish story, a random dish breaks it (Master Pizza's
  // pechurina cut to the Picadera's cheese cubes, 3 Nov).
  if (concept.dishes.length > 1 && concept.dishes.length < 3) others.push(...menu.items.filter((m) => !concept.dishes.includes(m.id) && m.photo && (m.photo_score ?? 0) >= 7 && !lately.has(m.name))
    .sort((a, b) => b.photo_score - a.photo_score).slice(0, 3).map((m) => ({ id: m.id, name: m.name, photo: `${menuDir}/${m.photo}`, extra: true })));
  // A shot on another dish is judged against that dish's own photo, with what its menu line says.
  const dishOf = (s) => others.find((o) => o.id === s.dish && s.dish !== hero.id);
  const cardOf = (s) => { const o = dishOf(s); if (!o) return card; const m = item(o.id); return { dish: m.name, ingredients: [m.description || m.name], assembly: [`Served as in its photo (image 1).`] }; };
  console.log(`concept: ${concept.title} (${concept.total}/50), hero ${hero.name}`);

  // card: Muse's questions wait for the owner's answers.json.
  const cardFile = `${dir}/card.json`, answersFile = `${dir}/answers.json`;
  if (!fs.existsSync(cardFile)) {
    const answers = fs.existsSync(answersFile) ? read(answersFile) : {};
    const card = await dishCard({ photo, menu: { restaurant: menu.restaurant, name: hero.name, description: hero.description, price: hero.price, ai_note: hero.ai_note || "", addons: hero.addons || [] }, answers, concept });
    // A platform's restaurant has no line to its owner (the platform keeps it): Muse decides from the menu, the owner's
    // notes and the photo (NO_QUESTIONS=1, src/server/worker.mjs).
    if (card.questions.length && !fs.existsSync(answersFile) && !process.env.NO_QUESTIONS) {
      save(`${dir}/questions.json`, card.questions);
      return { stop: "questions", questions: card.questions };
    }
    save(cardFile, card);
  }
  const card = read(cardFile);

  // plan: the structure, then the words. Muse plans from what the photos can do (src/inventory.mjs) and from this week's
  // music registers and text styles (src/week.mjs), which the Friday plan put on the concept.
  const look = { inv: await inventory(menuDir), music: concept.look?.music || [], text: concept.look?.text || [], lang: menu.language === "es" ? "Spanish" : "English" };
  if (!fs.existsSync(S)) {
    const seconds = pickLength();
    let plan;
    for (;;) {
      plan = await planReel(photo, hero.id, others, card, concept, playbook, stock, fs.existsSync(failedFile) ? read(failedFile) : [], menu.restaurant, seconds, { ...look, heroOffSite: offSite(item(hero.id)) ? item(hero.id).photo_setting : null });
      // The plan takes its clips for this restaurant; one another run took a moment ago goes, and Muse plans again.
      const used = [...plan.shots.filter((s) => s.kind === "stock").map((s) => s.stock), ...plan.layers.filter((l) => l.from.startsWith("stock:")).map((l) => l.from.slice(6))];
      const lost = used.filter((n) => !stock.find((x) => x.name === n)?.own && !claim(groupOf(stock.find((x) => x.name === n) || { name: n }), menu.restaurant, dir));
      if (!lost.length) break;
      console.log(`stock taken by another restaurant: ${lost.join(", ")}; planning again`);
      const gone = new Set(lost.map((n) => groupOf(stock.find((x) => x.name === n) || { name: n })));
      stock = stock.filter((x) => !gone.has(groupOf(x)));
    }
    save(`${dir}/plan.json`, plan);
    const shows = (k) => (k === "real" ? "the real finished dish" : plan.layers.find((l) => l.name === k)?.shows || "");
    const brief = {
      layers: plan.layers.map(({ name, from, shows, dish }) => ({ name, shows,
        from: from.startsWith("stock:") ? `a real frame of ${stock.find((x) => `stock:${x.name}` === from)?.what || from}: the instruction puts this restaurant's own food on it, as image 2 of the image editor shows it`
          : from === "real" && dish && dish !== hero.id ? `the real photo of ${item(dish)?.name}` : from })),
      shots: plan.shots.filter(ai).map(({ n, kind, start, end, what }) => ({
        n, kind, start: kind === "diner" ? `${start === "real" || !start ? "real" : start} (framed tight)` : kind === "guest" ? "a house cast member holding the real dish" : kind === "spread" ? "every dish of the idea together on one table" : start,
        start_shows: kind === "spread" ? `${[hero, ...others].map((o) => item(o.id)?.name || o.name).join(", ")}, side by side on one table` : shows(start || "real"), end, end_shows: shows(end), what })),
    };
    // Muse sometimes skips a shot when there are many (Purple Bear, 2 Nov: no words for shot 2): what it skipped goes
    // back to it, twice at most, before the run stops.
    const remove = {}, motion = {};
    let missing = [];
    // Muse writes each dish's words looking at that dish's own photo: with only the hero's photo it would not write a
    // single word for the third empanada of Pikalo's idea (3 Nov). What it skips goes back a few at a time.
    const dishKey = (d) => (d && d !== hero.id && others.some((o) => o.id === d) ? d : 0);
    const groups = [...new Set([...plan.layers.map((l) => dishKey(l.dish)), ...plan.shots.filter(ai).map((x) => dishKey(x.dish))])];
    for (const g of groups) {
      const part = { layers: brief.layers.filter((l, i) => dishKey(plan.layers[i].dish) === g), shots: brief.shots.filter((x) => dishKey(plan.shots.find((p) => p.n === x.n).dish) === g) };
      const seen = g ? fs.readFileSync(others.find((o) => o.id === g).photo) : real, facts = g ? cardOf({ dish: g }) : card;
      for (let t = 0; t < 4; t++) {
        const left = { layers: part.layers.filter((l) => !remove[l.name]), shots: part.shots.filter((x) => !motion[x.n]) };
        if (!left.layers.length && !left.shots.length) break;
        const words = await writeScript(seen, facts, t ? { layers: left.layers.slice(0, 2), shots: left.layers.length > 1 ? [] : left.shots.slice(0, 3) } : part, playbook);
        words.layers.forEach((l) => { if (l.remove) remove[l.name] = l.remove; });
        words.shots.forEach((x) => { if (x.motion) motion[x.n] = x.motion; });
      }
    }
    missing = [...plan.layers.filter((l) => !remove[l.name]).map((l) => l.name), ...plan.shots.filter((x) => ai(x) && !motion[x.n]).map((x) => `shot ${x.n}`)];
    if (missing.length) throw new Error(`Muse wrote no words for ${missing.join(", ")}`);
    save(S, {
      dish: `${hero.name} (${menu.restaurant})`, photo, real: f("real"), seconds, container: plan.container, surface: plan.surface,
      concept: concept.title, dishes: concept.dishes, card,
      layers: plan.layers.map((l) => ({ ...l, remove: remove[l.name], by: "muse" })),
      // A shot on the restaurant's own photo plays as a still of that photo: the place never moves in a way it does not.
      // A spread shot moves only the camera, whatever the words say: the food is the real photos and must not move.
      shots: plan.shots.map((s) => (ai(s) ? { ...s, motion: s.kind === "spread" ? `Only the camera moves: a slow handheld glide across the table from one dish to the next, like a documentary, ending close on the last one. The food, the plates and everything on the table stay exactly as they are; nothing is added, nothing changes, no hands. ${motion[s.n]}` : motion[s.n], by: "muse" }
        : s.kind === "stock" && stock.find((x) => x.name === s.stock)?.own ? { ...s, kind: "still", own: stock.find((x) => x.name === s.stock).photo, focus: s.focus || stock.find((x) => x.name === s.stock).focus } : s)),
      stock: Object.fromEntries(stock.filter((x) => !x.own && plan.shots.some((s) => s.kind === "stock" && s.stock === x.name)).map(({ used, ...x }) => [x.name, x])),
      music: { model: "fal-ai/elevenlabs/music", license: "ElevenLabs (commercial use)", ms: 11500, prompt: plan.music, register: plan.music_register, by: "muse" },
      rhythm: plan.rhythm || concept.rhythm || "fast cut", text_style: plan.text_style, texts: plan.texts,
      caption: plan.caption, owner_summary: plan.owner_summary,
    });
  }
  const script = read(S);

  // A table Reel is one table (Dora, 4 Nov: the pass showed the dishes on wood, then each on its own photo's tiles and
  // brick): every dish of it is cut out of its real photo and set on the same table, the one the pass moves over.
  const oneTable = concept.axes?.style === "table", tableFile = `${menuDir}/spread-table.jpg`;
  const onTheTable = async (photoPath, key) => {
    if (!fs.existsSync(tableFile)) fs.writeFileSync(tableFile, await tableScene());
    const d = `${dir}/plate-${key}`, meta = fs.existsSync(`${d}/meta.json`) ? read(`${d}/meta.json`) : await buildLayers(photoPath, d);
    return (await plateOnTable(fs.readFileSync(`${d}/plate.png`), fs.readFileSync(tableFile), meta)).frame;
  };
  // frames: the real photo as 9:16 (on a new table if Muse asked for one), each layer, the tight starts and the stills.
  const checks = fs.existsSync(`${dir}/frames.json`) ? read(`${dir}/frames.json`) : {};
  const mark = (k, v) => { checks[k] = v; save(`${dir}/frames.json`, checks); console.log(`${k}.jpg`, JSON.stringify(v)); };
  if (!fs.existsSync(f("real"))) {
    let frame = oneTable ? await onTheTable(photo, hero.id).catch((e) => (console.log(`hero not set on the table (${e.message})`), null)) || await tallFrame(real) : await tallFrame(real);
    fs.writeFileSync(f("photo"), frame);
    if (script.surface) {
      try { frame = (await resurface(frame, script.container, script.surface)).frame; }
      catch (e) {
        // Every shot of the plan was written for the new place: without it the video model invents the place and the
        // food with it (Dora's quesadilla "on the plancha", 3 Nov, was a drawn quesadilla on a drawn plancha). The plan
        // goes back to Muse without that place, like a layer that cannot be drawn.
        console.log(`new table failed (${e.message}), Muse plans again without it`);
        const failed = [...(fs.existsSync(failedFile) ? read(failedFile) : []), { name: "surface", remove: script.surface, problems: [e.message, "the dish stays on its own table in its own photo"] }];
        if (failed.length > 1) return { stop: "frames", failed };
        save(failedFile, failed);
        for (const n of fs.readdirSync(dir)) if (n.endsWith(".jpg") || ["plan.json", "script.json", "frames.json"].includes(n)) fs.rmSync(`${dir}/${n}`);
        return reel({ menu: menuDir, dir, pick, spend, pitch, gate });
      }
    }
    fs.writeFileSync(f("real"), frame);
  }
  // A frame of equipment footage this run may use, cropped 9:16 at its first moment (kit-<clip>.jpg).
  const kitFrame = async (name) => {
    // The restaurant's own equipment (its photo, or the one Muse made for it) is a still: its 9:16 frame is the photo.
    const mine = stock.find((x) => x.name === name && x.own);
    if (mine) { const out = f(`kit-${name}`); if (!fs.existsSync(out)) fs.writeFileSync(out, await tallFrame(fs.readFileSync(mine.photo))); return out; }
    const out = f(`kit-${name}`), clip = read("data/stock.json").find((x) => x.name === name), m = clip.moments[0];
    if (!fs.existsSync(out)) {
      script.stock = { ...(script.stock || {}), [name]: clip };
      const src = await source(script, dir, name);
      ff("-ss", String(m.at), "-i", src, "-frames:v", "1", "-vf", `${m.crop ? `crop=${m.crop},` : ""}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`, "-q:v", "2", out);
    }
    return out;
  };
  // Another dish's layers start from that dish's own photo, as a 9:16 frame (real-<menu number>.jpg).
  const realOf = (d) => (d && d !== hero.id ? `real-${d}` : "real");
  // Another dish photographed away from the restaurant goes onto a restaurant table too, before any shot starts on it.
  const otherFrame = async (o) => {
    if (oneTable) { const t = await onTheTable(o.photo, o.id).catch((e) => (console.log(`${o.name}: not set on the table (${e.message})`), null)); if (t) return t; }
    const frame = await tallFrame(fs.readFileSync(o.photo));
    if (!offSite(item(o.id))) return frame;
    return (await resurface(frame, "plate", "Put the dish on a plain, warm wooden restaurant table, nothing else around it.").catch((e) => (console.log(`${o.name}: not moved to a table (${e.message})`), { frame }))).frame;
  };
  for (const d of new Set([...script.layers.map((l) => l.dish), ...script.shots.filter((s) => s.kind === "build").map((s) => s.dish)].filter((d) => d && d !== hero.id)))
    if (!fs.existsSync(f(realOf(d))) && others.find((o) => o.id === d)) fs.writeFileSync(f(realOf(d)), await otherFrame(others.find((o) => o.id === d)));
  for (const l of script.layers) {
    if (fs.existsSync(f(l.name))) continue;
    const truth = l.dish && l.dish !== hero.id ? fs.readFileSync(others.find((o) => o.id === l.dish).photo) : real;
    // A layer on real equipment: a 9:16 frame of the clip, and the restaurant's own food put on it with its photo as reference.
    const onKit = l.from.startsWith("stock:"), base = onKit ? await kitFrame(l.from.slice(6)) : f(l.from === "real" ? realOf(l.dish) : l.from);
    const loose = onKit || (l.from === "real" && !l.present.length), ref = onKit ? truth : null;
    let { frame, outside } = await peel(fs.readFileSync(base), l.remove, script.container, ref, loose).catch(() => peel(fs.readFileSync(base), l.remove, "plate", ref, loose));
    let check = await checkFrame(truth, frame, card, l.shows, l.present);
    if (!check.matches) {
      // Muse's own check becomes one edit of that frame; the better of the two is kept.
      const { edit } = await fixFrame(real, frame, card, check.problems.join(" "), "Muse's frame check");
      const fixed = await peel(frame, edit, script.container, null, loose).catch(() => null);
      const again = fixed && (await checkFrame(truth, fixed.frame, card, l.shows, l.present));
      if (again && again.score >= check.score) ({ frame, outside } = fixed), (check = { ...again, fixed: edit });
    }
    fs.writeFileSync(f(l.name), frame);
    mark(l.name, { outside, matches: check.matches, score: check.score, problems: check.problems });
    // A layer Muse Image cannot draw would carry a wrong frame into paid video. It goes back to Muse once:
    // the plan, the words and the frames start over around it. A second miss stops the run.
    if (!check.matches) {
      const failed = [...(fs.existsSync(failedFile) ? read(failedFile) : []), { name: l.name, remove: l.remove, problems: check.problems }];
      if (failed.length > 1) return { stop: "frames", failed };
      save(failedFile, failed);
      console.log(`layer ${l.name} cannot be drawn, Muse plans again around it`);
      for (const n of fs.readdirSync(dir)) if (n.endsWith(".jpg") || ["plan.json", "script.json", "frames.json"].includes(n)) fs.rmSync(`${dir}/${n}`);
      return reel({ menu: menuDir, dir, pick, spend });
    }
  }
  for (const s of script.shots) {
    const name = fromDish(s) || s.kind === "spread" ? `start-${s.n}` : s.kind === "still" ? `still-${s.n}` : null;
    if (!name || fs.existsSync(f(name))) continue;
    if (s.kind === "spread") {
      // Every dish of the idea, cut out of its own photo, on one table (the kit's own spread table, kept for its Reels).
      const table = `${menuDir}/spread-table.jpg`;
      if (!fs.existsSync(table)) fs.writeFileSync(table, await tableScene());
      fs.writeFileSync(f(name), await spreadFrame([photo, ...others.map((o) => o.photo)], fs.readFileSync(table), dir));
      mark(name, { spread: [hero.name, ...others.map((o) => item(o.id)?.name || o.name)] });
      continue;
    }
    if (s.kind === "guest") {
      // A house cast member with the real dish. Muse checks face, shirt and food before any video is paid for,
      // and writes the bite from what it sees. Two misses send the plan back, like a layer that cannot be drawn.
      const people = castOf(s, cast), faces = people.map((p) => fs.readFileSync(`${menuDir}/cast/${p.name}.jpg`));
      let check = null;
      for (let k = 0; k < 2 && !check?.matches; k++) {
        const where = s.where || "on a wooden bench on the sidewalk, daytime";
        const frame = await guestFrame(faces, real, people, `the ${hero.name}`, `${where[0].toUpperCase()}${where.slice(1).replace(/\.$/, "")}.`, `just before this: ${s.what}`);
        check = { ...(await checkGuest(faces, real, frame, people, s.what)), frame };
      }
      mark(name, { who: s.who, matches: check.matches, score: check.score, problems: check.problems });
      if (!check.matches) {
        const failed = [...(fs.existsSync(failedFile) ? read(failedFile) : []), { name: `guest ${s.who}`, remove: s.what, problems: check.problems }];
        if (failed.length > 1) return { stop: "frames", failed };
        save(failedFile, failed);
        for (const n of fs.readdirSync(dir)) if (n.endsWith(".jpg") || ["plan.json", "script.json", "frames.json"].includes(n)) fs.rmSync(`${dir}/${n}`);
        return reel({ menu: menuDir, dir, pick, spend });
      }
      fs.writeFileSync(f(name), check.frame);
      s.motion = check.motion;
      save(S, script);
      continue;
    }
    const other = (s.kind === "still" || s.kind === "diner") && s.dish !== hero.id && others.find((o) => o.id === s.dish);
    // A diner shot may start where the dish sits while it cooks (an equipment layer), not only on the plated photo.
    const base = s.own ? await tallFrame(fs.readFileSync(s.own)) : s.kind === "diner" && s.start && s.start !== "real" && fs.existsSync(f(s.start)) ? fs.readFileSync(f(s.start))
      : other ? await otherFrame(other) : fs.readFileSync(f("real"));
    // SAM misses many of the words Muse writes ("crisp taco edge", "broth cup"), and a wide first frame under a
    // "tight macro" prompt makes the video model zoom in by itself, which Muse then rejects. The food is the fallback.
    let tight = s.focus ? await focusFrame(base, s.focus) : null, on = s.focus;
    if (s.focus && !tight) { tight = await focusFrame(base, "food"); on = "food"; }
    fs.writeFileSync(f(name), tight?.frame || base);
    mark(name, { focus: s.focus, found: !!tight, ...(on !== s.focus ? { on } : {}) });
  }
  const shots = script.shots.filter(ai);
  // Drafts with retries, the upscale of the ones that pass, and the music.
  if (!spend) return { stop: "plan", script, checks, estimate: +(shots.length * (0.12 * 1.5 + 0.2) + 0.12).toFixed(2) };

  // drafts: up to 3 tries a shot; Muse rewrites the motion (and the first frame if that was the problem).
  // The payoff goes first: without it there is no Reel, and the other shots stop spending.
  // The cap is what this Reel may cost in all, counting what its folder already spent: Dora's fajita crashed at $1.68,
  // came back with a fresh $5 on top and ended at $5.62 against an agreed $5 (2 Nov).
  const cap = spend, startOf = (s) => s.startFrame || (fromDish(s) || s.kind === "spread" ? f(`start-${s.n}`) : f(s.start));
  const payoffShot = shots.filter(fromDish).at(-1) || shots.at(-1);
  // The owner's word on a draft beats Muse's (owner-drafts.json, {"draft-6-2": true, "draft-2-0": false}): in Dora's run
  // Muse rejected the cheese pull Yansel liked and approved a shot where a taco vanished. A rejected shot is not retried.
  const owner = fs.existsSync(`${dir}/owner-drafts.json`) ? read(`${dir}/owner-drafts.json`) : {};
  for (const s of shots) {
    const yes = Object.keys(owner).find((d) => owner[d] && d.startsWith(`draft-${s.n}-`));
    if (yes) Object.assign(s, { draft: yes, approved: true });
    else if (s.draft && owner[s.draft] === false) s.approved = false;
  }
  // One shot's drafts, tries `from` to `from + 2`. A shot shot again after the final review keeps its earlier tries.
  const shoot = async (s, from = 0) => {
    let best = null;
    const isPayoff = s === payoffShot;
    for (let k = from; k < from + 3 && !best?.covered; k++) {
      const name = `draft-${s.n}-${k}`, video = `${dir}/${name}.mp4`, rf = `${dir}/${name}.dailies.json`, start = startOf(s);
      if (!fs.existsSync(rf)) {
        if (!fs.existsSync(video)) {
          const end = s.kind === "build" && s.end ? f(s.end === "real" ? realOf(s.dish) : s.end) : null;
          for (let t = 0; ; t++) {
            try { await omni({ start, end, prompt: s.motion, out: video, budget: cap, scope }); break; }
            catch (e) { if (t || !/no clip/.test(e.message)) throw e; console.log(`shot ${s.n}: ${e.message}, again`); }
          }
        }
        // Muse watches the take like dailies: which seconds go in the Reel, and what to avoid (src/director.mjs, dailies).
        const sheet = await timedSheet(video, `${dir}/${name}-sheet.jpg`);
        // A spread is judged against its own first frame: those are the restaurant's real dishes, all of them.
        const d = await dailies(s.kind === "spread" ? start : dishOf(s)?.photo || photo, video, sheet, cardOf(s), { ...s, hands: s.kind === "spread" ? "nobody: only the camera moves" : concept.cast }, start, playbook, isPayoff);
        if (s.kind === "build") {
          // Muse's eyes missed food floating outside the pan twice; SAM measures the take's last frame, and a spill
          // rules out the last second instead of the whole take.
          ff("-sseof", "-0.1", "-i", video, "-frames:v", "1", "-q:v", "2", `${dir}/${name}-last.jpg`);
          // Measured against the frame the take lands on: the restaurant's own empanadas hang over their plate by 17%
          // (Pikalo, 3 Nov), and that is the real dish, not a spill.
          const last = await measure(fs.readFileSync(`${dir}/${name}-last.jpg`), script.container);
          const target = s.end ? await measure(fs.readFileSync(f(s.end === "real" ? realOf(s.dish) : s.end)), script.container) : null;
          d.outside = pct(last);
          if (spills(last, target?.spill || 0)) d.avoid.push({ at: 3, dur: 1, why: `last frame: ${pct(last)} of the food outside the ${script.container}` });
        }
        // Food that vanishes or merges inside one continuous stretch (src/vanish.mjs) rules out that stretch. Only where
        // the food must stay whole: in a build or an unwrap things are added and foil leaves on purpose (it read Pikalo's
        // three unwraps as food vanishing).
        if ((s.kind === "diner" || s.kind === "spread") && covers(d, isPayoff)) for (const p of await lostFood(video)) {
          const m = p.match(/^([\d.]+)-([\d.]+) s/);
          if (m) d.avoid.push({ at: +m[1], dur: +m[2] - +m[1], why: p });
        }
        // Every take starts on the restaurant's own frame. When the video model cuts inside it to another place, what
        // follows is its own drawing, food included, and never plays (Dora, 3 Nov; src/vanish.mjs, cutAways).
        d.avoid.push(...(await cutAways(video)));
        d.windows = d.windows.map((w) => trim(w, d.avoid)).filter(Boolean);
        d.covered = covers(d, isPayoff);
        save(rf, d);
      }
      const d = read(rf), score = d.windows.filter((w) => w.quality >= 6).reduce((t, w) => t + w.dur * w.quality, 0);
      console.log(`shot ${s.n} try ${k}: ${d.covered ? "covered" : "not covered"}, ${d.windows.length} good windows (${d.windows.reduce((t, w) => t + w.dur, 0).toFixed(1)} s), craving ${d.craving}, realism ${d.realism}${d.food_true ? "" : ", NOT the real food"}`);
      if (!best || (d.covered && !best.covered) || (d.covered === best.covered && score > best.score)) best = { name, score, covered: d.covered, food: d.food_true };
      if (d.covered || k === from + 2) continue;
      const review = { approved: false, food_true: d.food_true, problems: d.avoid.map((x) => `${x.at.toFixed(1)} s: ${x.why}`), fixes: d.fixes };
      const { clip, redraw_first_frame } = await reviseClip(cardOf(s), { start: s.kind === "diner" || s.kind === "spread" ? "real_photo" : "drawn", first_frame: s.what, present: [], motion: s.motion }, review, playbook);
      s.motion = clip.motion;
      if (redraw_first_frame && s.kind !== "guest") {
        const note = [...review.problems, ...review.fixes].join(" ");
        const { edit } = await fixFrame(real, fs.readFileSync(start), card, note, "Muse's dailies");
        const fixed = await peel(fs.readFileSync(start), edit, script.container).catch(() => null);
        if (fixed) fs.writeFileSync((s.startFrame = f(`start-${s.n}-${k + 1}`)), fixed.frame);
      }
      save(S, script);
    }
    if (!best) return;
    Object.assign(s, { draft: best.name, approved: best.covered, usable: best.food });
    save(S, script);
  };
  // At the cap the run stops cleanly: everything made so far is kept and a run with more money resumes from it.
  // 4 shots at a time (2 Nov, 47 hours before the deadline): half the wait, the same money.
  let broke = null;
  await pool([payoffShot, ...shots.filter((s) => s !== payoffShot)].filter((s) => !s.draft), 4, (s) => shoot(s).catch((e) => { if (!/^budget/.test(e.message)) throw e; broke = e.message; }));
  if (broke) console.log(`spend cap reached while shooting (${broke}): the Reel is made from what passed`);
  // gate: an idea that is not coming out gives way to the next idea of the week instead of eating the whole budget
  // (Yansel, 2 Nov: "si esta idea no esta saliendo, debe pasar a la proxima"). Dora's fajita spent $5.62 on 46 drafts and
  // none passed; its Reel was photos and a grill. Under half of its video shots passing after their 3 tries is the sign.
  const passed = shots.filter((s) => s.approved).length;
  if (gate && !broke && passed < Math.ceil(shots.length / 2)) return { stop: "drafts", passed, of: shots.length, cost: +spent(LEDGER, scope).toFixed(2) };
  // Only what Muse approved goes in the Reel, and there is always a Reel: a restaurant never hears "no Reel this week"
  // (Yansel, 2 Nov). When no clip of the payoff passed, the Reel ends on the restaurant's own photo of the dish, held;
  // with no AI shot at all it is cut from the real photos and footage, and Muse's fix loop shoots again while money is left.
  const rejected = shots.filter((s) => !s.approved).map((s) => ({ n: s.n, what: s.what, draft: s.draft || null }));
  if (rejected.length) console.log(`not in the Reel: ${rejected.map((x) => `shot ${x.n}`).join(", ")}${payoffShot.approved ? "" : " (the payoff: the Reel ends on the real photo)"}`);

  // Cut, score, render and Muse's final look. When Muse rejects the Reel it does not stop there: it fixes what it named,
  // with a new cut (free) or by shooting a clip again (a draft), and looks again. Four looks at most; the last fix only takes out.
  let review, out, note = "";
  for (let round = 0; ; round++) {
    // sharp: every approved 360p draft tripled to 1080x1920 by a precision upscaler (no invented detail), so the Reel
    // is not soft on a phone. Muse picks its moments on the draft; the cut plays the sharp copy. Over the cap: the draft plays.
    // A take plays when it covered its shot, or (real food, key action missed) it has seconds of quality 7 or more.
    const plays = (x) => x.approved || (x.usable && fs.existsSync(`${dir}/${x.draft}.dailies.json`) && read(`${dir}/${x.draft}.dailies.json`).windows.some((w) => w.quality >= 7));
    for (const s of shots.filter(plays)) {
      const hd = `${dir}/${s.draft}.hd.mp4`;
      if (fs.existsSync(hd)) continue;
      try { await upscale({ video: `${dir}/${s.draft}.mp4`, out: hd, budget: cap, scope }); }
      catch (e) { console.log(`shot ${s.n} stays at 360p: ${e.message}`); }
    }

    if (!script.seconds) { script.seconds = pickLength(); save(S, script); }
    // cut: Muse picks the pieces of every clip (kept per draft), then assembles them.
    const pieces = [];
    for (const s of script.shots) {
      // A take that showed another food never plays; one that missed its key action still gives its best seconds.
      if (ai(s) && !plays(s)) continue;
      if (ai(s)) {
        const d = read(`${dir}/${s.draft}.dailies.json`);
        d.windows.filter((w) => w.quality >= (s.approved ? 5 : 7)).forEach((w, i) => pieces.push({ id: `${s.n}${"abcdefghij"[i]}`, shot: s.n, kind: s.kind, src: s.draft, at: w.at, dur: w.dur, what: w.shows, score: w.quality, beat: w.beat, punch: w.punch }));
      } else if (s.kind === "still") pieces.push({ id: `${s.n}`, shot: s.n, kind: "still", photo: f(`still-${s.n}`), at: 0, dur: 0.5, what: s.what });
      else if (s.kind === "spread") pieces.push({ id: `${s.n}`, shot: s.n, kind: "spread", photo: f(`start-${s.n}`), at: 0, dur: 2.2, what: "the camera passes over all the dishes together on one table (the food is the real photos)" });
      // A run planned before another restaurant took this look (src/stock.mjs) leaves its clip out of the cut.
      else if (owners()[groupOf(script.stock[s.stock])] && owners()[groupOf(script.stock[s.stock])] !== menu.restaurant) console.log(`shot ${s.n}: ${s.stock} belongs to ${owners()[groupOf(script.stock[s.stock])]}, left out`);
      else script.stock[s.stock].moments.forEach((m, i) => pieces.push({ id: `${s.n}${"abcd"[i]}`, shot: s.n, kind: "stock", src: s.stock, ...m }));
    }
    if (!payoffShot.approved) pieces.push({ id: "real", shot: payoffShot.n, kind: "still", photo: f("real"), at: 0, dur: 2, what: "The restaurant's own photo of the finished dish: the payoff, held." });
    // What Muse dropped at a look stays out: Pikalo's last cut played again the press with the wrong bread that Muse had
    // asked, in words, to leave out (4 Nov). A piece whose take was shot again has a new id and comes back.
    const dropped = new Set(script.dropped || []);
    for (let i = pieces.length - 1; i >= 0; i--) if (dropped.has(`${pieces[i].src || pieces[i].photo}@${pieces[i].at}`) && pieces[i].id !== "real") pieces.splice(i, 1);
    save(`${dir}/pieces.json`, pieces);
    let cuts;
    if (!script.edit) {
      // A cut that ends before the story lands goes back to Muse with its length. No target length is given up front:
      // a minimum in the prompt becomes the length of every Reel.
      let len = 0;
      if (!payoffShot.approved && !note.includes('piece "real"')) note += `\nNo clip of the payoff passed: the last cut is piece "real", the restaurant's own photo of the dish, held 1.6-2.4 s.`;
      for (let t = 0; t < 3; t++) {
        const cut = await cutReel(concept, pieces.map((p) => ({ id: p.id, shot: p.shot, kind: p.kind, at: p.at, dur: p.dur, what: p.what, quality: p.score ?? null, key_action: p.beat ?? null, tight_crop: !!(p.punch || p.crop) })), playbook, note, script.seconds, { rhythm: script.rhythm, texts: script.text_style === "none" ? [] : script.texts || [] });
        cuts = cut.cuts;
        script.overlay = cut.texts;
        script.edit = await toEdit(cuts, pieces, shots.filter((s) => s.approved), payoffShot, dir, { letters: concept.axes?.style === "letters" });
        len = script.edit.reduce((a, e) => a + e.dur, 0);
        if (len >= script.seconds - 1) break;
        console.log(`cut ${len.toFixed(1)} s for a ${script.seconds} s Reel: cutting again`);
        note += `\nYour last cut ran ${len.toFixed(1)} s; this Reel runs about ${script.seconds} s and that one ended before the story landed. Use more of the pieces, let the strongest ones run their whole window, and hold the payoff longer after its peak.`;
      }
      // Dora's cut stayed at 6.9 s three times: Muse keeps its 0.4-0.8 s rhythm when the pieces run out. What is missing
      // comes first from the payoff hold, then from the other clips running longer (up to 0.5 s more each, within their
      // clip), and last from the restaurant's own photo of the dish held at the end: Balis's first cut was 5.2 s with
      // no room left in its payoff clip. 7.2, not 7: every part is rounded to whole frames at render (7.0 played 6.96).
      const floor = Math.max(9, script.seconds - 1);
      if (len < floor) {
        // A clip grows only up to where another piece of the same take starts: Dora's elote replayed 1.3 s of its own
        // take when the first piece ran into the second.
        const room = (e) => e.still ? 3 - e.dur : Math.min(e.wend ?? 4, ...script.edit.filter((x) => x !== e && x.src === e.src && x.at >= e.at).map((x) => x.at)) - e.at - e.dur, last = script.edit.at(-1);
        let need = floor + 0.2 - len;
        for (const e of [last, ...script.edit.slice(0, -1).filter((x) => !x.still).reverse()]) {
          // Clips run longer first, all the way their approved take allows: a held photo at the end reads as "fotos
          // pasando" (Yansel, 2 Nov), a pour that keeps going does not.
          const add = Math.max(0, Math.min(room(e), need));
          e.dur = +(e.dur + add).toFixed(2);
          need -= add;
        }
        // The real photo closes for at most 1.2 s: a Reel that is still short after that needs more footage, not a longer photo.
        if (need > 0.05 && last.photo === f("real")) last.dur = +(last.dur + Math.min(need, Math.max(0, 1.2 - last.dur))).toFixed(2);
        else if (need > 0.05) script.edit.push({ still: true, photo: f("real"), dur: +Math.min(1.2, Math.max(0.6, need)).toFixed(2), sound: null, what: "The restaurant's own photo of the dish, held at the end." });
        console.log(`cut ${len.toFixed(1)} s: held longer to ${script.edit.reduce((a, e) => a + e.dur, 0).toFixed(1)} s`);
      }
      script.texts_at = textTimes(script.edit, script.overlay || []);
      save(`${dir}/cuts.json`, cuts);
      save(S, script);
    } else cuts = fs.existsSync(`${dir}/cuts.json`) ? read(`${dir}/cuts.json`) : [];

    // music, render, review.
    // 3 s longer than the cut: the take's last hit then comes after the payoff and render skips the start to reach it.
    // A new cut of another length needs a new take; the old one is kept in old/.
    script.music.ms = Math.round((script.edit.reduce((t, e) => t + e.dur, 0) + 3) * 1000);
    if (fs.existsSync(`${dir}/music.wav`) && Math.abs(probe(`${dir}/music.wav`) * 1000 - script.music.ms) > 1500) {
      fs.mkdirSync(`${dir}/old`, { recursive: true });
      for (const x of ["music.wav", "music.mp3"]) if (fs.existsSync(`${dir}/${x}`)) fs.renameSync(`${dir}/${x}`, `${dir}/old/${Date.now()}-${x}`);
    }
    save(S, script);
    await music(script, dir);
    out = await render(script, dir);
    // The text a creator would type in the app, burned in last (src/overlay.mjs); the clean copy stays as final-notext.mp4.
    if (script.texts_at?.length && script.text_style && script.text_style !== "none") {
      fs.renameSync(out.file, `${dir}/final-notext.mp4`);
      try { await overlay(`${dir}/final-notext.mp4`, script.texts_at.map((x) => ({ ...x, style: script.text_style, pos: "top" })), out.file); }
      catch (e) { console.log(`text not burned in: ${e.message}`); fs.copyFileSync(`${dir}/final-notext.mp4`, out.file); }
    }
    // Every problem an earlier look of this run named, so a noisy look cannot wave it through.
    const earlier = [...new Set(fs.readdirSync(dir).filter((x) => /^review-\d+\.json$/.test(x)).flatMap((x) => read(`${dir}/${x}`).problems || []))].slice(-10);
    review = await reviewReel(real, out.file, card, playbook, {
      concept: { title: concept.title, idea: concept.idea, format: concept.format }, shots: script.shots.map(({ n, kind, what, dish, stock }) => ({ n, kind, what, ...(dish ? { dish } : {}), ...(stock ? { stock } : {}) })) },
      others.filter((o) => script.shots.some((s) => s.dish === o.id)), earlier);
    // A line of text that says what nobody said comes off, and the text is burned in again (Balis's "10-piece fusion pile").
    const lie = (x) => (review.false_texts || []).some((t) => t.trim().toLowerCase() === x.text.trim().toLowerCase());
    if (script.texts_at?.some(lie) && fs.existsSync(`${dir}/final-notext.mp4`)) {
      script.texts_removed = [...(script.texts_removed || []), ...script.texts_at.filter(lie)];
      script.texts_at = script.texts_at.filter((x) => !lie(x));
      save(S, script);
      await overlay(`${dir}/final-notext.mp4`, script.texts_at.map((x) => ({ ...x, style: script.text_style, pos: "top" })), out.file);
      console.log(`text taken off: ${script.texts_removed.map((x) => x.text).join("; ")}`);
    }
    save(`${dir}/review-${round}.json`, review);
    console.log(`look ${round}: ${review.approved ? "approved" : "rejected"}, ${out.seconds.toFixed(1)} s, craving ${review.craving}, realism ${review.realism}, rhythm ${review.rhythm}, hook ${review.hook}`);
    if (review.approved && review.idea_on_screen === false) review.approved = false;
    // Three looks that can shoot again, and a fourth that only takes out what is wrong (free): what goes to the
    // restaurant is what Muse approved, or the least it rejected.
    if (review.approved || round === 3) break;

    const locked = shots.filter((s) => Object.keys(owner).some((d) => owner[d] && d.startsWith(`draft-${s.n}-`))).map((s) => s.n);
    const fix = await fixReel(review, script.shots, pieces, cuts, locked, playbook, round === 2);
    if (round === 2) fix.reshoot = [];
    save(`${dir}/fix-${round}.json`, fix);
    const drop = pieces.filter((p) => (fix.drop || []).includes(p.id) && p.id !== "real");
    // Never all of them: a Reel needs pieces left to cut.
    if (drop.length && drop.length < pieces.length - 1) {
      script.dropped = [...new Set([...(script.dropped || []), ...drop.map((p) => `${p.src || p.photo}@${p.at}`)])];
      console.log(`dropped: ${drop.map((p) => `${p.id} (${p.what})`).join("; ")}`);
    }
    let changed = !!fix.recut || drop.length > 0;
    for (const r of fix.reshoot) {
      const s = shots.find((x) => x.n === r.n && !locked.includes(x.n));
      if (!s) continue;
      const prev = { draft: s.draft, approved: s.approved, motion: s.motion };
      const { clip } = await reviseClip(card, { start: s.kind === "diner" || s.kind === "spread" ? "real_photo" : "drawn", first_frame: s.what, present: [], motion: s.motion }, { approved: false, physics_errors: [r.why], truth_errors: [], fixes: [] }, playbook);
      let from = 0;
      while (fs.existsSync(`${dir}/draft-${s.n}-${from}.review.json`) || fs.existsSync(`${dir}/draft-${s.n}-${from}.dailies.json`)) from++;
      Object.assign(s, { motion: clip.motion, draft: undefined, approved: false });
      try { await shoot(s, from); } catch (e) { console.log(`shot ${s.n} not shot again: ${e.message}`); }
      if (s.approved) changed = true;
      else Object.assign(s, prev);
      save(S, script);
    }
    if (!changed) break;
    note = [fix.recut, ...fix.reshoot.map((r) => `Shot ${r.n} was shot again: ${r.why}`)].filter(Boolean).join("\n");
    script.edit = null;
    save(S, script);
  }
  save(`${dir}/review.json`, review);
  // The feed's memory: this restaurant never repeats this format or cast, and other restaurants reuse it only made their own.
  const history = loadHistory().filter((h) => h.run !== dir);
  save("data/history.json", [...history, { run: dir, date: new Date().toLocaleDateString("en-CA"), restaurant: `${menu.restaurant} (${menu.cuisine})`,
    dish: hero.name, title: concept.title, kind: concept.kind || "", format: concept.format || concept.idea, cast: concept.cast || "", stock: [...new Set(script.edit.filter((e) => script.stock?.[e.src]).map((e) => e.src))],
    music: script.music.register || "", text: script.text_style || "", rhythm: script.rhythm || "",
    // How it was told and whether Muse stood behind it: variety (src/ideas.mjs) and what works learn from both.
    combo: concept.combo || "", approved: !!review?.approved }]);
  return { stop: "done", final: out.file, seconds: out.seconds, review, cost: +spent(LEDGER, scope).toFixed(2) };
}

// Muse's cuts as the renderer's edit list. Times are kept inside their 4 s clip; a punch-in is framed by SAM
// on the middle frame of the cut; stills and stock borrow a draft's kitchen sound.
async function toEdit(cuts, pieces, shots, payoffShot, dir, { letters = false } = {}) {
  const by = Object.fromEntries(pieces.map((p) => [p.id, p])), build = shots.find((s) => s.kind === "build") || shots[0], edit = [];
  // Stills and stock borrow the kitchen sound of a clip that passed; with none, they play under the music alone.
  const bed = (shots.includes(payoffShot) ? payoffShot : shots[0])?.draft;
  // The same seconds of a clip never play twice (the fryer came back three times in Pikalo's first cut).
  const shown = [], again = (src, at, dur) => shown.some((w) => w.src === src && at < w.at + w.dur && w.at < at + dur);
  for (const [ci, c] of cuts.entries()) {
    const p = by[c.piece];
    if (!p) continue;
    const at = p.kind === "ai" || p.kind === "build" || p.kind === "diner" || p.kind === "guest" ? clamp(c.at, 0, 3.6) : p.at ?? 0;
    if (p.kind !== "still" && again(p.src, at, c.dur)) continue;
    if (p.kind !== "still") shown.push({ src: p.src, at, dur: c.dur });
    // A still is a flash (0.4-0.7 s), except the real photo held as the payoff when no payoff clip passed.
    if (p.kind === "spread") { edit.push({ cut: ci, still: true, pan: true, photo: p.photo, dur: clamp(c.dur, 1.2, 2.2), sound: bed ? { src: bed, at: 0, gain: -14 } : null, what: p.what }); continue; }
    if (p.kind === "still") edit.push({ cut: ci, still: true, photo: p.photo, dur: c === cuts.at(-1) && p.id === "real" ? clamp(c.dur, 1.6, 2.6) : clamp(c.dur, 0.4, letters ? 1.3 : 0.7), sound: bed ? { src: bed, at: 0, gain: -14 } : null, what: p.what });
    else if (p.kind === "stock") edit.push({ cut: ci, src: p.src, at: p.at, dur: clamp(c.dur, 0.3, 0.8), ...(p.crop ? { crop: p.crop } : {}), sound: build ? { src: build.draft, at: 0 } : null, what: p.what });
    else {
      // A cut stays inside the window Muse marked good in the dailies (the payoff may run 0.2 s past it).
      const wend = Math.min(4, p.at + p.dur), at = clamp(c.at, p.at, Math.max(p.at, wend - 0.3)), dur = +clamp(c.dur, 0.3, Math.min(4, wend + (c === cuts.at(-1) ? 0.2 : 0)) - at).toFixed(2);
      const src = fs.existsSync(`${dir}/${p.src}.hd.mp4`) ? `${p.src}.hd` : p.src;
      const crop = c.punch && p.punch ? await punchCrop(`${dir}/${src}.mp4`, at + dur / 2, p.punch, dir) : null;
      edit.push({ cut: ci, src, at, dur, wend, ...(crop ? { crop } : {}), what: p.what });
    }
  }
  const last = edit.at(-1), peak = cuts.at(-1).payoff;
  last.payoff = +(peak > 0 ? clamp(peak, 0.3, last.dur - 0.2) : last.dur * 0.55).toFixed(2);
  return edit;
}

// A tight 9:16 crop around what SAM finds in the draft's frame at `t`, in the draft's own pixels.
async function punchCrop(video, t, concept, dir) {
  const jpg = `${dir}/punch.jpg`;
  ff("-ss", String(t), "-i", video, "-frames:v", "1", "-q:v", "2", jpg);
  // At least 75% of a 360p draft's width (a tighter crop blows a few pixels up to the whole screen); the sharp copy allows 55%.
  const { width } = await sharp(jpg).metadata(), hit = await focusFrame(fs.readFileSync(jpg), concept, width >= 1000 ? 0.55 : 0.75);
  if (!hit) return null;
  const k = width / 1080, b = hit.box;
  return [b.width, b.height, b.left, b.top].map((v) => Math.round(v * k)).join(":");
}

// The clip's frames every 0.25 s, each stamped with its time, so Muse can name exact seconds.
async function timedSheet(video, file) {
  const tmp = `${file}.d`;
  fs.mkdirSync(tmp, { recursive: true });
  ff("-i", video, "-vf", "fps=4,scale=180:320", `${tmp}/%02d.jpg`);
  const frames = fs.readdirSync(tmp).sort().slice(0, 16);
  const cells = await Promise.all(frames.map(async (fr, i) => [
    { input: fs.readFileSync(`${tmp}/${fr}`), left: (i % 8) * 180, top: Math.floor(i / 8) * 320 },
    { input: Buffer.from(`<svg width="90" height="34"><rect width="90" height="34" fill="black"/><text x="8" y="25" font-family="Helvetica" font-size="22" font-weight="bold" fill="yellow">${(i / 4).toFixed(2)}s</text></svg>`), left: (i % 8) * 180, top: Math.floor(i / 8) * 320 },
  ]));
  await sharp({ create: { width: 1440, height: 320 * Math.ceil(frames.length / 8), channels: 3, background: "#000" } }).composite(cells.flat()).jpeg({ quality: 88 }).toFile(file);
  fs.rmSync(tmp, { recursive: true });
  return fs.readFileSync(file);
}

// The longest clean stretch of a window once the seconds to avoid are taken out of it; null under 0.4 s.
function trim(w, avoid) {
  let segs = [[w.at, Math.min(4, w.at + w.dur)]];
  for (const a of avoid) segs = segs.flatMap(([x, y]) => (a.at >= y || a.at + a.dur <= x ? [[x, y]] : [[x, a.at], [a.at + a.dur, y]]).filter(([p, q]) => q - p > 0.05));
  const [x, y] = segs.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0] || [0, 0];
  return y - x >= 0.4 ? { ...w, at: +x.toFixed(2), dur: +(y - x).toFixed(2) } : null;
}

// Muse places each text line on cuts (from, to); here they become seconds of the finished Reel. The hook starts at 0.
function textTimes(edit, texts) {
  const starts = [];
  let t = 0;
  for (const e of edit) { starts.push(t); t += e.dur; }
  return texts.map((x) => {
    const i0 = Math.max(0, edit.findIndex((e) => e.cut >= x.from)), i1 = Math.max(i0, edit.findLastIndex((e) => e.cut != null && e.cut <= x.to));
    const start = x.from === 0 ? 0 : starts[i0], end = Math.min(t - 0.1, Math.max(start + 1.2, Math.min(start + 3.5, starts[i1] + edit[i1].dur)));
    return { text: x.text, start: +start.toFixed(2), end: +end.toFixed(2) };
  }).filter((x) => x.text && x.end > x.start).sort((a, b) => a.start - b.start)
    // One line on screen at a time: two at once drew over each other in Dora's Reel.
    .map((x, i, a) => (a[i + 1] && a[i + 1].start < x.end ? { ...x, end: a[i + 1].start } : x)).filter((x) => x.end - x.start >= 0.8);
}
