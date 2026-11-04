import { db, must } from "@/lib/db";
import { handle, json, platformFor } from "@/lib/http";
import { restaurantView } from "@/lib/platform";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const { account, error } = await platformFor(req);
  if (error) return error;
  const rows = await must(db.from("restaurants").select("*").eq("account_id", account.id).order("created_at"));
  return json({ restaurants: rows.map(restaurantView) });
});
