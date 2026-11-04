import SettingsForm from "@/components/SettingsForm";
import Members from "@/components/Members";
import { IconWhatsApp } from "@/components/Icons";
import { requireOwner } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { timezones } from "@/lib/time";
import { WA_LINK, WA_PRETTY } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { restaurant: r } = await requireOwner();
  const members = await must(db.from("members").select("id, phone, name, role").eq("restaurant_id", r.id).order("created_at"));
  const zones = timezones();
  if (!zones.includes(r.timezone)) zones.unshift(r.timezone);

  return (
    <div className="page">
      <div className="stack gap-8">
        <h1 className="page-title">Settings</h1>
        <p className="muted">Your restaurant, when your Reels arrive, and who can talk to Domi Reels.</p>
      </div>
      <a href={WA_LINK} target="_blank" rel="noreferrer" className="wa-card" style={{ textDecoration: "none" }}>
        <span className="wa-icon"><IconWhatsApp size={26} /></span>
        <span className="stack gap-4">
          <strong>Domi Reels on WhatsApp: {WA_PRETTY}</strong>
          <span className="small muted">Send photos and voice notes there. Muse answers, asks what it needs to know, and sends your Reels.</span>
        </span>
      </a>
      <Members restaurantId={r.id} members={members} />
      <SettingsForm restaurant={r} timezones={zones} />
    </div>
  );
}
