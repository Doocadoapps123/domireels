// The shapes the platform API answers with (docs at /docs).
import "server-only";
import { db, must, signedMany } from "./db";

export const restaurantView = (r) => ({
  external_id: r.external_id, name: r.name, cuisine: r.cuisine, city: r.city, language: r.language, timezone: r.timezone,
  delivery_day: r.delivery_day, delivery_hour: r.delivery_hour, reels_per_week: r.reels_per_week, active: r.active, created_at: r.created_at,
});

export async function findRestaurant(account, externalId) {
  const [r] = await must(db.from("restaurants").select("*").eq("account_id", account.id).eq("external_id", externalId).limit(1));
  return r || null;
}

export const jobOut = (j, externalId, reelId = null) => ({
  id: j.id, restaurant: externalId, kind: j.kind, status: j.status, week: j.week,
  questions: (j.state?.questions || []).map((q) => q.ask).filter(Boolean),
  error: j.status === "failed" ? j.error || null : null, reel_id: reelId,
  created_at: j.created_at, updated_at: j.updated_at,
});

// Reels with fresh signed urls (valid one hour).
export async function reelsOut(rows, externalIdOf, seconds = 3600) {
  const paths = rows.flatMap((r) => [r.cover_path, ...(r.versions || []).flatMap((v) => [v.path, v.phone])]);
  const urls = await signedMany("reels", paths, seconds);
  const expires = new Date(Date.now() + seconds * 1000).toISOString();
  const site = process.env.DR_PUBLIC_URL || "";
  return rows.map((r) => ({
    id: r.id, restaurant: externalIdOf(r.restaurant_id), job_id: r.job_id, title: r.title, idea: r.idea, kind: r.kind,
    dishes: r.dishes || [], seconds: r.seconds,
    status: r.delivered_at ? "delivered" : "ready",
    deliver_at: r.deliver_at, delivered_at: r.delivered_at, created_at: r.created_at,
    cover: urls[r.cover_path] || null,
    versions: (r.versions || []).map((v, i) => ({ index: i, register: v.register || "", url: urls[v.path] || null, phone_url: urls[v.phone] || null })),
    chosen: Number.isInteger(r.chosen) ? r.chosen : null,
    gallery_url: r.public ? `${site}/g/${r.id}` : null,
    urls_expire_at: expires,
  }));
}
