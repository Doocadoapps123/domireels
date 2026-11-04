import Link from "next/link";
import { Mark } from "@/components/Brand";
import { BottomNav, TopTabs } from "@/components/AppNav";
import RestaurantSwitch from "@/components/RestaurantSwitch";
import { requireOwner } from "@/lib/auth";

export const metadata = { title: "Your kitchen", robots: { index: false, follow: false } };

export default async function AppLayout({ children }) {
  const ctx = await requireOwner();
  const signOut = (
    <form action="/api/auth/logout" method="post">
      <button className="btn btn-quiet btn-sm" type="submit">Sign out</button>
    </form>
  );
  if (!ctx.account || !ctx.restaurant) {
    return (
      <div className="auth">
        <div className="glow" />
        <main className="auth-body">
          <div className="auth-card card card-lg stack gap-16">
            <h1 style={{ fontSize: "2rem" }}>No restaurant here yet</h1>
            <p className="muted">This login is not linked to a restaurant. If you have an invitation code, create your account with it.</p>
            <div className="cta-row"><Link className="btn btn-primary" href="/signup">Use an invitation code</Link>{signOut}</div>
          </div>
        </main>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <div className="glow" />
      <header className="app-head">
        <div className="wrap">
          <div className="app-head-r">
            <Link href="/app" aria-label="Domi Reels" style={{ display: "flex" }}><Mark size={30} /></Link>
            <RestaurantSwitch restaurants={ctx.restaurants.map((r) => ({ id: r.id, name: r.name }))} current={ctx.restaurant.id} />
          </div>
          <TopTabs />
          {signOut}
        </div>
      </header>
      <main className="wrap">{children}</main>
      <BottomNav />
    </div>
  );
}
