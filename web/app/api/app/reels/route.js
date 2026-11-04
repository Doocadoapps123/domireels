// "Make a Reel now". One at a time per restaurant, at most a few a day: each one is real work for Muse.
import { db, must } from "@/lib/db";
import { body, fail, handle, json, ownerFor } from "@/lib/http";
import { jobView, queueReelNow } from "@/lib/reels";

const PER_DAY = 3;

export const POST = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const { restaurant, error } = await ownerFor(b.restaurant_id);
  if (error) return error;
  const food = await must(db.from("dishes").select("id").eq("restaurant_id", restaurant.id).eq("active", true).not("photo_path", "is", null).limit(1));
  if (!food.length) return fail(400, "Add a photo to at least one dish first. Muse makes Reels from your real food.");
  const { job, error: no } = await queueReelNow(restaurant, { limitPerDay: PER_DAY });
  if (no) return fail(429, no);
  return json({ job: jobView(job) }, 201);
});
