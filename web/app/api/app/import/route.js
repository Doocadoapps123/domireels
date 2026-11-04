// "Import my menu from my website": a job for the worker, which reads the site and writes the dishes.
import { db, must } from "@/lib/db";
import { body, fail, handle, json, ownerFor } from "@/lib/http";
import { ACTIVE, jobView } from "@/lib/reels";
import { normalizeUrl } from "@/lib/validate";

export const POST = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const { restaurant, error } = await ownerFor(b.restaurant_id);
  if (error) return error;
  const url = normalizeUrl(b.url);
  if (!url) return fail(400, "Enter your website's address, like yourrestaurant.com.");
  const open = await must(db.from("jobs").select("id").eq("restaurant_id", restaurant.id).eq("kind", "import").not("input->>url", "is", null).in("status", ACTIVE).limit(1));
  if (open.length) return fail(409, "Your menu is already being imported.");
  const [job] = await must(db.from("jobs").insert({ restaurant_id: restaurant.id, kind: "import", input: { url } }).select("*"));
  if (!restaurant.website) await db.from("restaurants").update({ website: url }).eq("id", restaurant.id);
  return json({ job: jobView(job) }, 201);
});
