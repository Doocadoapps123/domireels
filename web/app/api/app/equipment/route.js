// Onboarding: the owner marks the equipment they cook with. Saved as a restaurant note, and a job for the worker finds
// (or makes) a provisional photo of each one now, so no Reel waits on it later. The owner's own photo replaces it.
import { db, must } from "@/lib/db";
import { body, fail, handle, json, ownerFor } from "@/lib/http";
import { EQUIPMENT, EQUIPMENT_SOURCE, equipmentText } from "@/lib/equipment";

export const POST = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const { restaurant, error } = await ownerFor(b.restaurant_id);
  if (error) return error;
  const other = typeof b.other === "string" ? b.other.trim().slice(0, 200) : "";
  // What they wrote counts too: "freidora", "a flat top" reach the same stations.
  const WORDS = { fryer: /fr(y|ie|eid)/i, plancha: /plancha|griddle|flat.?top|comal/i, grill: /grill|parrilla|bbq|barbecue|brasa/i, oven: /oven|horno/i, wok: /wok/i, pot: /pot|olla|caldero|stock/i, blender: /blend|licuad/i, espresso: /espresso|coffee|caf[eé]/i };
  const keys = [...new Set([...(Array.isArray(b.equipment) ? b.equipment : []), ...Object.keys(WORDS).filter((k) => WORDS[k].test(other))].filter((k) => EQUIPMENT.some((e) => e.key === k)))];
  if (!keys.length && other.length < 3) return fail(400, "Every kitchen cooks with something. Write what you use.");
  await must(db.from("lessons").delete().eq("restaurant_id", restaurant.id).eq("source", EQUIPMENT_SOURCE));
  await must(db.from("lessons").insert({ scope: "restaurant", restaurant_id: restaurant.id, text: equipmentText(keys) + (other ? ` In their words: ${other}.` : ""), source: EQUIPMENT_SOURCE }));
  if (keys.length) await must(db.from("jobs").insert({ restaurant_id: restaurant.id, kind: "import", input: { equipment: keys } }));
  return json({ equipment: keys }, 201);
});
