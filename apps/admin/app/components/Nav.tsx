"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Queue" },
  { href: "/chambers", label: "Chambers" },
  { href: "/drafts", label: "Drafts" },
  { href: "/kb", label: "Knowledge" },
  { href: "/research", label: "Research" },
  { href: "/assistant", label: "Assistant" },
];

export default function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/intakes") : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-20 border-b border-ink/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 lg:max-w-5xl">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
            K
          </span>
          <span className="text-sm font-semibold text-ink">Practice Console</span>
        </Link>
        {/* Cloudflare Access's own single-app logout endpoint — revokes the
            CF_Authorization cookie for this app and drops back to the Access
            login screen. No server route of ours involved. */}
        <a
          href="/cdn-cgi/access/logout"
          className="flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted transition-colors ease-spring hover:bg-surface-alt hover:text-ink"
        >
          Sign out
        </a>
      </div>
      <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2 pb-2 lg:max-w-5xl">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isActive(l.href) ? "page" : undefined}
            className={`flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ease-spring ${
              isActive(l.href)
                ? "bg-brand text-white"
                : "text-muted hover:bg-surface-alt hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
