import { Card, Field, SubmitButton, inputClass } from "@/components/ui";
import BotTag from "@/components/bot-tag";
import {
  BOT_PERSONALITIES,
  MAX_BOTS_PER_POOL,
  botPersonalityLabel,
} from "@/lib/pickem-bots";

// Commish-only bot staffing for a standard pick'em pool: who's running,
// plus the add-a-bot form (name pre-filled with the next suggestion —
// edit it or don't) and a remove button per bot. Adding writes the
// bot's whole card immediately, for every game that hasn't kicked off;
// there is no edit, because a bot never changes its mind.

export interface PoolBot {
  id: string;
  name: string;
  personality: string;
}

export default function PickemBotCard({
  bots,
  suggestedName,
  canAdd,
  addAction,
  removeAction,
}: {
  bots: PoolBot[];
  suggestedName: string;
  // False once the pool is settled — a settled pool's board is final.
  canAdd: boolean;
  addAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
}) {
  const atCap = bots.length >= MAX_BOTS_PER_POOL;
  return (
    <Card>
      <p className="font-display text-lg font-semibold uppercase tracking-wide">Bots</p>
      <p className="mt-1 text-sm text-slate-500">
        Staff the pool with auto-pickers. They play for pride — never the pot,
        never the lifetime board.
      </p>

      {bots.length > 0 && (
        <div className="mt-3 space-y-2">
          {bots.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm">
                <span className="font-semibold">{b.name}</span>
                <BotTag />
                <span className="text-slate-500"> · {botPersonalityLabel(b.personality)}</span>
              </p>
              <form action={removeAction} className="shrink-0">
                <input type="hidden" name="bot_id" value={b.id} />
                <button
                  type="submit"
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {canAdd &&
        (atCap ? (
          <p className="mt-3 text-sm text-slate-500">
            That&rsquo;s {MAX_BOTS_PER_POOL} bots — cap reached. The humans are
            officially outnumbered.
          </p>
        ) : (
          <form action={addAction} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <Field label="Bot name">
              <input name="name" defaultValue={suggestedName} maxLength={40} className={inputClass} />
            </Field>
            <Field label="Personality">
              <select name="personality" defaultValue="chalk" className={inputClass}>
                {BOT_PERSONALITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} — {p.blurb}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                It picks every game that hasn&rsquo;t kicked off yet, right now,
                and never changes its mind.
              </p>
              <SubmitButton>Add bot</SubmitButton>
            </div>
          </form>
        ))}
    </Card>
  );
}
