import { db, must } from "@/lib/db";
import { body, fail, handle, json, ownerFor } from "@/lib/http";
import { restaurantFields } from "@/lib/validate";

const FIELDS = ["name", "cuisine", "city", "language", "website", "timezone", "delivery_day", "delivery_hour", "reels_per_week", "music_options"];

export const PATCH = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const { restaurant, error } = await ownerFor(b.restaurant_id);
  if (error) return error;
  const { values, error: bad } = restaurantFields(b, FIELDS);
  if (bad) return fail(400, bad);
  if (!Object.keys(values).length) return json({ restaurant });
  const [row] = await must(db.from("restaurants").update(values).eq("id", restaurant.id).select("*"));
  return json({ restaurant: row });
});
