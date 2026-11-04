// A photo the browser just put in storage: checked, then recorded (a library photo) or set on its dish.
import crypto from "node:crypto";
import { db, must, isUuid } from "@/lib/db";
import { body, fail, handle, json, ownerFor } from "@/lib/http";

const MAX = 25 * 1024 * 1024;

export const POST = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const { restaurant, error } = await ownerFor(b.restaurant_id);
  if (error) return error;
  const path = String(b.path || "");

  if (b.kind === "library") {
    const m = path.match(new RegExp(`^${restaurant.id}/library/([0-9a-f]{40})\\.jpg$`));
    if (!m) return fail(400, "That is not this restaurant's photo.");
    const { data: file, error: e } = await db.storage.from("photos").download(path);
    if (e || !file) return fail(400, "The photo did not arrive. Try again.");
    const buf = Buffer.from(await file.arrayBuffer());
    const sha1 = crypto.createHash("sha1").update(buf).digest("hex");
    if (sha1 !== m[1] || buf.length > MAX || buf.length < 1000) {
      await db.storage.from("photos").remove([path]);
      return fail(400, "That photo did not arrive whole. Try again.");
    }
    const { data, error: ie } = await db.from("photos").insert({ restaurant_id: restaurant.id, path, source: "upload", sha1 }).select("id, path, kind, label, created_at");
    if (ie) {
      if (ie.code === "23505") return json({ exists: true });
      throw new Error(ie.message);
    }
    return json({ photo: data[0] }, 201);
  }

  if (b.kind === "dish") {
    if (!isUuid(b.dish_id)) return fail(400, "Which dish?");
    const m = path.match(new RegExp(`^${restaurant.id}/dishes/(${b.dish_id})-(\\d+)\\.jpg$`));
    if (!m) return fail(400, "That is not this dish's photo.");
    const { data: found } = await db.storage.from("photos").list(`${restaurant.id}/dishes`, { search: `${m[1]}-${m[2]}.jpg`, limit: 1 });
    if (!found?.length) return fail(400, "The photo did not arrive. Try again.");
    const [dish] = await must(db.from("dishes").update({ photo_path: path, photo_url: null, updated_at: new Date().toISOString() }).eq("id", b.dish_id).eq("restaurant_id", restaurant.id).select("*"));
    if (!dish) return fail(404, "Dish not found.");
    return json({ dish });
  }
  return fail(400, "Unknown upload.");
});
