// PUT creates or updates one of the platform's restaurants, by the platform's own id for it.
import { db, must } from "@/lib/db";
import { body, fail, handle, json, platformFor } from "@/lib/http";
import { findRestaurant, restaurantView } from "@/lib/platform";
import { restaurantFields } from "@/lib/validate";

export const dynamic = "force-dynamic";
const FIELDS = ["name", "cuisine", "city", "language", "timezone", "delivery_day", "delivery_hour", "reels_per_week"];
const validId = (s) => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(s);

export const GET = handle(async (req, { params }) => {
  const { external_id } = await params;
  const { account, error } = await platformFor(req);
  if (error) return error;
  const r = validId(external_id) ? await findRestaurant(account, external_id) : null;
  if (!r) return fail(404, "Restaurant not found.");
  return json({ restaurant: restaurantView(r) });
});

export const PUT = handle(async (req, { params }) => {
  const { external_id } = await params;
  const { account, error } = await platformFor(req);
  if (error) return error;
  if (!validId(external_id)) return fail(400, "external_id may use letters, digits, '_', '-', '.', ':' (64 at most).");
  const b = await body(req);
  if (!b || typeof b !== "object" || Array.isArray(b)) return fail(400, "Send a JSON object.");
  const { values, error: bad } = restaurantFields(b, FIELDS);
  if (bad) return fail(422, bad);

  const existing = await findRestaurant(account, external_id);
  if (existing) {
    if (!Object.keys(values).length) return json({ restaurant: restaurantView(existing), created: false });
    const [row] = await must(db.from("restaurants").update(values).eq("id", existing.id).select("*"));
    return json({ restaurant: restaurantView(row), created: false });
  }
  if (!values.name) return fail(422, "A new restaurant needs a name.");
  const { data, error: e } = await db.from("restaurants").insert({ ...values, account_id: account.id, external_id }).select("*");
  if (e) {
    if (e.code === "23505") return fail(409, "That restaurant was just created by another call. Try again.");
    throw new Error(e.message);
  }
  return json({ restaurant: restaurantView(data[0]), created: true }, 201);
});
