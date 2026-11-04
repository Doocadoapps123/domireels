// The owner picks a version of their Reel from the page their link opens. The link's k is the only key.
// What they chose becomes a lesson for this restaurant, so the next Reel's music leans their way.
import { db, must, validKey, isUuid } from "@/lib/db";
import { body, fail, handle, json } from "@/lib/http";
import { andList } from "@/lib/reels";

export const POST = handle(async (req, { params }) => {
  const { id } = await params;
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  if (!isUuid(id) || !validKey(id, b.k)) return fail(404, "Reel not found.");
  const [reel] = await must(db.from("reels").select("id, restaurant_id, title, versions, chosen").eq("id", id).limit(1));
  if (!reel) return fail(404, "Reel not found.");
  const i = Number(b.i), versions = reel.versions || [];
  if (!Number.isInteger(i) || !versions[i]) return fail(400, "That version does not exist.");
  if (reel.chosen === i) return json({ chosen: i });

  await must(db.from("reels").update({ chosen: i }).eq("id", id));
  const name = (v, j) => v.register || `version ${j + 1}`;
  const others = [...new Set(versions.map(name).filter((n, j) => j !== i && n !== name(versions[i], i)))];
  if (others.length) {
    // One lesson per Reel: changing your mind replaces it.
    const source = `web:choose:${id}`;
    await must(db.from("lessons").delete().eq("source", source).eq("restaurant_id", reel.restaurant_id));
    await must(db.from("lessons").insert({
      scope: "restaurant", restaurant_id: reel.restaurant_id, source,
      text: `Owner chose the ${name(versions[i], i)} score over ${andList(others)} for "${reel.title || "their Reel"}"`,
    }));
  }
  return json({ chosen: i });
});
