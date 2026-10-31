"use client";

import { useEffect } from "react";

// Remembers the pool/group you're looking at, so the Pools and Groups
// tabs can land back here when nothing else needs you. Cookies, 30
// days, no server round-trip.
export default function RememberContext({
  poolHref,
  groupId,
}: {
  poolHref?: string;
  groupId?: string;
}) {
  useEffect(() => {
    if (poolHref) {
      document.cookie = `bb-last-pool=${encodeURIComponent(poolHref)}; path=/; max-age=2592000; samesite=lax`;
    }
    if (groupId) {
      document.cookie = `bb-last-group=${groupId}; path=/; max-age=2592000; samesite=lax`;
    }
  }, [poolHref, groupId]);
  return null;
}
