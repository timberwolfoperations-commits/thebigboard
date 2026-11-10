// Shared loading-skeleton blocks (perceived-speed pass).
// Pure presentational placeholders: route loading.tsx files render
// these while the real page is built on the server, so a tap shows
// the page's shape instantly instead of a blank screen. No data, no
// logic — the blocks just echo each page's layout so the swap to real
// content doesn't jump. Colors match the app: warm off-white page,
// white cards, slate placeholder bars.

export function SkBar({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-slate-200/80 ${className}`} />;
}

// A white card shell matching components/ui.tsx Card.
export function SkCard({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// Section heading + a card of text rows — the dashboard/group shape.
export function SkSection({ rows = 2, titleWidth = "w-32" }: { rows?: number; titleWidth?: string }) {
  return (
    <section>
      <SkBar className={`mb-3 h-5 ${titleWidth}`} />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkCard key={i} className="px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <SkBar className="h-4 w-2/5" />
              <SkBar className="h-4 w-16" />
            </div>
            <SkBar className="mt-2 h-3 w-3/5" />
          </SkCard>
        ))}
      </div>
    </section>
  );
}

// Standings-style rows inside one card (group / pick'em / season).
export function SkTable({ rows = 6 }: { rows?: number }) {
  return (
    <SkCard className="p-0">
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <SkBar className="h-4 w-5" />
            <div className="h-6 w-6 shrink-0 rounded-full bg-slate-200/80" />
            <SkBar className="h-4 w-2/5" />
            <SkBar className="ml-auto h-4 w-12" />
          </div>
        ))}
      </div>
    </SkCard>
  );
}

// Dark record tile (group season card / season record strip) — a
// plain div on purpose, same as the real tiles.
export function SkDarkTile() {
  return (
    <div className="rounded-2xl bg-slate-900 px-4 py-3.5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="h-3 w-24 rounded bg-slate-700" />
          <div className="mt-2 h-9 w-28 rounded bg-slate-700" />
        </div>
        <div className="h-5 w-16 rounded bg-slate-700" />
      </div>
      <div className="mt-2 h-3 w-40 rounded bg-slate-700" />
    </div>
  );
}
