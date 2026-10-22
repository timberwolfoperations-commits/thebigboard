import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Google sends the user back here after sign-in, and email magic links land
// here too. We swap the one-time `code` (OAuth) or `token_hash` (magic link)
// for a session, then send them where they were headed.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (code || (token_hash && type)) {
    const supabase = await createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: token_hash as string });
    if (!error) {
      // Store the name Google provided. The signup trigger only sees the
      // metadata present the moment the account is created, so anyone who
      // first arrived by magic link is stuck with their email prefix even
      // after they later sign in with Google. On every sign-in, fill the
      // profile name from Google when the current one is still that
      // auto-default (blank or the email prefix). A name the user typed
      // on the Profile page is never overwritten.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const rawName = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
      const googleName = typeof rawName === "string" ? rawName.trim() : "";
      if (user && googleName) {
        const emailPrefix = user.email?.split("@")[0];
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();
        const current = profile?.display_name?.trim();
        if (profile && (!current || current === emailPrefix)) {
          await supabase.from("profiles").update({ display_name: googleName }).eq("id", user.id);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
