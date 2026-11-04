"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMenu, IconPhotos, IconReels, IconSettings } from "./Icons";

const TABS = [
  { href: "/app", label: "Reels", Icon: IconReels },
  { href: "/app/menu", label: "Menu", Icon: IconMenu },
  { href: "/app/photos", label: "Photos", Icon: IconPhotos },
  { href: "/app/settings", label: "Settings", Icon: IconSettings },
];

export function TopTabs() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Sections">
      {TABS.map((t) => <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}>{t.label}</Link>)}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Sections">
      {TABS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}><Icon size={22} />{label}</Link>
      ))}
    </nav>
  );
}
