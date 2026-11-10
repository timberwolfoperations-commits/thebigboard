import { SkBar, SkCard, SkTable } from "@/components/skeleton";

// Pick'em pool detail: switcher bar, pool header, standings table,
// then the slate of game cards (two pick buttons per game).
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <SkBar className="h-9 w-full rounded-full" />
      <div>
        <SkBar className="h-8 w-52" />
        <div className="mt-2 flex gap-2">
          <SkBar className="h-5 w-20 rounded-full" />
          <SkBar className="h-5 w-24 rounded-full" />
        </div>
      </div>
      <SkTable rows={6} />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkCard key={i} className="px-4 py-3.5">
            <SkBar className="h-3 w-28" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <SkBar className="h-11 rounded-xl" />
              <SkBar className="h-11 rounded-xl" />
            </div>
          </SkCard>
        ))}
      </div>
    </div>
  );
}
