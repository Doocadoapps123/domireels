// Lab: Yansel's test (2026-11-01) before letting the house cast eat on camera. Muse picks from the real menus one dish
// for a bite and one for a cheese pull, each with a member of that restaurant's cast; then one 4 s clip of each.
// Usage: node --env-file=../.env lab/bitetest.mjs [spend cap in dollars, default 2]
//   Writes lab/out/bitetest/: pick.json, <test>-frame-<k>.jpg, <test>.mp4 (360p draft), <test>.hd.mp4, <test>.json.
import fs from "node:fs";
import { ask, img, reviewDraft, loadPlaybook } from "../src/director.mjs";
import { guestFrame, checkGuest } from "../src/cast.mjs";
import { dishCard } from "../src/dish.mjs";
import { omni, upscale, spent } from "../src/video.mjs";

const out = "lab/out/bitetest", ledger = "lab/out/ledger.jsonl", budget = spent(ledger) + +(process.argv[2] || 2);
fs.mkdirSync(out, { recursive: true });
const kits = fs.readdirSync("kits").map((k) => `kits/${k}`).filter((d) => fs.existsSync(`${d}/cast.json`))
  .map((dir) => ({ dir, menu: JSON.parse(fs.readFileSync(`${dir}/menu.json`, "utf8")), cast: JSON.parse(fs.readFileSync(`${dir}/cast.json`, "utf8")) }));
// Muse names a kit by its folder; anything around "doocado-8" (a kits/ in front, the name after it) is dropped.
const kitOf = (dir) => kits.find((k) => k.dir === `kits/${String(dir).match(/doocado-\d+/)?.[0]}`), item = (dir, id) => kitOf(dir).menu.items.find((x) => x.id === id);

const TESTS = {
  bite: "One of the cast takes a real bite of the dish. It must be food a person bites straight from the hand in one natural bite (a burger, an empanada, a taco, a slice, a sandwich), where the bite shows the real filling.",
  pull: "One of the cast pulls the dish apart with their hands and real melted cheese stretches between the pieces. Only a dish whose menu text or photo shows melted cheese inside or on top that really stretches when pulled.",
};
const CHOICE = (fields) => ({ type: "object", additionalProperties: false, required: fields, properties: Object.fromEntries(fields.map((f) => [f, { type: f === "id" ? "integer" : "string" }])) });
const SHORT = { type: "object", additionalProperties: false, required: ["bite", "pull"],
  properties: Object.fromEntries(Object.keys(TESTS).map((t) => [t, { type: "array", items: { ...CHOICE(["kit", "id", "why"]),
    properties: { ...CHOICE(["kit", "id", "why"]).properties, kit: { type: "string", enum: kits.map((k) => k.dir) } } } }])) };
const PICK = { type: "object", additionalProperties: false, required: ["bite", "pull"],
  properties: Object.fromEntries(Object.keys(TESTS).map((t) => [t, { ...CHOICE(["candidate", "person", "where", "moment", "es_why"]),
    properties: { ...CHOICE(["candidate", "person", "where", "moment", "es_why"]).properties, candidate: { type: "integer", description: "Its number in the candidate list." } } }])) };

let pick = fs.existsSync(`${out}/pick.json`) ? JSON.parse(fs.readFileSync(`${out}/pick.json`, "utf8")) : null;
if (!pick) {
  // 1. From the menu text, three candidates per test.
  const menus = kits.map((k) => `${k.dir} (${k.menu.restaurant}):\n${k.menu.items.map((x) => `  ${x.id} ${x.name}${x.description ? `: ${x.description}` : ""}`).join("\n")}`).join("\n\n");
  const short = await ask([{ type: "input_text", text: `Two tests of whether an AI video of a real dish can look real. For each test name the three best candidates from these real menus, from different restaurants.
${Object.entries(TESTS).map(([t, d]) => `${t}: ${d}`).join("\n")}

${menus}` }], "shortlist", SHORT);
  // 2. Muse sees the real photos and the cast, and chooses one dish and one person per test, from two restaurants.
  const cands = Object.entries(short).flatMap(([t, l]) => l.filter((c) => kitOf(c.kit) && item(c.kit, c.id)).map((c) => ({ t, ...c, kit: kitOf(c.kit).dir })));
  for (const t of Object.keys(TESTS)) if (!cands.some((c) => c.t === t)) throw new Error(`no real candidate for ${t}: ${JSON.stringify(short[t])}`);
  const content = [{ type: "input_text", text: `Choose one dish and one person for each test, from two different restaurants. The photo is what the video starts from, so choose the photo where the food is clear, whole and appetizing, and the person of that restaurant's cast who fits the food and the moment.
${Object.entries(TESTS).map(([t, d]) => `${t}: ${d}`).join("\n")}
"where" is a real everyday place for the shot that is never the restaurant itself (a sidewalk, a park bench, a car, a kitchen counter at home). "moment" is the first frame: the instant before the action, the food still whole. "es_why" is one plain Spanish sentence for the owner: why this dish and this person.
Candidates (the photos follow in this order):
${cands.map((c, i) => `${i + 1}. ${c.t} | kit ${c.kit} id ${c.id} | ${item(c.kit, c.id).name} | cast: ${kitOf(c.kit).cast.people.map((p) => `${p.name} (${p.sex}, ${p.vibe})`).join(", ")} | ${c.why}`).join("\n")}` }];
  for (const c of cands) content.push(await img(fs.readFileSync(`${c.kit}/${item(c.kit, c.id).photo}`)));
  const chosen = await ask(content, "pick", PICK);
  pick = {};
  for (const t of Object.keys(TESTS)) {
    const c = cands[chosen[t].candidate - 1];
    if (c?.t !== t || !kitOf(c.kit).cast.people.some((p) => p.name === chosen[t].person)) throw new Error(`bad pick for ${t}: ${JSON.stringify(chosen[t])}`);
    pick[t] = { ...chosen[t], kit: c.kit, id: c.id };
  }
  fs.writeFileSync(`${out}/pick.json`, JSON.stringify({ ...pick, shortlist: short }, null, 2) + "\n");
}
for (const t of Object.keys(TESTS)) console.log(`${t}: ${pick[t].kit} ${item(pick[t].kit, pick[t].id).name}, ${pick[t].person}. ${pick[t].es_why}`);

