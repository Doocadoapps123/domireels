// Lab: Muse groups every studied Reel (data/formats/) into families by its core idea (src/families.mjs).
// Usage: node --env-file=../.env lab/families.mjs [--again]
//   Writes data/families.json with approved: null on each family; Yansel's yes or no goes there by hand.
//   It refuses to regroup once a family has his answer, unless --again.
import fs from "node:fs";
import { groupFamilies } from "../src/families.mjs";

const file = "data/families.json", old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
if (old.some((f) => f.approved !== null) && !process.argv.includes("--again")) throw new Error("families already reviewed by Yansel; pass --again to regroup");
const families = await groupFamilies();
fs.writeFileSync(file, JSON.stringify(families, null, 2) + "\n");
for (const f of families) console.log(`${f.es_name} (${f.reels.length}): ${f.reels.join(", ")}\n  ${f.es_core}\n  Hacemos: ${f.es_can}\n  Cámara: ${f.es_camera}`);
