"use client";

import { useState } from "react";
import { refreshScores } from "@/lib/actions";

// Commish pulls fresh scores mid-game, both sports. The sync runs
// server-side with the service key — the CRON_SECRET never touches
// the client.
export default function RefreshScoresButton() {
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState("");

  async function run() {
    setBusy(true);
    setDetail("");
    try {
      const r = await refreshScores();
      setDetail(`Synced ${r.games_upserted} games, ${r.stat_lines_upserted} stat lines.`);
    } catch (e: any) {
      setDetail(e?.message ?? "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
      >
        {busy ? "Syncing…" : "Refresh scores"}
      </button>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
    </div>
  );
}
