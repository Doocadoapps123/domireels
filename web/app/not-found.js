import Link from "next/link";
import { SiteHeader } from "@/components/Brand";

export default function NotFound() {
  return (
    <>
      <div className="glow" />
      <SiteHeader />
      <main className="wrap-narrow" style={{ padding: "80px 16px", textAlign: "center" }}>
        <div className="stack gap-16" style={{ alignItems: "center" }}>
          <h1 style={{ fontSize: "clamp(2.2rem, 8vw, 3.4rem)" }}>This page is not on the menu.</h1>
          <p className="muted">The link may be old or incomplete. If it came on WhatsApp, open it from the latest message.</p>
          <Link href="/" className="btn btn-ghost mt-8">Go to Domi Reels</Link>
        </div>
      </main>
    </>
  );
}
