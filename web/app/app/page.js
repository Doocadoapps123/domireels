import Link from "next/link";
import ReelStudio from "@/components/ReelStudio";
import EquipmentSetup from "@/components/EquipmentSetup";
import { EQUIPMENT_SOURCE } from "@/lib/equipment";
import { IconDownload } from "@/components/Icons";
import { requireOwner } from "@/lib/auth";
import { db, must, signedMany, linkKey } from "@/lib/db";
import { jobView } from "@/lib/reels";
import { DAYS, hourLabel } from "@/lib/time";

export const dynamic = "force-dynamic";

const when = (iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default async function ReelsPage() {
  const { restaurant: r } = await requireOwner();
  const [jobs, reels, food, equipment] = await Promise.all([
    must(db.from("jobs").select("*").eq("restaurant_id", r.id).order("created_at", { ascending: false }).limit(10)),
    must(db.from("reels").select("id, job_id, title, idea, versions, chosen, cover_path, seconds, created_at, delivered_at, deliver_at, public").eq("restaurant_id", r.id).order("created_at", { ascending: false }).limit(30)),
    must(db.from("dishes").select("id").eq("restaurant_id", r.id).eq("active", true).not("photo_path", "is", null).limit(1)),
    must(db.from("lessons").select("id").eq("restaurant_id", r.id).eq("source", EQUIPMENT_SOURCE).limit(1)),
  ]);
  const covers = await signedMany("reels", reels.map((x) => x.cover_path), 6 * 3600).catch(() => ({}));
  const links = Object.fromEntries(reels.map((x) => [x.id, `/r/${x.id}?k=${linkKey(x.id)}`]));
  const now = new Date().getTime();
  const initialJobs = jobs
    .filter((j) => j.kind !== "import" && j.status !== "cancelled")
    .filter((j) => ["queued", "running", "waiting_owner"].includes(j.status) || now - new Date(j.updated_at).getTime() < 3 * 86400000)
    .slice(0, 6)
    .map((j) => ({ ...jobView(j), reel_id: reels.find((x) => x.job_id === j.id)?.id || null }));

  return (
    <div className="page">
      <div className="stack gap-8">
        <h1 className="page-title">{r.name}</h1>
        <p className="muted">
          {r.reels_per_week > 0
            ? <>Muse makes {r.reels_per_week} Reel{r.reels_per_week > 1 ? "s" : ""} a week and sends {r.reels_per_week > 1 ? "them" : "it"} on {DAYS[r.delivery_day]}s at {hourLabel(r.delivery_hour)}. <Link href="/app/settings" className="link">Change</Link></>
            : <>Weekly Reels are off. <Link href="/app/settings" className="link">Turn them on</Link></>}
        </p>
      </div>

      {equipment.length ? null : <EquipmentSetup restaurantId={r.id} />}

      <ReelStudio
        restaurantId={r.id}
        initialJobs={initialJobs}
        reelLinks={links}
        canMake={food.length > 0}
        cannotWhy={food.length ? "" : "First add a photo to at least one dish in your menu. Muse makes Reels from your real food."}
      />

      <section className="stack gap-16">
        <div className="row between">
          <span className="panel-title">Your Reels</span>
          {reels.length ? <span className="small dim">{reels.length}</span> : null}
        </div>
        {reels.length ? (
          <div className="owner-reels">
            {reels.map((x) => {
              const versions = x.versions || [];
              const pick = Number.isInteger(x.chosen) ? versions[x.chosen] : null;
              const k = linkKey(x.id);
              return (
                <div className="owner-reel" key={x.id}>
                  <Link href={links[x.id]} className="phone" style={{ aspectRatio: "9 / 16" }}>
                    {covers[x.cover_path] ? <img src={covers[x.cover_path]} alt={x.title || "Reel cover"} loading="lazy" /> : null}
                  </Link>
                  <div className="owner-reel-body">
                    <Link href={links[x.id]} style={{ textDecoration: "none" }}><strong style={{ lineHeight: 1.25, display: "block" }}>{x.title || "Untitled Reel"}</strong></Link>
                    <span className="small dim">{when(x.created_at)}{x.seconds ? `, ${Math.round(x.seconds)}s` : ""}</span>
                    <div className="chips">
                      {versions.length > 1 ? <span className="chip">{versions.length} songs</span> : null}
                      {pick ? <span className="chip chip-good">{pick.register || `Version ${x.chosen + 1}`}</span> : versions.length > 1 ? <span className="chip chip-warn">Pick a song</span> : null}
                      {!x.delivered_at && x.deliver_at && new Date(x.deliver_at) > new Date() ? <span className="chip">Arrives {when(x.deliver_at)}</span> : null}
                      {x.public ? <span className="chip chip-accent">In the gallery</span> : null}
                    </div>
                    <div className="row-wrap" style={{ gap: 6, marginTop: "auto" }}>
                      <Link href={links[x.id]} className="btn btn-ghost btn-sm">Open</Link>
                      {versions.map((v, i) => (
                        <a key={i} href={`/api/download/${x.id}/${i}?k=${k}`} className="btn btn-quiet btn-sm" title={`Download ${v.register || `version ${i + 1}`} in full quality`}>
                          <IconDownload size={16} />{versions.length > 1 ? i + 1 : "Download"}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            No Reels yet. Add your dishes and their photos, then press Make a Reel now, or send photos to Domi Reels on WhatsApp.
          </div>
        )}
      </section>
    </div>
  );
}
