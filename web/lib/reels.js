// What the pages and the API show of a Reel and a job.
import "server-only";
import { db, must, signed, signedMany, publicUrl, linkKey } from "./db";
import { localDate } from "./time";

// A gallery asset: a full url as it is, a bare path from the public gallery bucket.
export const media = (u) => (!u || typeof u !== "string" ? null : /^https?:\/\//.test(u) ? u : publicUrl("gallery", u.replace(/^\/+/, "")));

const pickIndex = (reel) => (Number.isInteger(reel.chosen) && reel.versions?.[reel.chosen] ? reel.chosen : 0);

// The public face of a Reel: the video and cover from the gallery bucket when the director left them there, otherwise
// signed from the private reels bucket.
export async function publicMedia(reels, seconds = 24 * 3600) {
  const need = [];
  for (const r of reels) {
    const g = r.director?.gallery || {}, v = r.versions?.[pickIndex(r)] || {};
    if (!g.video && (v.phone || v.path)) need.push(v.phone || v.path);
    if (!g.cover && r.cover_path) need.push(r.cover_path);
  }
  const urls = await signedMany("reels", need, seconds).catch(() => ({}));
  return reels.map((r) => {
    const g = r.director?.gallery || {}, v = r.versions?.[pickIndex(r)] || {};
    // The restaurant's public name: the director's (src/server/gallery.mjs drops the " - branch"), else its own.
    const place = g.restaurant || r.restaurants?.name || "";
    const city = r.restaurants?.city || "";
    const where = [place, city && !place.toLowerCase().includes(city.toLowerCase()) ? city : ""].filter(Boolean).join(", ");
    // The site is in English: the Reel's name is the gallery's English title, never reels.title (the owner's language).
    const heading = g.idea?.title || "A Reel directed by Muse";
    // The still photos where it all started: every photo of the restaurant's the Reel was made from, hero dish first.
    const seen = new Set();
    const sources = (Array.isArray(g.photos) ? g.photos : []).map((p) => ({ url: media(p?.url), dish: p?.caption || "" }))
      .filter((p) => p.url && !seen.has(p.url) && seen.add(p.url));
    return { ...r, heading, place, where, sources, video: media(g.video) || urls[v.phone || v.path] || null, cover: media(g.cover) || urls[r.cover_path] || null };
  });
}

export async function publicReels(limit = 24) {
  const rows = await must(
    db.from("reels").select("id, seconds, cover_path, versions, chosen, director, created_at, restaurants(name, city, cuisine)")
      .eq("public", true).order("created_at", { ascending: false }).limit(limit),
  );
  return publicMedia(rows);
}

// Every version of an owner's Reel, with fresh signed urls to play (the phone copy) and the k-signed download link.
export async function ownerVersions(reel, seconds = 6 * 3600) {
  const urls = await signedMany("reels", [reel.cover_path, ...(reel.versions || []).map((v) => v.phone || v.path)], seconds).catch(() => ({}));
  const k = linkKey(reel.id);
  return {
    cover: urls[reel.cover_path] || null,
    versions: (reel.versions || []).map((v, i) => ({
      i, register: v.register || "", owner: v.owner || null,
      play: urls[v.phone || v.path] || null,
      download: `/api/download/${reel.id}/${i}?k=${k}`,
    })),
    link: `/r/${reel.id}?k=${k}`,
  };
}

// A version's file name for a download: "sunday-birria-dembow.mp4".
export const fileName = (title, register, i) =>
  `${[title, register || `version-${i + 1}`].filter(Boolean).join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "reel"}.mp4`;

export const signFull = (path, name, seconds = 600) => signed("reels", path, seconds, { download: name });

// "a", "a and b", "a, b and c".
export const andList = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// ---- jobs ------------------------------------------------------------------------------------------------------

export const ACTIVE = ["queued", "running", "waiting_owner"];

// "Make a Reel now": the same job the worker schedules, for today in the restaurant's timezone, picking the next of
// the week's pitches.
export async function queueReelNow(restaurant, { limitPerDay = null } = {}) {
  const week = localDate(restaurant.timezone || "America/New_York");
  const same = await must(db.from("jobs").select("id, status").eq("restaurant_id", restaurant.id).eq("kind", "reel").eq("week", week));
  if (limitPerDay != null) {
    if (same.some((j) => ACTIVE.includes(j.status))) return { error: "Muse is already making a Reel for you. You can ask for another one when it is done." };
    if (same.length >= limitPerDay) return { error: `That's ${same.length} Reels today. Muse will be ready for more tomorrow.` };
  }
  const [job] = await must(db.from("jobs").insert({ restaurant_id: restaurant.id, kind: "reel", week, input: { pick: same.length, now: true } }).select("*"));
  return { job };
}

// Dishes are numbered 1, 2, 3... per restaurant: the pipeline needs numeric dish ids.
export async function nextDishNumber(restaurantId) {
  const rows = await must(db.from("dishes").select("external_id").eq("restaurant_id", restaurantId));
  return rows.reduce((m, r) => (/^\d+$/.test(r.external_id || "") ? Math.max(m, +r.external_id) : m), 0) + 1;
}

export const jobView = (j) => ({
  id: j.id, kind: j.input?.equipment ? "equipment" : j.kind, status: j.status, week: j.week,
  questions: (j.state?.questions || []).map((q) => ({ ask: q.ask, options: q.options || [] })).filter((q) => q.ask),
  error: j.status === "failed" ? j.error || null : null,
  url: j.input?.url || null,
  created_at: j.created_at, updated_at: j.updated_at,
});
