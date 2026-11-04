// A restaurant's kit (docs/CONTRACT.md, domi-reels/kit@1), wherever it lives: an ordering platform answers it from
// its own kit url; an owner who deals with Domi Reels directly has it in our tables (dishes and photos).
import { db, must, signed } from "./db.mjs";
import { WORDS } from "./equipment.mjs";

const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The folder the pipeline reads. A platform's restaurant keeps its platform's name and id (kits/doocado-22), so a
// restaurant that came through Doocado keeps its history of Reels.
export const kitDir = (r, account) => (account.kind === "platform" ? `kits/${slug(account.name)}-${r.external_id}` : `kits/r-${r.id.slice(0, 8)}`);

export async function kitFor(r, account) {
  if (account.kind === "platform") {
    const res = await fetch(account.kit_url, {
      method: "POST", headers: { "x-reels-token": account.platform_token, "Content-Type": "application/json" },
      body: JSON.stringify({ restaurant_id: /^\d+$/.test(r.external_id) ? +r.external_id : r.external_id }),
    });
    const kit = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${account.name} kit ${res.status}: ${kit.error || ""}`);
    if (kit.contract !== "domi-reels/kit@1") throw new Error(`${account.name} answered contract ${kit.contract}`);
    // What Domi Reels provides when the platform has none (Yansel, 4 Nov: "esos restaurantes no pueden estar sin assets"):
    // the restaurant's own place photos from its Instagram or site, and the equipment Muse made for it alone.
    const provided = await must(db.from("photos").select("*").eq("restaurant_id", r.id).in("source", ["library", "stock"]));
    kit.library = [...(kit.library || []), ...(await Promise.all(provided.map(async (p) => ({ id: p.id, photo: await signed("photos", p.path, 3 * 3600), product_id: null, dish: p.label || "", kind: p.kind || "" }))))];
    return kit;
  }
  const dishes = await must(db.from("dishes").select("*").eq("restaurant_id", r.id).eq("active", true));
  // The provisional equipment Muse made (source stock) goes in until the owner sends a photo of their own of it.
  const all = await must(db.from("photos").select("*").eq("restaurant_id", r.id).in("source", ["whatsapp", "upload", "library", "stock"]));
  const st = (p) => Object.keys(WORDS).find((k) => WORDS[k].test(p.label || ""));
  const ownSt = new Set(all.filter((p) => p.source !== "stock" && p.kind === "equipment").map(st).filter(Boolean));
  const photos = all.filter((p) => p.source !== "stock" || !ownSt.has(st(p)));
  const num = (id) => +dishes.find((d) => d.id === id)?.external_id || null;
  return {
    contract: "domi-reels/kit@1", platform: "domi",
    restaurant: { id: r.id, name: r.name, cuisine: r.cuisine || "restaurant", language: r.language, city: r.city || "", logo: r.logo_url || "", brand_color: r.brand_color || "" },
    menu: await Promise.all(dishes.map(async (d) => ({
      id: +d.external_id, name: d.name, description: d.description || "", price: +d.price || 0,
      photo: d.photo_path ? await signed("photos", d.photo_path, 3 * 3600) : "", photo_key: d.photo_path || "",
      ai_note: d.ai_note || "", addons: d.addons || [],
    }))),
    library: await Promise.all(photos.map(async (p) => ({ id: p.id, photo: await signed("photos", p.path, 3 * 3600), product_id: num(p.dish_id), dish: p.label || "", kind: p.kind || "food" }))),
  };
}
