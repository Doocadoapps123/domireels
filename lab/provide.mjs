// Lab: what Domi Reels provides a restaurant that has no assets of its own (src/server/equipment.mjs, kits.mjs).
//   equipment <restaurant id>            Muse finds or makes the equipment its best dishes are cooked on
//   place <restaurant id> <photo...>     the restaurant's own photos of its place (its Instagram or site, never a
//                                        customer's photo from Google), as its library
import fs from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";
import { db, must, upload } from "../src/server/db.mjs";
import { kitDir, kitFor } from "../src/server/kits.mjs";
import { layoutKit } from "../src/kit.mjs";
import { sortAssets } from "../src/assets.mjs";
import { ensureEquipment } from "../src/server/equipment.mjs";

const [what, rid, ...files] = process.argv.slice(2);
const [r] = await must(db.from("restaurants").select("*, accounts(*)").eq("id", rid));
const dir = kitDir(r, r.accounts);
if (what === "place") for (const f of files) {
  const jpg = await sharp(f).rotate().resize({ width: 1440, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const sha1 = crypto.createHash("sha1").update(jpg).digest("hex"), path = await upload("photos", `${r.id}/provided/${sha1}.jpg`, jpg, "image/jpeg");
  await must(db.from("photos").upsert({ restaurant_id: r.id, path, source: "library", kind: "place", label: `${f.split("/").pop()} (the restaurant's own, from its Instagram)`, sha1 }, { onConflict: "restaurant_id,sha1" }));
  console.log(`place: ${f}`);
}
await layoutKit(await kitFor(r, r.accounts), dir);
await sortAssets(dir);
if (what === "equipment") console.log(JSON.stringify(await ensureEquipment(dir, { restaurantId: r.id })));
const own = JSON.parse(fs.readFileSync(`${dir}/assets.json`, "utf8")).filter((a) => a.usable && a.kind !== "dish");
console.log(`${r.name}: ${own.map((a) => `${a.kind}: ${a.label}`).join("; ") || "nothing of its own yet"}`);
