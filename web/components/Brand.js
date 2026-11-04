import Link from "next/link";

// Domi's mark: the red D with eyes, looking slightly right. The brighter red is the one for dark backgrounds, and at
// 24px and below the flat one (no shine in the eyes). Never stretched, rotated or recolored.
export function Mark({ size = 30 }) {
  const src = size <= 24 ? "/brand/domi-avatar-flat.svg" : "/brand/domi-avatar-dark.svg";
  return <img src={src} width={size} height={size} alt="" aria-hidden="true" className="mark" />;
}

export function Brand({ href = "/" }) {
  return (
    <Link href={href} className="brand" aria-label="Domi Reels home">
      <Mark size={38} />
      <span className="brand-word">domi <span>reels</span></span>
    </Link>
  );
}

export function SiteHeader({ right }) {
  return (
    <header className="site-head">
      <div className="wrap">
        <Brand />
        <nav className="nav">
          {right ?? (
            <>
              <Link href="/#gallery" className="hide-sm">Reels</Link>
              <Link href="/docs" className="hide-sm">API</Link>
              <Link href="/login">Sign in</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="row gap-8"><Mark size={22} /><span>Domi Reels. By invitation only.</span></div>
        <div className="row-wrap" style={{ gap: 18 }}>
          <Link href="/#gallery">Reels</Link>
          <Link href="/docs">API for ordering platforms</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Have an invitation code?</Link>
        </div>
      </div>
    </footer>
  );
}
