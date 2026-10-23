// The BOT tag: rides next to a bot's name everywhere it appears
// (pool leaderboard, pick reveals, Pools-tab standings) so a bot is
// identifiable at a glance. Muted slate, same pill language as the
// variant tags — no new colors, no emoji.
export default function BotTag() {
  return (
    <span className="ml-1.5 inline-block rounded-full bg-slate-100 px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wider text-slate-500">
      Bot
    </span>
  );
}
