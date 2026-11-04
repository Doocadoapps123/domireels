// Lab: one guest shot, a member of the house cast modeling the restaurant's real dish (they never eat on camera).
// Usage: node --env-file=../.env lab/guest.mjs <kit dir> <cast name> <menu id> [spend cap in dollars, 0 = frame only]
import fs from "node:fs";
import { guestFrame, checkGuest } from "../src/cast.mjs";
import { dishCard } from "../src/dish.mjs";
import { reviewDraft, loadPlaybook } from "../src/director.mjs";
import { omni, spent } from "../src/video.mjs";

const [dir, who, id, spend = "0"] = process.argv.slice(2), out = `${dir}/guest`;
fs.mkdirSync(out, { recursive: true });
const menu = JSON.parse(fs.readFileSync(`${dir}/menu.json`, "utf8")), cast = JSON.parse(fs.readFileSync(`${dir}/cast.json`, "utf8"));
const p = cast.people.find((x) => x.name === who), m = menu.items.find((x) => x.id === +id);
const face = fs.readFileSync(`${dir}/cast/${who}.jpg`), dish = fs.readFileSync(`${dir}/${m.photo}`), base = `${out}/${who}-${id}`;
const where = "On a city sidewalk, daytime, the food in its takeout box.", action = `${who}, ${where.toLowerCase()} Shows the ${m.name} to the camera with a natural smile.`;
let check = fs.existsSync(`${base}.check.json`) ? JSON.parse(fs.readFileSync(`${base}.check.json`, "utf8")) : null;
for (let k = 0; k < 2 && !check?.matches; k++) {
  const frame = await guestFrame([face], dish, [p], `the ${m.name}`, where);
  fs.writeFileSync(`${base}-${k}.jpg`, frame);
  check = { ...(await checkGuest([face], dish, frame, [p], action)), frame: `${base}-${k}.jpg` };
  console.log(`frame ${k}: ${check.matches ? "matches" : "no"} (${check.score}) ${check.problems.join("; ")}`);
}
fs.writeFileSync(`${base}.check.json`, JSON.stringify(check, null, 2));
if (!check.matches || !+spend) process.exit(0);
const ledger = "lab/out/ledger.jsonl", video = `${base}.mp4`;
await omni({ start: check.frame, prompt: check.motion, out: video, budget: spent(ledger) + +spend });
const card = await dishCard({ photo: `${dir}/${m.photo}`, menu: { restaurant: menu.restaurant, name: m.name, description: m.description, price: m.price, ai_note: m.ai_note } });
const review = await reviewDraft(`${dir}/${m.photo}`, video, card, { motion: check.motion, start: "drawn", cast: "a member of the restaurant's house cast, as a model showing it" }, loadPlaybook(), fs.readFileSync(check.frame));
fs.writeFileSync(`${base}.review.json`, JSON.stringify(review, null, 2));
console.log(`${video}: ${review.approved ? "approved" : "rejected"}, craving ${review.craving}, realism ${review.realism}\n${JSON.stringify(review, null, 2)}`);
