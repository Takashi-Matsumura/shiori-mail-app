"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, badge, children }: { href: string; badge?: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
        active ? "bg-accent-soft font-medium text-accent" : "hover:bg-background"
      }`}
    >
      <span>{children}</span>
      {badge ? <span className="text-xs tabular-nums">{badge}</span> : null}
    </Link>
  );
}
