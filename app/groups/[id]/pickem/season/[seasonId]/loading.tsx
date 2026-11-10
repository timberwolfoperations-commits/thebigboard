import { SkBar, SkCard, SkDarkTile, SkTable } from "@/components/skeleton";

// Season page (condensed layout): back line, title + round chip,
// the dark season-record strip, your-pick box, standings table,
// round-by-round grid.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <SkBar className="h-3 w-24" />
      <div>
        <div className="flex items-center gap-2">
          <SkBar className="h-8 w-48" />
          <SkBar className="h-5 w-24 rounded-full" />
        </div>
        <SkBar className="mt-2 h-3 w-56" />
      </div>
      <SkDarkTile />
      <SkCard className="px-4 py-3.5">
        <SkBar className="h-3 w-20" />
        <SkBar className="mt-2 h-4 w-40" />
        <SkBar className="mt-2 h-3 w-3/5" />
      </SkCard>
      <section>
        <SkBar className="mb-2 h-5 w-36" />
        <SkTable rows={8} />
      </section>
      <section>
        <SkBar className="mb-2 h-5 w-32" />
        <SkCard className="px-4 py-3">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <SkBar className="h-4 w-20" />
                {Array.from({ length: 6 }).map((_, j) => (
                  <SkBar key={j} className="h-4 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </SkCard>
      </section>
    </div>
  );
}
