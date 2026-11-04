// Muse looks at a restaurant's whole menu and pitches the next Reel itself, one dish or many.
// A menu folder holds menu.json ({restaurant, cuisine, items: [{id, name, description, price, photo, ai_note}]}) and the photos.
// ai_note is the owner's own note on the item in Domi ("Menu Products".ai_note); Muse takes it as the owner's word.
import fs from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";
import { pitchMenu, judgeMenu, checkPhotos, ratePhoto, loadPlaybook, loadHistory } from "./director.mjs";
import { ownStock } from "./assets.mjs";
import { inventory } from "./inventory.mjs";
import { stylesFor, voiceRecord, axesText, examplesText, recentCombos, comboOf, comboText, worthMaking } from "./ideas.mjs";
import { owners, groupOf } from "./stock.mjs";

const C = 256, COLS = 6, ROWS = 5;
const rawMenu = (dir) => JSON.parse(fs.readFileSync(`${dir}/menu.json`, "utf8"));
const hashOf = (file) => crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
const ratings = (dir) => (fs.existsSync(`${dir}/photos.json`) ? JSON.parse(fs.readFileSync(`${dir}/photos.json`, "utf8")) : {});
const optionsOf = (dir, m) => [m.photo, ...(m.alts || [])].filter((p) => p && fs.existsSync(`${dir}/${p}`));

// The menu as the pipeline sees it: each dish plays its best rated photo, the menu's or one the owner sent of it (alts,
// from the kit's library). Photos keep coming, to the menu and to the owner's library, so nothing here is fixed: a new or
// changed photo is rated by content the next time Muse pitches (photoScores) and wins if it is better.
export const readMenu = (dir) => {
  const menu = rawMenu(dir), rated = ratings(dir);
  for (const m of menu.items) {
    const best = optionsOf(dir, m).map((p) => ({ p, r: rated[hashOf(`${dir}/${p}`)] })).filter((o) => o.r).sort((a, b) => b.r.score - a.r.score)[0];
    if (best && best.p !== m.photo) Object.assign(m, { menu_photo: m.photo, photo: best.p });
    if (best) Object.assign(m, { photo_score: best.r.score, photo_problems: best.r.problems, photo_setting: best.r.setting || "" });
  }
  return menu;
};
// A dish photographed away from the restaurant (an office desk, a home, a car) still carries a Reel, moved onto a
// restaurant table first (Yansel, 4 Nov: "puede cargar el reel pero muévela de escenario").
const OFF_SITE = new Set(["home", "office or desk", "car", "takeout packaging only", "other"]);
export const offSite = (m) => OFF_SITE.has(m?.photo_setting);

// Numbered contact sheets, 30 photos each, so Muse sees every dish at once and names them by menu number.
export async function sheets(dir, items) {
  const out = [];
  for (let s = 0; s < items.length; s += COLS * ROWS) {
    const page = items.slice(s, s + COLS * ROWS);
    const cells = await Promise.all(page.map(async (m, i) => [
      { input: await sharp(`${dir}/${m.photo}`).rotate().resize(C, C, { fit: "cover" }).toBuffer(), left: (i % COLS) * C, top: Math.floor(i / COLS) * C },
      { input: Buffer.from(`<svg width="${C}" height="36"><rect width="70" height="36" fill="black"/><text x="8" y="26" font-family="Helvetica" font-size="24" font-weight="bold" fill="white">${m.id}</text></svg>`), left: (i % COLS) * C, top: Math.floor(i / COLS) * C },
    ]));
    const f = `${dir}/sheet-${out.length}.jpg`;
    await sharp({ create: { width: COLS * C, height: Math.ceil(page.length / COLS) * C, channels: 3, background: "#111" } }).composite(cells.flat()).jpeg({ quality: 88 }).toFile(f);
    out.push(fs.readFileSync(f));
  }
  return out;
}

const total = (x) => x.appetite + x.scroll_stop + x.realism + x.originality + x.photos;

// Every menu photo rated full size by Muse, once (kits/<kit>/photos.json). Balis's picadera photo scored 8 as a 256 px
// thumbnail and 3 full size: its logo, a phone, the price and green text cover the top third.
export async function photoScores(dir) {
  const file = `${dir}/photos.json`, done = ratings(dir), todo = new Map();
  for (const m of rawMenu(dir).items)
    for (const p of optionsOf(dir, m)) {
      const h = hashOf(`${dir}/${p}`);
      // Rated before the setting was part of it (4 Nov): rated again.
      if ((!done[h] || !done[h].setting) && !todo.has(h)) todo.set(h, { p, name: m.name });
    }
  const list = [...todo];
  for (let i = 0; i < list.length; i += 8)
    await Promise.all(list.slice(i, i + 8).map(async ([h, { p, name }]) => { done[h] = { ...(await ratePhoto(`${dir}/${p}`, name).catch(() => ({ score: 0, problems: ["could not be rated"] }))), photo: p }; }));
  if (list.length) fs.writeFileSync(file, JSON.stringify(done, null, 2) + "\n");
  return list.length;
}

// A hero's photo needs this score: below it the Reel would live on a photo that cannot carry it.
const HERO_MIN = 6;

