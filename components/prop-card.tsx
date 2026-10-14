import { Card } from "@/components/ui";

// One prop row with Over/Under buttons — the over/under answer to
// PickemGameCard. Server-rendered: each button is a tiny form, so tapping
// just posts line_id + side. The picked side highlights; after lock the
// buttons go dead.

export interface PropCardLine {
  id: string;
  player_name: string;
  team: string | null;
  stat_label: string;
  line: number | string;
}

function SideButton({
  lineId,
  side,
  line,
  selected,
  disabled,
  action,
}: {
  lineId: string;
  side: "over" | "under";
  line: number | string;
  selected: boolean;
  disabled: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="flex-1">
      <input type="hidden" name="line_id" value={lineId} />
      <input type="hidden" name="side" value={side} />
      <button
        type="submit"
        disabled={disabled}
        className={`w-full rounded-xl border px-3 py-3 text-sm font-bold transition ${
          selected
            ? "border-[#c2410c] bg-[#c2410c] text-white"
            : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {side === "over" ? "Over" : "Under"} {String(line)}
      </button>
    </form>
  );
}

export default function PropCard({
  line,
  mySide,
  canPick,
  action,
}: {
  line: PropCardLine;
  mySide: string | null;
  canPick: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const sel = (mySide ?? "").toLowerCase();

  return (
    <Card>
      <p className="mb-1 text-center text-sm font-semibold text-slate-800">
        {line.player_name}
        {line.team && <span className="ml-1 font-normal text-slate-400">{String(line.team).toUpperCase()}</span>}
      </p>
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
        {line.stat_label}
      </p>
      <div className="flex items-center gap-2">
        <SideButton
          lineId={line.id}
          side="over"
          line={line.line}
          selected={sel === "over"}
          disabled={!canPick}
          action={action}
        />
        <SideButton
          lineId={line.id}
          side="under"
          line={line.line}
          selected={sel === "under"}
          disabled={!canPick}
          action={action}
        />
      </div>
      {mySide && (
        <p className="mt-2 text-center text-xs text-slate-500">
          You took {sel}
          {canPick ? <span className="text-slate-400"> · tap to change</span> : <span className="text-slate-400"> · locked</span>}
        </p>
      )}
    </Card>
  );
}
