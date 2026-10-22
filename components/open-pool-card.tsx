import { Card } from "@/components/ui";
import { joinOpenPool } from "@/lib/open-pool-actions";
import type { OpenPoolCardData } from "@/lib/open-pools";

// Discovery card for an open (public) pool — used on the Home feed and
// the Pools tab. One tap joins as a guest and lands on the pool page.
export default function OpenPoolCard({ pool }: { pool: OpenPoolCardData }) {
  const join = joinOpenPool.bind(null, pool.type, pool.id);
  return (
    <Card className="transition hover:border-slate-400">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-display text-lg font-semibold uppercase tracking-wide">
              {pool.name}
            </p>
            {pool.format === "survivor" ? (
              <span className="inline-block shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900">
                survivor
              </span>
            ) : (
              <span className="inline-block shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                {pool.format === "over_under" ? "over/under" : "pick'em"}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {pool.hostGroup && (
              <>
                <span className="font-medium text-slate-500">{pool.hostGroup}</span>
                {" · "}
              </>
            )}
            <span>{pool.info}</span>
            {" · "}
            <span className="text-slate-500">open to anyone — free to play</span>
          </p>
        </div>
        <form action={join} className="shrink-0">
          <button
            type="submit"
            className="rounded-full bg-orange-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-800"
          >
            Join
          </button>
        </form>
      </div>
    </Card>
  );
}
