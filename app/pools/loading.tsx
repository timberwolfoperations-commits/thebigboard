import { SkBar, SkSection } from "@/components/skeleton";

// Pools landing — in practice this route resolves a redirect to a
// pool; the skeleton covers that beat (and the no-pools state).
export default function Loading() {
  return (
    <div className="animate-pulse space-y-8">
      <div>
        <SkBar className="h-9 w-36" />
        <SkBar className="mt-3 h-4 w-64" />
      </div>
      <SkSection rows={2} />
    </div>
  );
}
