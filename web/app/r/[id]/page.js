// The owner's page for one Reel. No login: the k in the link is an HMAC of the Reel's id (lib/db.js linkKey), the same
// link the worker sends on WhatsApp.
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/Brand";
import OwnerReel from "@/components/OwnerReel";
import { db, must, validKey, isUuid } from "@/lib/db";
import { ownerVersions } from "@/lib/reels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Reel", robots: { index: false, follow: false } };

export default async function OwnerReelPage({ params, searchParams }) {
  const { id } = await params;
  const { k } = await searchParams;
  if (!isUuid(id) || !validKey(id, k)) notFound();
  const [reel] = await must(db.from("reels").select("id, title, idea, versions, chosen, cover_path, seconds, created_at, restaurants(name)").eq("id", id).limit(1));
  if (!reel) notFound();
  const v = await ownerVersions(reel);

  return (
    <>
      <div className="glow" />
      <SiteHeader right={<span className="small dim">Your Reel</span>} />
      <main className="wrap" style={{ paddingBottom: 64 }}>
        <OwnerReel
          id={reel.id}
          k={k}
          title={reel.title || "Your Reel"}
          place={reel.restaurants?.name || ""}
          idea={reel.idea || ""}
          cover={v.cover}
          versions={v.versions}
          chosen={Number.isInteger(reel.chosen) ? reel.chosen : null}
        />
      </main>
    </>
  );
}
