import { SkBar, SkSection } from "@/components/skeleton";

// Dashboard: greeting header, then Open bets / Happening now /
// Settled sections of stacked cards.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-8">
      <div>
        <SkBar className="h-9 w-56" />
        <SkBar className="mt-3 h-4 w-40" />
      </div>
      <SkSection rows={2} titleWidth="w-24" />
      <SkSection rows={3} titleWidth="w-36" />
      <SkSection rows={2} titleWidth="w-20" />
    </div>
  );
}
