// The platform's Reels, newest first, with signed download urls.
import { db, must } from "@/lib/db";
import { fail, handle, json, platformFor } from "@/lib/http";
import { findRestaurant, reelsOut } from "@/lib/platform";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const { account, error } = await platformFor(req);
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "20", 10) || 20));
  let restaurants;
  if (sp.get("restaurant")) {
    const r = await findRestaurant(account, sp.get("restaurant"));
    if (!r) return fail(404, "Restaurant not found.");
    restaurants = [r];
  } else {
    restaurants = await must(db.from("restaurants").select("id, external_id").eq("account_id", account.id));
  }
  if (!restaurants.length) return json({ reels: [] });
  const rows = await must(
    db.from("reels").select("id, restaurant_id, job_id, title, idea, kind, dishes, seconds, cover_path, versions, chosen, caption, public, deliver_at, delivered_at, created_at")
      .in("restaurant_id", restaurants.map((r) => r.id)).order("created_at", { ascending: false }).limit(limit),
  );
  const ext = Object.fromEntries(restaurants.map((r) => [r.id, r.external_id]));
  return json({ reels: await reelsOut(rows, (id) => ext[id]) }, 200, { "Cache-Control": "no-store" });
});
