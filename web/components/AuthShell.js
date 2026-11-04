import Link from "next/link";
import { Brand } from "./Brand";

export default function AuthShell({ title, intro, children, foot }) {
  return (
    <div className="auth">
      <div className="glow" />
      <header className="site-head"><div className="wrap"><Brand /><nav className="nav"><Link href="/#gallery">See the Reels</Link></nav></div></header>
      <main className="auth-body">
        <div className="auth-card stack gap-24">
          <div className="stack gap-12">
            <h1 style={{ fontSize: "clamp(2.1rem, 8vw, 2.9rem)" }}>{title}</h1>
            {intro ? <p className="muted">{intro}</p> : null}
          </div>
          {children}
          {foot ? <div className="small muted center">{foot}</div> : null}
        </div>
      </main>
    </div>
  );
}
