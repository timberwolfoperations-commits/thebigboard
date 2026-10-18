"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignInButton({ next = "/dashboard" }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="font-display text-2xl font-bold uppercase tracking-wide">Check your email</p>
        <p className="mt-2 text-sm text-slate-600">
          We sent a sign-in link to <span className="font-semibold text-slate-900">{email.trim()}</span>.
          Tap it and you&rsquo;re in — no password needed.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <button
        onClick={signIn}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M21.35 11.1H12v2.9h5.35c-.5 2.4-2.55 3.5-5.35 3.5a5.9 5.9 0 0 1 0-11.8c1.5 0 2.9.55 3.95 1.45l2.1-2.1A8.9 8.9 0 0 0 12 2a9 9 0 0 0 0 18c5.2 0 8.65-3.65 8.65-8.8 0-.35-.03-.7-.3-1.1z"
          />
        </svg>
        {busy ? "Connecting…" : "Sign in with Google"}
      </button>

      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={sendLink} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          disabled={busy}
          className="min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-full border border-slate-900 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Email me a link"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-slate-400">No password — the link signs you straight in.</p>
    </div>
  );
}

export function SignOutButton() {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <button
      onClick={signOut}
      className="text-sm font-medium text-slate-500 underline-offset-4 hover:underline"
    >
      Sign out
    </button>
  );
}
