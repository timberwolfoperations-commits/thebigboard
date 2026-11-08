"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COMMISSIONER_LOCKDOWN, isSiteCommissioner } from "@/lib/commissioner";

// UI-demotion helper for the create menus/switchers: during the
// commissioner lockdown (lib/commissioner.ts), non-commissioners
// don't see creation entry points at all. This is a courtesy only —
// the server actions enforce the lock for real. Defaults to TRUE
// while the check runs (and whenever the lockdown is off), so the
// commissioner's own UI never flickers or loses its buttons; a
// non-commissioner's buttons disappear a beat after load, and the
// server would refuse the action anyway.
export function useCanCreate(): boolean {
  const [canCreate, setCanCreate] = useState(true);

  useEffect(() => {
    if (!COMMISSIONER_LOCKDOWN) return;
    let live = true;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (live) setCanCreate(isSiteCommissioner(user));
      } catch {
        // If the check fails, leave the buttons — the server decides.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return canCreate;
}
