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

/** 畳んだパネル用の小さなリンク。見出しはアイコンにし、名前は title と読み上げで伝える。 */
export function RailLink({ href, label, icon, badge }: { href: string; label: string; icon: React.ReactNode; badge?: number }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  const name = badge ? `${label}(未読 ${badge} 通)` : label;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={name}
      title={name}
      className={`flex w-9 flex-col items-center gap-0.5 rounded-md py-1.5 leading-tight ${
        active ? "bg-accent-soft font-medium text-accent" : "hover:bg-background"
      }`}
    >
      {icon}
      {badge ? (
        <span aria-hidden="true" className="text-[10px] tabular-nums">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