// Footage that reads as an ad (flames and smoke on black, skylines) is never offered: see src/auto.mjs.
const AD_LOOK = new Set(["fire", "smoke", "city-night"]);
// The equipment footage this restaurant may use: its own photos, then library clips nobody else has claimed.
export const stockFor = (dir, restaurant) => [...ownStock(dir), ...JSON.parse(fs.readFileSync("data/stock.json", "utf8"))
  .filter((x) => !AD_LOOK.has(groupOf(x)) && (!owners()[groupOf(x)] || owners()[groupOf(x)] === restaurant))];

// Six ideas Muse invents (src/ideas.mjs), ranked by a separate Muse judge. Muse first looks at what each good photo can
// do and how people eat it (src/inventory.mjs).
// look: this week's music registers and text styles for this restaurant, carried on every concept to the plan.
// planned: other restaurants' ideas for this week, read like Reels already made (lab/friday.mjs).
// trends: this week's research (src/trends.mjs, trendsText). taken: combos other restaurants used up this week.
// focus and voicesOnly narrow one pitch (several dishes, only the voices production can make today).
export async function menuPitch(dir, look = null, planned = [], { trends = "", taken = [], focus = "", voicesOnly = null } = {}) {
  await photoScores(dir);
  const { restaurant, cuisine, items, language } = readMenu(dir), s = await sheets(dir, items);
  // Every reel Domi made; director.mjs (historyText) decides what this restaurant may not repeat.
  const playbook = loadPlaybook(), history = [...loadHistory(), ...planned];
  const inv = await inventory(dir), own = ownStock(dir), stock = stockFor(dir, restaurant);
  const styles = stylesFor(dir, inv, own, stock).filter((v) => !voicesOnly || voicesOnly.includes(v));
  const mine = recentCombos(loadHistory(), restaurant);
  const label = (c) => `${c} (${comboText(c)})`;
  const concepts = (await pitchMenu(s, `${restaurant} (${cuisine})`, items, playbook, history, {
    own, inv, stock, lang: language === "es" ? "Spanish" : "English", trends,
    axes: axesText({ styles, record: voiceRecord(loadHistory()) }), examples: examplesText(),
    taken: taken.map(label), mine: mine.map(label), focus,
  })).map((c) => ({ ...c, combo: comboOf(c.axes), ...(look ? { look } : {}) }));
  const scores = await judgeMenu(s, concepts, playbook, history, restaurant, inv);
  // A dish that was this restaurant's hero in its last 3 Reels waits: the same photo does not come back that fast.
  const heroOf = (x) => items.find((m) => m.id === concepts[x.index].dishes[0])?.name;
  const recent = new Set(history.filter((h) => h.restaurant.split(" (")[0] === restaurant).slice(-3).map((h) => h.dish));
  const weak = (x) => (items.find((m) => m.id === concepts[x.index].dishes[0])?.photo_score ?? 0) < HERO_MIN;
  // Muse cannot tell a Reel in a voice this restaurant lacks, nor in a combo that is someone else's this week or its own lately.
  const off = (x) => { const c = concepts[x.index]; return (!styles.includes(c.axes.style) && c.axes.style !== "new") || taken.includes(c.combo) || mine.includes(c.combo); };
  const ok = (x) => worthMaking({ muse: x });
  const order = (a, b) => off(a) - off(b) || ok(b) - ok(a) || weak(a) - weak(b) || recent.has(heroOf(a)) - recent.has(heroOf(b)) || total(b) - total(a);
  scores.sort(order);
  // The 3 best ideas get their photos looked at full size; that score replaces the thumbnail one.
  await Promise.all(scores.slice(0, 3).map(async (x) => {
    const photos = concepts[x.index].dishes.map((id) => items.find((m) => m.id === id)).filter((m) => m?.photo).map((m) => ({ name: m.name, file: `${dir}/${m.photo}` }));
    const check = await checkPhotos(concepts[x.index], photos);
    Object.assign(x, { photos_thumb: x.photos, photos: check.photos, photo_problems: check.problems });
  }));
  return scores.sort(order).map((x) => ({ ...concepts[x.index], muse: { ...x, off: off(x) }, total: total(x) }));
}

// The judge again on concepts already pitched (after its rules change), without pitching them again.
// file: the pitch or a week file; planned: other restaurants' ideas this week (lab/friday.mjs).
export async function rejudge(dir, file = `${dir}/pitch.json`, planned = []) {
  const { restaurant, items } = readMenu(dir), s = await sheets(dir, items);
  const concepts = JSON.parse(fs.readFileSync(file, "utf8")).map(({ muse, total, ...c }) => c);
  const scores = await judgeMenu(s, concepts, loadPlaybook(), [...loadHistory(), ...planned], restaurant, await inventory(dir));
  const ranked = scores.sort((a, b) => !!a.repeats - !!b.repeats || total(b) - total(a)).map((x) => ({ ...concepts[x.index], muse: x, total: total(x) }));
  fs.writeFileSync(file, JSON.stringify(ranked, null, 2) + "\n");
  return ranked;
}

