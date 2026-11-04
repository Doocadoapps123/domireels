// Lab: everything before the owner's yes, for several restaurants at once, with no paid video.
// Usage: node --env-file=../.env lab/prep.mjs <restaurant id> [...]
//   kit (src/kit.mjs) -> Muse logs the own photos (src/assets.mjs) -> the house cast (src/cast.mjs) -> Muse pitches
//   the next Reel from the whole menu and a blind Muse judge ranks it (src/menu.mjs). The pitch waits in kits/<..>/pitch.json.
import fs from "node:fs";
import { pull } from "../src/kit.mjs";
import { sortAssets } from "../src/assets.mjs";
import { castFor, portrait, castElsewhere } from "../src/cast.mjs";
import { menuPitch } from "../src/menu.mjs";

for (const id of process.argv.slice(2)) {
  const dir = `kits/doocado-${id}`;
  try {
    const { menu } = await pull(+id, dir);
    if (menu.items.length < 3) { console.log(`${menu.location}: only ${menu.items.length} dish photos, skipped`); continue; }
    await sortAssets(dir);
    if (menu.logo) { const cast = await castFor(dir); await Promise.all(cast.people.map((p) => portrait(dir, cast, p, castElsewhere(dir)))); }
    if (!fs.existsSync(`${dir}/pitch.json`)) fs.writeFileSync(`${dir}/pitch.json`, JSON.stringify(await menuPitch(dir), null, 2) + "\n");
    const top = JSON.parse(fs.readFileSync(`${dir}/pitch.json`, "utf8")).slice(0, 3);
    console.log(`\n## ${menu.location}\n${top.map((c, i) => `${i}. ${c.title} (${c.total}/50) [${c.cast}]${c.muse.repeats ? ` REPITE: ${c.muse.repeats}` : ""}\n   ${c.idea}`).join("\n")}`);
  } catch (e) { console.log(`${id}: ${e.message}`); }
}
