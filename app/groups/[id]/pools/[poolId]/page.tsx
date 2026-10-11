import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addPoolPlayers, deleteEntry, updatePool } from "@/lib/actions";
import { Card, SectionTitle, Field, inputClass, SubmitButton, DangerButton } from "@/components/ui";
import PoolEntryPicker from "@/components/pool-entry-picker";

function fmtLock(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// lock_at (UTC) -> datetime-local value in Eastern.
function etInputValue(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function PoolPage({
  params,
}: {
  params: Promise<{ id: string; poolId: string }>;
}) {
  const { id, poolId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: pool } = await supabase.from("pools").select("*").eq("id", poolId).single();
  if (!pool) redirect(`/groups/${id}`);

  const { data: players } = await supabase
    .from("pool_players")
    .select("id, name, team, salary")
    .eq("pool_id", poolId)
    .order("salary", { ascending: false });
  const playerList = (players ?? []) as any[];
  const playerById = new Map(playerList.map((p) => [p.id, p]));

  const { data: entries } = await supabase
    .from("pool_entries")
    .select("id, user_id, profiles(display_name)")
    .eq("pool_id", poolId);
  const entryList = (entries ?? []) as any[];

  const { data: picks } = await supabase
    .from("pool_entry_picks")
    .select("entry_id, player_id")
    .in("entry_id", entryList.map((e) => e.id));
  const picksByEntry = new Map<string, any[]>();
  for (const pk of (picks ?? []) as any[]) {
    const arr = picksByEntry.get(pk.entry_id) ?? [];
    const pl = playerById.get(pk.player_id);
    if (pl) arr.push(pl);
    picksByEntry.set(pk.entry_id, arr);
  }

  const myEntry = entryList.find((e) => e.user_id === user.id);
  const myPicks = myEntry ? (picksByEntry.get(myEntry.id) ?? []) : [];
  const locked = new Date(pool.lock_at).getTime() <= Date.now();
  const isCommish = pool.created_by === user.id;

  const addPlayers = addPoolPlayers.bind(null, poolId);
  const removeEntry = deleteEntry.bind(null, poolId);
  const savePool = updatePool.bind(null, poolId);

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <div className="text-center">
        <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide">{pool.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          ${pool.budget} cap · {pool.roster_size} players · {entryList.length}{" "}
          {entryList.length === 1 ? "entry" : "entries"} ·{" "}
          {locked ? (
            <span className="font-semibold text-red-600">locked</span>
          ) : (
            <span>
              locks <span className="font-semibold">{fmtLock(pool.lock_at)} ET</span>
            </span>
          )}
        </p>
      </div>

      {pool.description && (
        <Card>
          <SectionTitle>How it works</SectionTitle>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{pool.description}</p>
        </Card>
      )}

      {isCommish && !locked && entryList.length === 0 && (
        <Card>
          <SectionTitle>Edit pool</SectionTitle>
          <form action={savePool} className="space-y-4">
            <Field label="Name">
              <input name="name" required maxLength={120} defaultValue={pool.name} className={inputClass} />
            </Field>
            <Field label="Rules (shown to everyone)">
              <textarea
                name="description"
                rows={6}
                maxLength={2000}
                defaultValue={pool.description ?? ""}
                placeholder={"Pick 5 players under $40. Scoring: ..."}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Salary cap ($)">
                <input name="budget" type="number" min={1} max={10000} defaultValue={pool.budget} className={inputClass} />
              </Field>
              <Field label="Players per entry">
                <input name="roster_size" type="number" min={1} max={20} defaultValue={pool.roster_size} className={inputClass} />
              </Field>
            </div>
            <Field label="Picks lock (Eastern)">
              <input name="lock_at" type="datetime-local" required defaultValue={etInputValue(pool.lock_at)} className={inputClass} />
            </Field>
            <SubmitButton>Save changes</SubmitButton>
          </form>
        </Card>
      )}

      {playerList.length === 0 ? (
        <Card>
          <SectionTitle>Add the player pool</SectionTitle>
          <form action={addPlayers} className="space-y-4">
            <Field label='One per line: Name, TEAM, salary'>
              <textarea
                name="players"
                rows={10}
                required
                placeholder={"Shohei Ohtani, LAD, 10\nJacob Misiorowski, MIL, 10\nMookie Betts, LAD, 9"}
                className={`${inputClass} font-mono`}
              />
            </Field>
            <SubmitButton>Save players</SubmitButton>
          </form>
        </Card>
      ) : (
        <>
          {!locked && !myEntry && (
            <PoolEntryPicker
              poolId={poolId}
              players={playerList}
              budget={pool.budget}
              rosterSize={pool.roster_size}
            />
          )}

          {!locked && myEntry && (
            <Card className="border-green-200 bg-green-50">
              <p className="font-semibold">You&rsquo;re in.</p>
              <p className="mt-1 text-sm text-slate-600">
                {myPicks.map((p: any) => `${p.name} ($${p.salary})`).join(" · ")}
              </p>
              <form action={removeEntry} className="mt-3">
                <DangerButton>Change my picks</DangerButton>
              </form>
            </Card>
          )}

          {locked && !myEntry && (
            <Card>
              <p className="text-sm text-slate-500">Picks locked — you didn&rsquo;t get an entry in.</p>
            </Card>
          )}

          <div>
            <SectionTitle>Who&rsquo;s in</SectionTitle>
            {entryList.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">No entries yet. Be the first.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {entryList.map((e: any) => (
                  <Card key={e.id}>
                    <p className="font-semibold">
                      {e.profiles?.display_name ?? "Player"}
                      {e.user_id === user.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {(picksByEntry.get(e.id) ?? [])
                        .map((p: any) => `${p.name} ($${p.salary})`)
                        .join(" · ")}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
