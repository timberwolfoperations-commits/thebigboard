import { SkBar, SkDarkTile, SkSection, SkTable } from "@/components/skeleton";

// Group detail: switcher bar, group name, season tile, lifetime
// standings table, then the bets/pools sections.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <SkBar className="h-9 w-full rounded-full" />
      <div>
        <SkBar className="h-9 w-48" />
        <SkBar className="mt-2 h-4 w-32" />
      </div>
      <SkDarkTile />
      <section>
        <SkBar className="mb-3 h-5 w-36" />
        <SkTable rows={6} />
      </section>
      <SkSection rows={2} titleWidth="w-28" />
    </div>
  );
}
