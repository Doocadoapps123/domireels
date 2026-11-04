// "How Muse directed it": a Reel opened up for the public gallery. From its run folder: the real photos it got, what
// Muse saw in each (src/inventory.mjs), the idea and the judge's scores, the storyboard, every take with the seconds Muse
// kept and the ones it threw away and why (dailies), its last look, and the cost. Images go to the public gallery bucket.
// Usage: node --env-file=../.env src/server/gallery.mjs <reel id>                       a Reel the worker made
//        node --env-file=../.env src/server/gallery.mjs --run <dir> --kit <kit> --restaurant <id>   a lab Reel
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { db, must, upload, publicUrl } from "./db.mjs";
import { readMenu } from "../menu.mjs";
import { spent } from "../video.mjs";
import { probe } from "../edit.mjs";
import { ask } from "../director.mjs";

const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const small = (f, w = 720) => sharp(f).rotate().resize({ width: w, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();

export async function gallery({ id, dir, kit, restaurantName }) {
  const script = read(`${dir}/script.json`), menu = readMenu(kit), base = `${id}`;
  const put = async (name, file, w) => publicUrl("gallery", await upload("gallery", `${base}/${name}`, await small(file, w), "image/jpeg"));
  const weekFile = fs.readdirSync(kit).filter((f) => /^week-.*\.json$/.test(f)).map((f) => `${kit}/${f}`).find((f) => read(f).some((c) => c.title === script.concept));
  const concept = weekFile ? read(weekFile).find((c) => c.title === script.concept) : null;
  // Old runs keep their hero only in script.dish ("Yaroa de Pierna (Master Pizza Tropical)"): it goes first.
  const heroByName = menu.items.find((m) => script.dish?.startsWith(`${m.name} (`))?.id;
  const ids = [...new Set([heroByName, ...(script.dishes || concept?.dishes || []), ...script.shots.map((s) => s.dish)].filter(Boolean))];
  const inv = fs.existsSync(`${kit}/inventory.json`) ? Object.values(read(`${kit}/inventory.json`)) : [];

  const photos = [], saw = [];
  for (const d of ids.map((x) => menu.items.find((m) => m.id === x)).filter(Boolean)) {
    photos.push({ url: await put(`photo-${d.id}.jpg`, `${kit}/${d.photo}`), caption: d.name });
    const i = inv.find((x) => x.id === d.id);
    if (i) saw.push({ dish: d.name, hungriest: i.hungriest, layers: i.layers, hands: i.hands, weak: i.weak });
  }
  try { execFileSync("node", ["lab/board.mjs", dir], { stdio: "ignore" }); } catch {}
  const board = fs.existsSync(`${dir}/board.jpg`) ? await put("board.jpg", `${dir}/board.jpg`, 1400) : null;
  const takes = [];
  for (const s of script.shots.filter((s) => s.draft && fs.existsSync(`${dir}/${s.draft}.dailies.json`))) {
    const d = read(`${dir}/${s.draft}.dailies.json`), sheet = `${dir}/${s.draft}-sheet.jpg`;
    takes.push({
      shot: s.n, what: s.what, kept: (d.windows || []).map((w) => [w.at, +(w.at + w.dur).toFixed(2), w.shows]),
      avoid: (d.avoid || []).map((a) => ({ at: a.at, why: a.why })), sheet: fs.existsSync(sheet) ? await put(`take-${s.n}.jpg`, sheet, 1400) : null,
      tries: fs.readdirSync(dir).filter((f) => f.startsWith(`draft-${s.n}-`) && f.endsWith(".mp4") && !f.includes(".hd")).length,
    });
  }
  const review = fs.existsSync(`${dir}/review.json`) ? read(`${dir}/review.json`) : {};
  // The site is in English; Muse wrote some of its notes in the owner's Spanish.
  const notes = [review.note, ...(review.problems || [])].filter(Boolean);
  // Everything the site shows is English (Yansel, 4 Nov): dish names too ("Roast Pork Yaroa"), and a
  // one-line summary of the Reel written for the site.
  const dishNames = photos.map((p) => p.caption);
  const en = await ask([{ type: "input_text", text: `Translate to natural English for a website (keep English as it is, keep it short and plain; a dish keeps the name an English-speaking diner would order it by, "pico de gallo" stays). Also write a one-line summary of what happens in it, in English, true to the idea and the dishes, no prices, no em dashes. ${JSON.stringify({ title: concept?.title || script.concept, kind: concept?.kind || "", idea: concept?.idea || "", why: concept?.why_real || "", note: concept?.muse?.note || "", review: notes, dishes: dishNames, summary: script.owner_summary || "" })}` }],
    "english", { type: "object", additionalProperties: false, required: ["title", "kind", "idea", "why", "note", "review", "dishes", "summary"], properties: { title: { type: "string" }, kind: { type: "string", description: "The kind of Reel as a short English name." }, idea: { type: "string" }, why: { type: "string" }, note: { type: "string" }, review: { type: "array", items: { type: "string" } }, dishes: { type: "array", items: { type: "string" }, description: "The dish names in English, same order." }, summary: { type: "string" } } })
    .catch(() => null);
  if (en?.dishes?.length === photos.length) {
    photos.forEach((p, i) => { p.caption = en.dishes[i]; });
    saw.forEach((x) => { const i = dishNames.indexOf(x.dish); if (i >= 0) x.dish = en.dishes[i]; });
  }
  return {
    restaurant: restaurantName || menu.restaurant, photos, saw,
    idea: concept ? { title: en?.title || concept.title, kind: en?.kind || concept.kind, idea: en?.idea || concept.idea, why: en?.why || concept.why_real || "", scores: { ...(concept.muse || {}), note: en?.note || concept.muse?.note || "" } } : { title: en?.title || script.concept },
    board, takes, review: { approved: review.approved ?? null, notes: en?.review || notes },
    cost: +spent("lab/out/ledger.jsonl", `${dir}/`).toFixed(2), seconds: +probe(`${dir}/final.mp4`).toFixed(1),
    music: script.music?.register || "", rhythm: script.rhythm || "", summary: en?.summary || "",
  };
}

// The Reel itself goes to the public bucket too, so the gallery page plays it without a signature. Only a Reel Muse
// approved at its last look: the gallery shows what Muse stands behind (--force for one Yansel chose anyway).
async function publish(reel, g) {
  if (g.review.approved !== true && !process.argv.includes("--force")) throw new Error(`Muse did not approve this Reel at its last look: ${g.review.notes.join(" | ")}`);
  const v = reel.versions[reel.chosen ?? 0], file = `/tmp/${reel.id}.mp4`;
  const { data } = await db.storage.from("reels").download(v.phone || v.path);
  fs.writeFileSync(file, Buffer.from(await data.arrayBuffer()));
  g.video = publicUrl("gallery", await upload("gallery", `${reel.id}/reel.mp4`, fs.readFileSync(file), "video/mp4"));
  if (reel.cover_path) { const c = await db.storage.from("reels").download(reel.cover_path); g.cover = publicUrl("gallery", await upload("gallery", `${reel.id}/cover.jpg`, Buffer.from(await c.data.arrayBuffer()), "image/jpeg")); }
  await must(db.from("reels").update({ public: true, director: { ...reel.director, gallery: g } }).eq("id", reel.id));
}

if (process.argv[1]?.endsWith("gallery.mjs")) {
  const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
  if (process.argv.includes("--run")) {
    // A lab Reel: it gets a reel row first, with its final file as its one version.
    const dir = arg("--run"), kit = arg("--kit"), rid = arg("--restaurant"), id = crypto.randomUUID();
    const [r] = await must(db.from("restaurants").select("*").eq("id", rid)), script = read(`${dir}/script.json`);
    const phone = `/tmp/${id}-phone.mp4`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", `${dir}/final.mp4`, "-c:v", "libx264", "-crf", "24", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", phone]);
    const payoff = (script.edit || []).reduce((t, e) => (e.payoff != null ? { at: t.at + e.payoff, done: true } : t.done ? t : { at: t.at + e.dur }), { at: 0 }).at;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(payoff), "-i", `${dir}/final.mp4`, "-frames:v", "1", "-q:v", "2", `/tmp/${id}.jpg`]);
    const b = `${r.id}/${id}`;
    await upload("reels", `${b}/0.mp4`, fs.readFileSync(`${dir}/final.mp4`), "video/mp4");
    await upload("reels", `${b}/0-phone.mp4`, fs.readFileSync(phone), "video/mp4");
    await upload("reels", `${b}/cover.jpg`, fs.readFileSync(`/tmp/${id}.jpg`), "image/jpeg");
    const [reel] = await must(db.from("reels").insert({ id, restaurant_id: r.id, title: script.concept, idea: script.owner_summary || "", seconds: +probe(`${dir}/final.mp4`).toFixed(2), cover_path: `${b}/cover.jpg`,
      versions: [{ register: script.music?.register || "", path: `${b}/0.mp4`, phone: `${b}/0-phone.mp4` }], chosen: 0, director: { kit, dir }, cost: +spent("lab/out/ledger.jsonl", `${dir}/`).toFixed(2), delivered_at: new Date().toISOString() }).select());
    await publish(reel, await gallery({ id, dir, kit, restaurantName: r.name.split(" - ")[0] }));
    console.log(`${process.env.DR_PUBLIC_URL}/g/${id}`);
  } else {
    const [reel] = await must(db.from("reels").select("*, restaurants(name)").eq("id", process.argv[2]));
    await publish(reel, await gallery({ id: reel.id, dir: reel.director.dir, kit: reel.director.kit, restaurantName: reel.restaurants.name.split(" - ")[0] }));
    console.log(`${process.env.DR_PUBLIC_URL}/g/${reel.id}`);
  }
}