const playbook = loadPlaybook();
for (const t of Object.keys(TESTS)) {
  const c = pick[t], k = kitOf(c.kit), m = item(c.kit, c.id), p = k.cast.people.find((x) => x.name === c.person);
  const face = fs.readFileSync(`${c.kit}/cast/${p.name}.jpg`), dish = fs.readFileSync(`${c.kit}/${m.photo}`), bite = t === "bite";
  const action = `${p.name}, ${c.where} ${TESTS[t]}`, how = bite ? undefined : "pulls the food apart slowly with both hands at chest height and the melted cheese stretches in long strings between the pieces, then a small happy look at the camera. Nobody bites, eats or chews.";
  let check = fs.existsSync(`${out}/${t}.check.json`) ? JSON.parse(fs.readFileSync(`${out}/${t}.check.json`, "utf8")) : null;
  for (let n = 0; n < 2 && !check?.matches; n++) {
    const frame = await guestFrame([face], dish, [p], `the ${m.name}`, c.where, c.moment, bite);
    fs.writeFileSync(`${out}/${t}-frame-${n}.jpg`, frame);
    check = { ...(await checkGuest([face], dish, frame, [p], action, { how, bite })), frame: `${out}/${t}-frame-${n}.jpg` };
    console.log(`${t} frame ${n}: ${check.matches ? "matches" : "no"} (${check.score}) ${check.problems.join("; ")}`);
  }
  fs.writeFileSync(`${out}/${t}.check.json`, JSON.stringify(check, null, 2));
  if (!check.matches) continue;
  const card = await dishCard({ photo: `${c.kit}/${m.photo}`, menu: { restaurant: k.menu.restaurant, name: m.name, description: m.description, price: m.price, ai_note: m.ai_note } });
  // Up to two drafts: the second takes Muse's fixes from the first review.
  let motion = check.motion, review = null;
  for (let n = 0; n < 2 && !review?.approved; n++) {
    const video = `${out}/${t}${n ? `-${n}` : ""}.mp4`;
    if (!fs.existsSync(video)) await omni({ start: check.frame, prompt: motion, out: video, ledger, budget });
    review = { ...(await reviewDraft(`${c.kit}/${m.photo}`, video, card, { motion, start: "drawn", cast: `a member of the restaurant's house cast, ${bite ? "taking one real bite" : "pulling it apart so the cheese stretches"}` }, playbook, fs.readFileSync(check.frame))), video, motion };
    console.log(`${t} draft ${n}: ${review.approved ? "approved" : "rejected"}, realism ${review.realism}, craving ${review.craving}. ${[...review.physics_errors, ...review.truth_errors].join("; ")}`);
    if (!review.approved && review.fixes.length) motion = `${check.motion} ${review.fixes.join(" ")}`.slice(0, 900);
  }
  // Yansel judges teeth and cheese himself, so he sees the last draft sharp whether Muse approved it or not.
  const hd = review.video.replace(".mp4", ".hd.mp4");
  if (!fs.existsSync(hd)) await upscale({ video: review.video, out: hd, ledger, budget });
  fs.writeFileSync(`${out}/${t}.json`, JSON.stringify({ pick: c, dish: m.name, restaurant: k.menu.restaurant, review, hd }, null, 2) + "\n");
}
console.log(`ledger total $${spent(ledger).toFixed(2)}`);
