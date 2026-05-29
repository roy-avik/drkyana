"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Queue" },
  { href: "/chambers", label: "Chambers" },
  { href: "/drafts", label: "Drafts" },
  { href: "/assistant", label: "Assistant" },
];

export default function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/intakes") : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-20 border-b border-ink/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
            K
          </span>
          <span className="text-sm font-semibold text-ink">Practice Console</span>
        </Link>
      </div>
      <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2 pb-2">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
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
