// Lab: a restaurant's kit from its ordering platform, with Muse's log of its own photos.
// Usage: node --env-file=../.env lab/kit.mjs <restaurant id> [platform, default doocado]
//   Writes kits/<platform>-<id>/ (menu.json, the dish photos, library/, assets.json), the folder lab/auto.mjs takes.
import { pull } from "../src/kit.mjs";
import { sortAssets } from "../src/assets.mjs";

const [id, platform = "doocado"] = process.argv.slice(2), dir = `kits/${platform}-${id}`;
const { menu, library, skipped } = await pull(+id, dir, platform);
console.log(`${menu.location}: ${menu.items.length} dishes with a real photo (${skipped} without), ${library} library photos -> ${dir}`);
const assets = await sortAssets(dir);
const by = (k) => assets.filter((a) => a.kind === k && a.usable).map((a) => a.label);
console.log(`own place and equipment: ${[...by("equipment"), ...by("kitchen"), ...by("dining_room"), ...by("storefront")].join(", ") || "none yet, the emergency gallery covers it"}`);
