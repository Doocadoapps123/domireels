// Photos go straight from the phone to storage (Vercel caps a request body at 4.5 MB, a food photo is often bigger):
// this route checks the owner and hands back a one-time signed upload url for the right path; /done records it.
import { db, must, isUuid } from "@/lib/db";
import { body, fail, handle, json, ownerFor } from "@/lib/http";

const SHA1 = /^[0-9a-f]{40}$/;

export const POST = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const { restaurant, error } = await ownerFor(b.restaurant_id);
  if (error) return error;
  let path;
  if (b.kind === "library") {
    if (!SHA1.test(b.sha1 || "")) return fail(400, "Missing the photo's fingerprint.");
    const [dup] = await must(db.from("photos").select("id").eq("restaurant_id", restaurant.id).eq("sha1", b.sha1).limit(1));
    if (dup) return json({ exists: true });
    path = `${restaurant.id}/library/${b.sha1}.jpg`;
  } else if (b.kind === "dish") {
    if (!isUuid(b.dish_id)) return fail(400, "Which dish?");
    const [dish] = await must(db.from("dishes").select("id").eq("id", b.dish_id).eq("restaurant_id", restaurant.id).limit(1));
    if (!dish) return fail(404, "Dish not found.");
    path = `${restaurant.id}/dishes/${dish.id}-${Date.now()}.jpg`;
  } else return fail(400, "Unknown upload.");
  const { data, error: e } = await db.storage.from("photos").createSignedUploadUrl(path, { upsert: true });
  if (e) throw new Error(e.message);
  return json({ path, url: data.signedUrl });
});
