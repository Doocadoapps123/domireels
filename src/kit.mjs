// The kit: everything one restaurant gives Domi Reels, from whatever ordering platform it already uses.
// Contract (docs/CONTRACT.md), domi-reels/kit@1:
//   { restaurant: {id, name, cuisine, language, city, logo, brand_color},
//     menu: [{id, name, description, price, photo (url, or "" when the menu has none), ai_note, addons: [{group, required, options}]}],
//     library: [{id, photo (url), product_id, dish, kind}] }   the restaurant's own photos, as the owner sent them
// pull() asks the platform for it and lays it out as the folder the rest of the pipeline reads:
//   menu.json + <id>.jpg   every dish with a real photo (src/menu.mjs); a dish the menu has no photo of
//                          takes the owner's library photo of it
//   library/<id>.jpg       the restaurant's own photos; Muse sorts them in src/assets.mjs
//   logo.png, kit.json
import fs from "node:fs";
import sharp from "sharp";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
// One entry per platform that speaks the contract. Its url and token live in the environment, never in the repo.
const PLATFORMS = { doocado: () => ({ url: process.env.DOOCADO_KIT_URL, token: process.env.DOOCADO_REELS_TOKEN }) };

export async function fetchKit(restaurantId, platform = "doocado") {
  const p = PLATFORMS[platform]?.();
  if (!p?.url || !p.token) throw new Error(`${platform}: no kit url or token in the environment`);
  const res = await fetch(p.url, { method: "POST", headers: { "x-reels-token": p.token, "Content-Type": "application/json" }, body: JSON.stringify({ restaurant_id: restaurantId }) });
  const kit = await res.json();
  if (!res.ok) throw new Error(`${platform} kit ${res.status}: ${kit.error}`);
  if (kit.contract !== "domi-reels/kit@1") throw new Error(`${platform} answered contract ${kit.contract}`);
  return kit;
}

async function download(url, file, png = false) {
  if (fs.existsSync(file)) return true;
  const res = await fetch(url, { headers: { "User-Agent": UA } }).catch(() => null);
  if (!res?.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  try { await (png ? sharp(buf).png() : sharp(buf).rotate().jpeg({ quality: 94 })).toFile(file); return true; }
  catch { return false; }
}
async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); }));
}
const words = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split("/")[0].replace(/[^a-z0-9]+/g, " ").trim();

export async function pull(restaurantId, dir, platform = "doocado") {
  return layoutKit(await fetchKit(restaurantId, platform), dir);
}

// Lays a kit out as the folder the pipeline reads, however it arrived: pulled from a platform, or built by the server
// from what an owner gave Domi Reels directly (src/server/kits.mjs).
export async function layoutKit(kit, dir) {
  const r = kit.restaurant;
  fs.mkdirSync(`${dir}/library`, { recursive: true });
  fs.writeFileSync(`${dir}/kit.json`, JSON.stringify(kit, null, 2) + "\n");
  if (r.logo) await download(r.logo, `${dir}/logo.png`, true);
  await pool(kit.library, 6, async (l) => { l.ok = await download(l.photo, `${dir}/library/${l.id}.jpg`); });
  const mine = (m) => kit.library.filter((l) => l.ok && (l.product_id === m.id || (l.dish && words(l.dish) === words(m.name))));
  // Photos keep changing: a dish whose menu photo has a new url is downloaded again (the old file goes to old/).
  const before = fs.existsSync(`${dir}/menu.json`) ? Object.fromEntries(JSON.parse(fs.readFileSync(`${dir}/menu.json`, "utf8")).items.map((m) => [m.id, m.photo_url])) : {};
  const items = [];
  await pool(kit.menu, 6, async (m) => {
    const file = `${dir}/${m.id}.jpg`, own = mine(m), lib = !m.photo && own[0];
    // photo_key: a stable name for a photo whose url changes on every call (a signed url from Domi Reels' own storage).
    const key = m.photo_key || m.photo;
    if (m.photo && before[m.id] !== key && fs.existsSync(file)) {
      fs.mkdirSync(`${dir}/old`, { recursive: true });
      fs.renameSync(file, `${dir}/old/${m.id}-${Date.now()}.jpg`);
    }
    if (lib) fs.copyFileSync(`${dir}/library/${lib.id}.jpg`, file);
    else if (!m.photo || !(await download(m.photo, file))) return;
    // Every other photo the owner sent of this dish is an alternative; src/menu.mjs plays the best rated one.
    const alts = own.filter((l) => l !== lib).map((l) => `library/${l.id}.jpg`);
    items.push({ id: m.id, name: m.name, description: m.description, price: m.price, photo: `${m.id}.jpg`, photo_url: key || "", ai_note: m.ai_note,
      ...(m.addons?.length ? { addons: m.addons } : {}),
      ...(lib ? { from_library: lib.id } : {}), ...(alts.length ? { alts } : {}) });
  });
  items.sort((a, b) => a.id - b.id);
  // The brand is what the feed knows ("Pikalo"); the location stays for the owner.
  const menu = { restaurant: r.name.split(" - ")[0].trim(), location: r.name, cuisine: r.cuisine || "restaurant", language: r.language, city: r.city,
    platform: kit.platform, restaurant_id: r.id, brand_color: r.brand_color, logo: fs.existsSync(`${dir}/logo.png`) ? "logo.png" : "", items };
  fs.writeFileSync(`${dir}/menu.json`, JSON.stringify(menu, null, 2) + "\n");
  return { menu, library: kit.library.filter((l) => l.ok).length, skipped: kit.menu.length - items.length };
}
