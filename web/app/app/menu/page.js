import MenuEditor from "@/components/MenuEditor";
import { requireOwner } from "@/lib/auth";
import { db, must, signedMany } from "@/lib/db";
import { jobView } from "@/lib/reels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menu" };

export default async function MenuPage() {
  const { restaurant: r } = await requireOwner();
  const [dishes, imports] = await Promise.all([
    must(db.from("dishes").select("id, external_id, name, description, price, ai_note, photo_path, active").eq("restaurant_id", r.id)),
    must(db.from("jobs").select("*").eq("restaurant_id", r.id).eq("kind", "import").order("created_at", { ascending: false }).limit(1)),
  ]);
  const thumbs = await signedMany("photos", dishes.map((d) => d.photo_path), 6 * 3600).catch(() => ({}));
  const order = (d) => (/^\d+$/.test(d.external_id || "") ? +d.external_id : Infinity);
  const list = dishes
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
    .map(({ photo_path, ...d }) => ({ ...d, thumb: thumbs[photo_path] || null }));

  return (
    <div className="page">
      <div className="stack gap-8">
        <h1 className="page-title">Menu</h1>
        <p className="muted">Muse picks the dish for each Reel from here. A dish needs a real photo before it can star in one.</p>
      </div>
      <MenuEditor restaurantId={r.id} dishes={list} website={r.website || ""} importJob={imports[0] ? jobView(imports[0]) : null} />
    </div>
  );
}
