// Lab: a newly studied reference Reel joins the family it belongs to (data/families.json), or starts a new one.
// The catalog grows; how Muse pitches does not change (Yansel, 2 Nov: "estamos dando vueltas en circulo").
// Usage: node --env-file=../.env lab/place.mjs <format name>...   (data/formats/<name>.json, from lab/recipes.mjs)
import fs from "node:fs";
import { ask } from "../src/director.mjs";

const families = JSON.parse(fs.readFileSync("data/families.json", "utf8"));
for (const name of process.argv.slice(2)) {
  if (families.some((f) => f.reels.includes(name))) continue;
  const r = JSON.parse(fs.readFileSync(`data/formats/${name}.json`, "utf8"));
  const v = await ask([{ type: "input_text", text: `A new reference Reel: ${JSON.stringify({ format: r.format, core: r.core, hook: r.hook, people: r.people, why_it_works: r.why_it_works })}
The families of Reels we keep, each the mechanism a viewer would recognize:
${families.map((f) => `- ${f.es_name}: ${f.core}`).join("\n")}
Which family does it belong to? A family is broad: a new dish, place or prop is the same family. Answer "new" only if its mechanism is none of these, and then name it (es_name, in Spanish, 2-4 words) and say its core in one English line.` }],
    "place", { type: "object", additionalProperties: false, required: ["family", "es_name", "core"], properties: {
      family: { type: "string", enum: [...families.map((f) => f.es_name), "new"] }, es_name: { type: "string" }, core: { type: "string" } } });
  if (v.family === "new") families.push({ name: v.es_name, es_name: v.es_name, core: v.core, es_core: "", reels: [name], approved: null });
  else families.find((f) => f.es_name === v.family).reels.push(name);
  console.log(`${name}: ${v.family === "new" ? `new family "${v.es_name}": ${v.core}` : v.family}`);
}
fs.writeFileSync("data/families.json", JSON.stringify(families, null, 2) + "\n");
