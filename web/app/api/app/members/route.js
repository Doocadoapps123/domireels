// The WhatsApp numbers allowed to talk to Domi Reels for this restaurant.
import { db, must } from "@/lib/db";
import { body, fail, handle, json, ownerFor } from "@/lib/http";
import { normalizePhone } from "@/lib/phone";

export const POST = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const { restaurant, error } = await ownerFor(b.restaurant_id);
  if (error) return error;
  const phone = normalizePhone(b.phone, b.country);
  if (!phone) return fail(400, "Enter a WhatsApp number with its country code.");
  const role = b.role === "owner" ? "owner" : "staff";
  const name = String(b.name || "").trim().slice(0, 80) || null;
  const { data, error: e } = await db.from("members").insert({ restaurant_id: restaurant.id, phone, role, name }).select("*");
  if (e) {
    if (e.code === "23505") return fail(409, "That number is already on the list.");
    throw new Error(e.message);
  }
  return json({ member: data[0] }, 201);
});

export const DELETE = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const { restaurant, error } = await ownerFor(b.restaurant_id);
  if (error) return error;
  const all = await must(db.from("members").select("id").eq("restaurant_id", restaurant.id));
  if (!all.some((m) => m.id === b.id)) return fail(404, "That number is not on the list.");
  if (all.length <= 1) return fail(400, "Keep at least one number, so your Reels have somewhere to go.");
  await must(db.from("members").delete().eq("id", b.id).eq("restaurant_id", restaurant.id));
  return json({ ok: true });
});
