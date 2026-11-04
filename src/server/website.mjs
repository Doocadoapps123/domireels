// An owner who signs up directly gives its website, not a menu file. Muse reads the site (the home page and the pages
// that look like its menu) and writes down the dishes with their photos; the photos land in our storage and every dish
// gets a numeric id (the pipeline's menu numbers). Dishes already there are kept: only new ones are added.
import crypto from "node:crypto";
import sharp from "sharp";
import { ask } from "../director.mjs";
import { db, must, upload } from "./db.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const get = async (url) => { const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r; };
const abs = (u, base) => { try { return new URL(u.replace(/&amp;/g, "&"), base).href; } catch { return null; } };

// The page as Muse reads it: its text, and every image with what the page says about it.
function read(html, base) {
  const images = new Map();
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = tag.match(/\b(?:data-src|src)=["']([^"']+)["']/i)?.[1], set = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    const best = set ? set.split(",").map((x) => x.trim().split(/\s+/)).sort((a, b) => parseInt(b[1] || 0) - parseInt(a[1] || 0))[0]?.[0] : src;
    const url = best && abs(best, base), alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] || "";
    if (url && !/\.svg|logo|icon|sprite|favicon/i.test(url)) images.set(url, alt);
  }
  for (const [, u] of html.matchAll(/"image"\s*:\s*"([^"]+)"/g)) { const url = abs(u, base); if (url) images.set(url, images.get(url) || ""); }
  const text = html.replace(/<script\b[\s\S]*?<\/script>/gi, (s) => (/ld\+json/i.test(s) ? s.replace(/<[^>]+>/g, " ") : " ")).replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(([, h, t]) => ({ url: abs(h, base), text: t.replace(/<[^>]+>/g, "").trim() })).filter((l) => l.url?.startsWith("http"));
  return { text, images: [...images].map(([url, alt]) => ({ url, alt })), links };
}

const MENU = {
  type: "object", additionalProperties: false, required: ["restaurant", "dishes"],
  properties: {
    restaurant: { type: "object", additionalProperties: false, required: ["cuisine", "city"], properties: { cuisine: { type: "string" }, city: { type: "string" } } },
    dishes: {
      type: "array", items: {
        type: "object", additionalProperties: false, required: ["name", "description", "price", "image"],
        properties: {
          name: { type: "string" }, description: { type: "string" }, price: { type: "number", description: "0 if the site does not say." },
          image: { type: "string", description: "The url of this dish's own photo from the IMAGES list, exactly as written; empty if it has none. Never a photo of another dish, a logo, a person or a banner." },
        },
      },
    },
  },
};

export async function importWebsite(r, url) {
  const home = await (await get(url)).text(), pages = [{ url, ...read(home, url) }];
  const menuLinks = pages[0].links.filter((l) => /menu|order|food|carta|platos/i.test(`${l.url} ${l.text}`) && new URL(l.url).host === new URL(url).host);
  for (const l of [...new Map(menuLinks.map((x) => [x.url, x])).values()].slice(0, 3)) {
    try { pages.push({ url: l.url, ...read(await (await get(l.url)).text(), l.url) }); } catch {}
  }
  const images = [...new Map(pages.flatMap((p) => p.images).map((i) => [i.url, i])).values()].slice(0, 200);
  const text = pages.map((p) => `PAGE ${p.url}\n${p.text.slice(0, 18000)}`).join("\n\n").slice(0, 50000);
  const found = await ask([{ type: "input_text", text: `This is a restaurant's website (${r.name}). Write down its menu: every dish or drink it sells, with its description and price as the site gives them, and its own photo when the site has one. Only what the site says; nothing invented. At most 60 items, the ones with photos first.\n\n${text}\n\nIMAGES (url | alt text):\n${images.map((i) => `${i.url} | ${i.alt}`).join("\n")}` }], "menu", MENU);

  const have = await must(db.from("dishes").select("name, external_id").eq("restaurant_id", r.id));
  const names = new Set(have.map((d) => d.name.toLowerCase()));
  let next = Math.max(0, ...have.map((d) => +d.external_id || 0)) + 1, added = 0, photos = 0;
  for (const d of found.dishes.filter((x) => x.name && !names.has(x.name.toLowerCase()))) {
    let photo_path = null;
    if (d.image && images.some((i) => i.url === d.image)) {
      try {
        const buf = Buffer.from(await (await get(d.image)).arrayBuffer()), meta = await sharp(buf).metadata();
        if (Math.min(meta.width, meta.height) >= 300) {
          const jpg = await sharp(buf).rotate().jpeg({ quality: 92 }).toBuffer(), sha1 = crypto.createHash("sha1").update(jpg).digest("hex");
          photo_path = await upload("photos", `${r.id}/menu/${sha1}.jpg`, jpg, "image/jpeg");
          await db.from("photos").insert({ restaurant_id: r.id, path: photo_path, source: "menu", kind: "food", label: d.name, sha1 });
          photos++;
        }
      } catch {}
    }
    await must(db.from("dishes").insert({ restaurant_id: r.id, external_id: String(next++), name: d.name, description: d.description || null, price: d.price || null, photo_path, photo_url: d.image || null }));
    names.add(d.name.toLowerCase());
    added++;
  }
  const patch = {};
  if (!r.cuisine && found.restaurant.cuisine) patch.cuisine = found.restaurant.cuisine;
  if (!r.city && found.restaurant.city) patch.city = found.restaurant.city;
  if (!r.website) patch.website = url;
  if (Object.keys(patch).length) await must(db.from("restaurants").update(patch).eq("id", r.id));
  return { added, photos, pages: pages.length };
}
