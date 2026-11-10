import { SkBar, SkSection } from "@/components/skeleton";

// Root shell — shown briefly while / resolves (signed-in users are
// redirected on to the dashboard, which has its own skeleton).
export default function Loading() {
  return (
    <div className="animate-pulse space-y-8">
      <SkBar className="h-9 w-52" />
      <SkSection rows={2} />
      <SkSection rows={2} titleWidth="w-40" />
    </div>
  );
}
