// "If they have no photo of their equipment, we find one and it is theirs alone" (Yansel, 4 Nov), and "esos restaurantes
// no pueden estar sin assets. Nosotros tenemos que proveerlos si ellos no lo proveen". Before a week is planned, Muse
// checks where this restaurant's best dishes are really cooked (src/inventory.mjs, station) and whether it has that
// equipment: its own photo, or free footage nobody else holds. When it has neither, Muse searches free stock (Mixkit,
// commercial use, src/stock.mjs grow) and judges each clip; when that finds nothing either, Muse makes a photo of that
// equipment for this restaurant alone with Muse Image and checks it reads as a real phone photo of a kitchen. Only the
// equipment is made: the food put on it is always the restaurant's own photo, and the place is never made.
import fs from "node:fs";
import crypto from "node:crypto";
import { inventory } from "../inventory.mjs";
import { ownStock, sortAssets } from "../assets.mjs";
import { owners, groupOf, grow } from "../stock.mjs";
import { readMenu, photoScores } from "../menu.mjs";
import { ask, img } from "../director.mjs";
import { db, must, upload } from "./db.mjs";

// Mixkit tag pages worth searching for each station, best first.
const TAGS = {
  fryer: ["deep-fryer", "frying", "french-fries", "fried-chicken"],
  plancha: ["griddle", "burger", "grill"],
  grill: ["grill", "barbecue", "steak"],
  oven: ["pizza-oven", "oven", "bakery"],
  wok: ["wok", "stir-fry"],
  pot: ["soup", "boiling", "cooking"],
  blender: ["smoothie", "blender"],
  espresso: ["espresso", "coffee-machine", "barista"],
};
export const WORDS = { fryer: /fr(y|ie)/i, plancha: /plancha|griddle|flat.?top/i, grill: /grill|barbecue|bbq/i, oven: /oven/i, wok: /wok|stir/i, pot: /pot|boil|soup|simmer/i, blender: /blend|smoothie/i, espresso: /espresso|coffee/i };

// What each station looks like empty, as a phone photo from where a cook stands.
const LOOKS = {
  fryer: "a stainless steel commercial deep fryer, its wire basket half lowered into hot oil with small bubbles, seen from just above at an angle, close",
  plancha: "a commercial flat-top griddle (plancha) of seasoned dark steel with a thin sheen of oil and a little smoke, a metal spatula resting at its edge, seen from above at an angle, close",
  grill: "a commercial char-grill with hot black grates and a glow underneath, seen from above at an angle, close",
  oven: "a commercial deck oven with its door open, the hot stone or rack inside empty and glowing, seen from the front, close",
  wok: "a black carbon-steel wok on a high gas flame in a restaurant kitchen, empty with a sheen of oil, seen from above at an angle",
  pot: "a large stainless stock pot simmering on a restaurant range, steam rising, seen from above at an angle",
  blender: "a commercial blender on a stainless counter, empty, seen from the side, close",
  espresso: "a commercial espresso machine with a portafilter locked in, a steam wand, seen from the front, close",
};
const MADE = {
  type: "object", additionalProperties: false, required: ["real", "food", "people", "logos", "problems"],
  properties: {
    real: { type: "integer", description: "0-10: would a viewer take it for a phone photo of a real restaurant kitchen?" },
    food: { type: "boolean", description: "Any food in it." }, people: { type: "boolean", description: "Any person, hand or face." },
    logos: { type: "boolean", description: "Any logo, brand or readable text." }, problems: { type: "array", items: { type: "string" } },
  },
};

