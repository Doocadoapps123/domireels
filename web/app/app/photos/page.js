import PhotoUploader from "@/components/PhotoUploader";
import { IconWhatsApp } from "@/components/Icons";
import { requireOwner } from "@/lib/auth";
import { db, must, signedMany } from "@/lib/db";
import { WA_LINK, WA_PRETTY } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Photos" };

const SOURCE = { upload: "Uploaded", whatsapp: "WhatsApp", library: "Library", menu: "Menu", stock: "Stock" };

export default async function PhotosPage() {
  const { restaurant: r } = await requireOwner();
  const photos = await must(db.from("photos").select("id, path, source, kind, label, created_at").eq("restaurant_id", r.id).neq("source", "stock").order("created_at", { ascending: false }).limit(150));
  const urls = await signedMany("photos", photos.map((p) => p.path), 6 * 3600).catch(() => ({}));

  return (
    <div className="page">
      <div className="stack gap-8">
        <h1 className="page-title">Photos</h1>
        <p className="muted">The more of your real kitchen Muse sees, the better your Reels. Muse looks at every photo and decides what it can do.</p>
      </div>
      <PhotoUploader restaurantId={r.id} />
      <a href={WA_LINK} target="_blank" rel="noreferrer" className="wa-card" style={{ textDecoration: "none" }}>
        <span className="wa-icon"><IconWhatsApp size={26} /></span>
        <span className="stack gap-4">
          <strong>Or send them on WhatsApp to {WA_PRETTY}</strong>
          <span className="small muted">From a number on your list in Settings. Voice notes work too.</span>
        </span>
      </a>
      <section className="stack gap-12">
        <div className="row between">
          <span className="panel-title">Your photos</span>
          {photos.length ? <span className="small dim">{photos.length}</span> : null}
        </div>
        {photos.length ? (
          <div className="photo-grid">
            {photos.map((p) => (
              <figure key={p.id}>
                {urls[p.path] ? <img src={urls[p.path]} alt={p.label || "Restaurant photo"} loading="lazy" /> : null}
                <figcaption>{p.label || SOURCE[p.source] || p.source}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="empty">No photos yet. Start with your best dishes, then the kitchen and the storefront.</div>
        )}
      </section>
    </div>
  );
}
