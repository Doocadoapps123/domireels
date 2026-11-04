// What an owner or a platform may write about a restaurant, checked the same way everywhere.
import { validTimezone } from "./time";

const str = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);
const int = (v, lo, hi) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
};

export function normalizeUrl(u) {
  const s = String(u || "").trim();
  if (!s) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return undefined;
    const out = url.toString();
    return url.pathname === "/" && !url.search && !url.hash ? out.replace(/\/$/, "") : out;
  } catch { return undefined; }
}

// Only the fields present in b; returns { values } or { error }.
export function restaurantFields(b, allowed) {
  const v = {};
  const has = (k) => allowed.includes(k) && Object.prototype.hasOwnProperty.call(b, k);
  if (has("name")) { v.name = str(b.name, 120); if (!v.name) return { error: "The restaurant needs a name." }; }
  if (has("cuisine")) v.cuisine = str(b.cuisine, 120);
  if (has("city")) v.city = str(b.city, 120);
  if (has("language")) { if (!["en", "es"].includes(b.language)) return { error: "language must be en or es." }; v.language = b.language; }
  if (has("website")) { const u = normalizeUrl(b.website); if (u === undefined) return { error: "That website address does not look right." }; v.website = u; }
  if (has("timezone")) { if (!validTimezone(b.timezone)) return { error: "timezone must be an IANA timezone, like America/New_York." }; v.timezone = b.timezone; }
  if (has("delivery_day")) { v.delivery_day = int(b.delivery_day, 0, 6); if (v.delivery_day === undefined) return { error: "delivery_day must be 0 (Sunday) to 6 (Saturday)." }; }
  if (has("delivery_hour")) { v.delivery_hour = int(b.delivery_hour, 0, 23); if (v.delivery_hour === undefined) return { error: "delivery_hour must be 0 to 23." }; }
  if (has("reels_per_week")) { v.reels_per_week = int(b.reels_per_week, 0, 3); if (v.reels_per_week === undefined) return { error: "reels_per_week must be 0 to 3." }; }
  if (has("music_options")) { v.music_options = int(b.music_options, 1, 3); if (v.music_options === undefined) return { error: "music_options must be 1 to 3." }; }
  return { values: v };
}

export const dishFields = (b) => {
  const v = {};
  if ("name" in b) { v.name = str(b.name, 120); if (!v.name) return { error: "The dish needs a name." }; }
  if ("description" in b) v.description = str(b.description, 1500);
  if ("ai_note" in b) v.ai_note = str(b.ai_note, 1500);
  if ("price" in b) {
    const p = b.price === "" || b.price == null ? null : Number(String(b.price).replace(/[^0-9.]/g, ""));
    if (p !== null && (!Number.isFinite(p) || p < 0 || p > 100000)) return { error: "That price does not look right." };
    v.price = p === null ? null : Math.round(p * 100) / 100;
  }
  if ("active" in b) v.active = !!b.active;
  return { values: v };
};
