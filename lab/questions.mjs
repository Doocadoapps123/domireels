// Lab: Muse's questions for the owner on the top ideas of each pitch, asked before the owner picks one,
// so one answer round covers the whole shoot. Free: only Muse Spark reads the hero photos.
// Usage: node --env-file=../.env lab/questions.mjs <kit dir> [how many ideas, default 4]
//   Saves lab/out/auto/<kit>-<n>/questions.json, or card.json when Muse has nothing to ask; lab/auto.mjs picks up from there.
import fs from "node:fs";
import path from "node:path";
import { dishCard } from "../src/dish.mjs";

const [dir, n = "4"] = process.argv.slice(2), menu = JSON.parse(fs.readFileSync(`${dir}/menu.json`, "utf8"));
const pitch = JSON.parse(fs.readFileSync(`${dir}/pitch.json`, "utf8")).slice(0, +n);
await Promise.all(pitch.map(async (c, i) => {
  const run = `lab/out/auto/${path.basename(dir)}-${i}`, hero = menu.items.find((m) => m.id === c.dishes[0]);
  if (fs.existsSync(`${run}/questions.json`) || fs.existsSync(`${run}/card.json`)) return;
  fs.mkdirSync(run, { recursive: true });
  const card = await dishCard({ photo: `${dir}/${hero.photo}`, menu: { restaurant: menu.restaurant, name: hero.name, description: hero.description, price: hero.price, ai_note: hero.ai_note || "" } });
  if (card.questions.length) fs.writeFileSync(`${run}/questions.json`, JSON.stringify(card.questions, null, 2) + "\n");
  else fs.writeFileSync(`${run}/card.json`, JSON.stringify(card, null, 2) + "\n");
  console.log(`${menu.restaurant} ${i} (${hero.name}): ${card.questions.length ? card.questions.map((q) => q.ask).join(" | ") : "no questions"}`);
}));
