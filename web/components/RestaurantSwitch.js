"use client";
import { useRouter } from "next/navigation";

export default function RestaurantSwitch({ restaurants, current }) {
  const router = useRouter();
  if (restaurants.length < 2) return <span className="place-name">Domi Reels</span>;
  return (
    <select
      className="select"
      style={{ minHeight: 38, padding: "6px 34px 6px 12px", width: "auto", maxWidth: "46vw", backgroundPosition: "calc(100% - 18px) 16px, calc(100% - 13px) 16px" }}
      value={current}
      aria-label="Restaurant"
      onChange={async (e) => {
        await fetch("/api/app/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurant_id: e.target.value }) });
        router.refresh();
      }}
    >
      {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  );
}
