// What Muse is working on for this restaurant, for the dashboard to poll.
import { db, must } from "@/lib/db";
import { fail, handle, json, ownerFor } from "@/lib/http";
import { jobView } from "@/lib/reels";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const { restaurant, error } = await ownerFor(req.nextUrl.searchParams.get("restaurant_id"));
  if (error) return error;
  const kind = req.nextUrl.searchParams.get("kind");
  let q = db.from("jobs").select("*").eq("restaurant_id", restaurant.id).order("created_at", { ascending: false }).limit(10);
  if (kind) q = q.eq("kind", kind);
  const jobs = await must(q);
  const reels = jobs.length ? await must(db.from("reels").select("id, job_id").in("job_id", jobs.map((j) => j.id))) : [];
  return json({ jobs: jobs.map((j) => ({ ...jobView(j), reel_id: reels.find((r) => r.job_id === j.id)?.id || null })) }, 200, { "Cache-Control": "no-store" });
});
