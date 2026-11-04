import { db } from "@/lib/db";
import { body, fail, handle, json, ownerFor } from "@/lib/http";
import { nextDishNumber } from "@/lib/reels";
import { dishFields } from "@/lib/validate";

export const POST = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const { restaurant, error } = await ownerFor(b.restaurant_id);
  if (error) return error;
  const { values, error: bad } = dishFields({ name: b.name, description: b.description, price: b.price, ai_note: b.ai_note });
  if (bad) return fail(400, bad);
  // external_id is the dish's number, 1, 2, 3... per restaurant (the pipeline needs numeric ids). Two adds at once
  // can race for the same number; the unique index catches it and the next number is tried.
  for (let tries = 0; tries < 4; tries++) {
    const external_id = String(await nextDishNumber(restaurant.id));
    const { data, error: e } = await db.from("dishes").insert({ ...values, restaurant_id: restaurant.id, external_id }).select("*");
    if (!e) return json({ dish: data[0] }, 201);
    if (e.code !== "23505") throw new Error(e.message);
  }
  return fail(409, "Could not number the dish. Try again.");
});
