import { SkBar, SkSection } from "@/components/skeleton";

// Groups landing — in practice this route resolves a redirect to a
// group; the skeleton covers that beat (and the no-groups state).
export default function Loading() {
  return (
    <div className="animate-pulse space-y-8">
      <div>
        <SkBar className="h-9 w-40" />
        <SkBar className="mt-3 h-4 w-64" />
      </div>
      <SkSection rows={2} />
    </div>
  );
}
