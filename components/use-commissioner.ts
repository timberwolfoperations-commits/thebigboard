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
//
// Group-aware (2026-11-13): pass the group the menu belongs to and a
// group admin sees the creation items for THAT group — the same
// exemption the server actions enforce. Without a groupId (global
// menus: new group, header) only the site commissioner passes,
// because creating a group has no group to scope to.
export function useCanCreate(groupId?: string): boolean {
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
        if (!user) return;
        if (isSiteCommissioner(user)) {
          if (live) setCanCreate(true);
          return;
        }
        if (!groupId) {
          if (live) setCanCreate(false);
          return;
        }
        const { data } = await supabase
          .from("group_members")
          .select("role")
          .eq("group_id", groupId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (live) setCanCreate(data?.role === "admin");
      } catch {
        // If the check fails, leave the buttons — the server decides.
      }
    })();
    return () => {
      live = false;
    };
  }, [groupId]);

  return canCreate;
}
