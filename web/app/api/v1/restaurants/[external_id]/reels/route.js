// Queue a Reel now for one of the platform's restaurants.
// Every Reel costs real money (about $3-5 in models), so a platform's bug must not become a bill: one Reel in the making
// per restaurant, at most PER_DAY a day for each one, and at most PLATFORM_DAY a day for the whole platform.
import { body, fail, handle, json, platformFor } from "@/lib/http";
import { db, must } from "@/lib/db";
import { findRestaurant, jobOut } from "@/lib/platform";
import { ACTIVE, queueReelNow } from "@/lib/reels";

export const dynamic = "force-dynamic";

const PER_DAY = 3;
const PLATFORM_DAY = +process.env.DR_PLATFORM_DAILY || 20;

export const POST = handle(async (req, { params }) => {
  const { external_id } = await params;
  const { account, error } = await platformFor(req);
  if (error) return error;
  await body(req); // no fields yet; an empty body is fine
  const r = await findRestaurant(account, external_id);
  if (!r) return fail(404, "Restaurant not found. Create it first with PUT /api/v1/restaurants/{external_id}.");
  if (!r.active) return fail(409, "That restaurant is not active.");

  const open = await must(db.from("jobs").select("*").eq("restaurant_id", r.id).eq("kind", "reel").in("status", ACTIVE).limit(1));
  if (open.length) return fail(409, "A Reel for this restaurant is already being made.", { job: jobOut(open[0], r.external_id) });
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const ids = (await must(db.from("restaurants").select("id").eq("account_id", account.id))).map((x) => x.id);
  const today = await must(db.from("jobs").select("restaurant_id").eq("kind", "reel").in("restaurant_id", ids).gte("created_at", since));
  if (today.filter((j) => j.restaurant_id === r.id).length >= PER_DAY) return fail(429, `This restaurant already has ${PER_DAY} Reels in the last 24 hours.`, { retry_after_hours: 24 });
  if (today.length >= PLATFORM_DAY) return fail(429, `Your account already queued ${PLATFORM_DAY} Reels in the last 24 hours. Write to us to raise it.`, { retry_after_hours: 24 });

  const { job } = await queueReelNow(r);
  return json({ job: jobOut(job, r.external_id) }, 202);
});
