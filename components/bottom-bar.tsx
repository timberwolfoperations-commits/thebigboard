"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Mobile app shell: four even tabs (Home / Pools / Groups / Profile).
// Rendered only for signed-in users (layout decides), mobile only —
// desktop keeps the header exactly as it was. Active tab in burnt
// orange, everything else quiet slate. Inline SVG icons, no emoji.

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-6 w-6",
  "aria-hidden": true,
} as const;

const TABS = [
  {
    href: "/dashboard",
    label: "Home",
    match: (p: string) => p === "/dashboard" || p === "/",
    icon: (
      <svg {...iconProps}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </svg>
    ),
  },
  {
    href: "/pools",
    label: "Pools",
    match: (p: string) => p.startsWith("/pools"),
    icon: (
      <svg {...iconProps}>
        <path d="M12 3l9 5-9 5-9-5 9-5Z" />
        <path d="M3.5 12.5 12 17l8.5-4.5" />
        <path d="M3.5 17 12 21.5 20.5 17" />
      </svg>
    ),
  },
  {
    href: "/groups",
    label: "Groups",
    match: (p: string) => p.startsWith("/groups"),
    icon: (
      <svg {...iconProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
        <circle cx="17.5" cy="9" r="2.6" />
        <path d="M16.5 15.2c2.3.3 4.1 1.9 4.8 4.3" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    match: (p: string) => p.startsWith("/profile"),
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21c1-4 4-6 7.5-6s6.5 2 7.5 6" />
      </svg>
    ),
  },
];

export default function BottomBar() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-3xl items-stretch px-2">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 ${
                active ? "text-orange-700" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {t.icon}
              <span className="text-[10px] font-bold uppercase tracking-[0.12em]">
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
