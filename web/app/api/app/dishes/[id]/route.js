import { db, must, isUuid } from "@/lib/db";
import { body, fail, handle, json, ownerFor } from "@/lib/http";
import { dishFields } from "@/lib/validate";

export const PATCH = handle(async (req, { params }) => {
  const { id } = await params;
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  if (!isUuid(id)) return fail(404, "Dish not found.");
  const { restaurant, error } = await ownerFor(b.restaurant_id);
  if (error) return error;
  const { values, error: bad } = dishFields(Object.fromEntries(["name", "description", "price", "ai_note", "active"].filter((k) => k in b).map((k) => [k, b[k]])));
  if (bad) return fail(400, bad);
  const [dish] = await must(db.from("dishes").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id).eq("restaurant_id", restaurant.id).select("*"));
  if (!dish) return fail(404, "Dish not found.");
  return json({ dish });
});
