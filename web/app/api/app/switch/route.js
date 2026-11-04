import { RESTAURANT_COOKIE } from "@/lib/auth";
import { body, fail, handle, json, ownerFor } from "@/lib/http";

export const POST = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const { restaurant, error } = await ownerFor(b.restaurant_id);
  if (error) return error;
  const res = json({ ok: true });
  res.cookies.set(RESTAURANT_COOKIE, restaurant.id, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  return res;
});
