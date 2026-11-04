// Lab: a restaurant's house cast (its models), designed by Muse Spark, drawn by Muse Image and checked by Muse.
// Usage: node --env-file=../.env lab/cast.mjs <kit dir> [how many, default 4] [--recheck]
import fs from "node:fs";
import { castFor, portrait, checkPortrait, castElsewhere } from "../src/cast.mjs";

const [dir, n = "4"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const cast = await castFor(dir, +n);
await Promise.all(cast.people.map(async (p) => {
  // --recheck: Muse looks again at a portrait already drawn; one that fails is set aside in old/ and drawn again.
  const file = `${dir}/cast/${p.name}.jpg`;
  if (process.argv.includes("--recheck") && fs.existsSync(file)) {
    const c = await checkPortrait(dir, p, fs.readFileSync(file));
    if (!c.ok) { fs.mkdirSync(`${dir}/old`, { recursive: true }); fs.renameSync(file, `${dir}/old/${p.name}-${Date.now()}.jpg`); console.log(`  ${p.name} again: ${c.problems.join("; ")}`); }
  }
  // Faces it must not repeat: everyone at the other restaurants (its own cast is drawn at the same time).
  await portrait(dir, cast, p, castElsewhere(dir));
  console.log(`${p.name}, ${p.age}, ${p.sex}, ${p.outfit}: ${p.look}. ${p.wears} -> ${dir}/cast/${p.name}.jpg`);
}));
