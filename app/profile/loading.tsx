import { SkBar, SkCard } from "@/components/skeleton";

// Profile: title, display-name form card, avatar picker card,
// notification settings card.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <SkBar className="h-6 w-36" />
      <SkCard>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 rounded-full bg-slate-200/80" />
          <div className="flex-1">
            <SkBar className="h-4 w-32" />
            <SkBar className="mt-2 h-3 w-44" />
          </div>
        </div>
        <SkBar className="mt-4 h-11 w-full rounded-xl" />
        <SkBar className="mt-3 h-10 w-28 rounded-full" />
      </SkCard>
      <SkCard>
        <SkBar className="h-4 w-28" />
        <div className="mt-3 flex items-center justify-between">
          <SkBar className="h-4 w-40" />
          <SkBar className="h-6 w-11 rounded-full" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <SkBar className="h-4 w-32" />
          <SkBar className="h-6 w-11 rounded-full" />
        </div>
      </SkCard>
    </div>
  );
}