async function makeEquipment(st, menu) {
  const prompt = `Phone photo taken by a cook in the kitchen of ${menu.restaurant.split(" - ")[0]}, a small ${menu.cuisine || ""} restaurant${menu.city ? ` in ${menu.city}` : ""}: ${LOOKS[st]}. Real used equipment, slightly worn steel, ordinary kitchen light, natural phone photo, not a studio shot. Nothing on it: no food, no people, no hands, no logos, no text.`;
  for (let t = 0; t < 2; t++) {
    const res = await fetch("https://api.meta.ai/v1/images/generations", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.META_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "muse-image-1.0", prompt, size: "1080x1920", output_format: "jpeg", n: 1 }),
    });
    if (!res.ok) throw new Error(`muse-image ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const jpg = Buffer.from((await res.json()).data[0].b64_json, "base64");
    const c = await ask([{ type: "input_text", text: `This photo will stand in a restaurant's Reel as its ${st}, with the restaurant's real food put on it later. Judge it as a viewer on Instagram.` }, await img(jpg)], "made_equipment", MADE);
    if (c.real >= 7 && !c.food && !c.people && !c.logos) return jpg;
    console.log(`${st}: Muse's ${st} is not good enough (${c.real}/10${c.problems.length ? `: ${c.problems.join("; ")}` : ""}), again`);
  }
  return null;
}

// only: the stations the owner marked at sign-up (web onboarding). Then the menu is not read: their equipment is ready
// before any Reel is asked for, and a Reel never waits on it (Yansel, 4 Nov).
export async function ensureEquipment(dir, { restaurantId, only } = {}) {
  if (!only) await photoScores(dir);
  const menu = readMenu(dir), restaurant = menu.restaurant, own = ownStock(dir), taken = owners();
  const inv = only ? [] : await inventory(dir);
  const stations = only ? only.filter((s) => TAGS[s]) : [...new Set(inv.filter((d) => d.score >= 7).map((d) => d.station).filter((s) => TAGS[s]))];
  const found = [], made = [];
  const free = () => JSON.parse(fs.readFileSync("data/stock.json", "utf8")).filter((c) => !taken[groupOf(c)] || taken[groupOf(c)] === restaurant);
  for (const st of stations) {
    const has = (o) => o.some((a) => WORDS[st].test(`${a.label || ""} ${a.what || ""} ${a.name || ""} ${a.group || ""}`));
    if (has(own) || has(free())) continue;
    console.log(`${restaurant}: no ${st} of its own and none free; Muse searches for one`);
    const before = JSON.parse(fs.readFileSync("data/stock.json", "utf8")).length;
    await grow(TAGS[st], { per: 4 }).catch((e) => console.log(`${st}: search failed (${e.message})`));
    found.push(...JSON.parse(fs.readFileSync("data/stock.json", "utf8")).slice(before).map((c) => c.name));
    if (has(free()) || !restaurantId) continue;
    // Nothing real to be had: Muse makes this restaurant's own.
    const jpg = await makeEquipment(st, menu).catch((e) => (console.log(`${st}: not made (${e.message})`), null));
    if (!jpg) continue;
    const sha1 = crypto.createHash("sha1").update(jpg).digest("hex"), path = await upload("photos", `${restaurantId}/provided/${sha1}.jpg`, jpg, "image/jpeg");
    const [row] = await must(db.from("photos").upsert({ restaurant_id: restaurantId, path, source: "stock", kind: "equipment", label: `${st} (made by Muse for this restaurant)`, sha1 }, { onConflict: "restaurant_id,sha1" }).select());
    // Into this kit now, so the week planned next can use it; the next kit from the platform carries it too (kits.mjs).
    fs.mkdirSync(`${dir}/library`, { recursive: true });
    fs.writeFileSync(`${dir}/library/${row.id}.jpg`, jpg);
    const kit = JSON.parse(fs.readFileSync(`${dir}/kit.json`, "utf8"));
    kit.library = [...(kit.library || []).filter((l) => l.id !== row.id), { id: row.id, photo: "", product_id: null, dish: row.label, kind: "equipment" }];
    fs.writeFileSync(`${dir}/kit.json`, JSON.stringify(kit, null, 2) + "\n");
    made.push(st);
  }
  if (made.length) await sortAssets(dir);
  return { stations, found, made };
}
