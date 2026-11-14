// ------------------------------------------------- commissioner lockdown
// Pre-launch lockdown (2026-11-08): while COMMISSIONER_LOCKDOWN is on,
// only the site commissioner's account may CREATE or ADMINISTER
// contests — create groups/pools/tables/quizzes, manage roster-pool
// players and lines, enter stats, award/scratch, force-settle. Every
// other account can still PLAY everything: join, pick, bet, settle
// their own bets the normal way, take quizzes, play poker.
//
// Group-admin exemption (2026-11-13): a group's own admins may create
// and administer INSIDE their group during the lockdown — that is the
// whole point of the role (group_members.role = 'admin'). The
// exemption is group-scoped by construction: the role is always read
// for the group the action touches, so an admin of one group has no
// power in any other. Creating groups, and promoting/demoting admins,
// stay site-commissioner-only — a group admin must never be able to
// mint other admins.
//
// Launch day is a one-line change: set COMMISSIONER_LOCKDOWN = false
// (or delete this module and its call sites). Enforcement is
// server-side in the action files — lib/actions.ts, pickem-actions,
// survivor-actions, poker-actions, quiz-actions — via assertCanCreate
// / assertCanAdminister below. The UI demotion (components/
// use-commissioner.ts + the create menus/switchers) is only a
// courtesy; this module is the actual lock.
//
// This file is pure (no server imports) so client components can
// share the constants and the email check.

export const SITE_COMMISSIONER_EMAIL = "timberwolfoperations@gmail.com";

export const COMMISSIONER_LOCKDOWN = true;

export const LOCKDOWN_MESSAGE =
  "Creating is locked while The Big Board is in testing — Michael's running all the pools for now.";

export const LOCKDOWN_ADMIN_MESSAGE =
  "Admin tools are locked while The Big Board is in testing — Michael's running all the pools for now.";

export function isSiteCommissioner(user: { email?: string | null } | null | undefined): boolean {
  return (
    !!user?.email &&
    user.email.trim().toLowerCase() === SITE_COMMISSIONER_EMAIL.toLowerCase()
  );
}

// True when this user may not create/administer right now.
export function creationLockedFor(user: { email?: string | null } | null | undefined): boolean {
  return COMMISSIONER_LOCKDOWN && !isSiteCommissioner(user);
}

// Server-action guards — call right after the action resolves the
// signed-in user. They throw the friendly lockdown error; when the
// lockdown is off (or the caller IS the commissioner) they're no-ops,
// so every existing role check (group member, pool commish, group
// admin) keeps doing its own job underneath.
export function assertCanCreate(user: { email?: string | null } | null | undefined): void {
  if (creationLockedFor(user)) throw new Error(LOCKDOWN_MESSAGE);
}

export function assertCanAdminister(user: { email?: string | null } | null | undefined): void {
  if (creationLockedFor(user)) throw new Error(LOCKDOWN_ADMIN_MESSAGE);
}

export type GroupRole = "admin" | "member";

// Group-scoped variants: pass the caller's group_members role for the
// group the action touches. A group admin passes inside their own
// group; everyone else faces the same lockdown as before. Creating a
// group has no group to scope to, so it keeps the global guard above.
export function creationLockedForGroup(
  user: { email?: string | null } | null | undefined,
  role: GroupRole | null | undefined,
): boolean {
  return COMMISSIONER_LOCKDOWN && !isSiteCommissioner(user) && role !== "admin";
}

export function assertCanCreateForGroup(
  user: { email?: string | null } | null | undefined,
  role: GroupRole | null | undefined,
): void {
  if (creationLockedForGroup(user, role)) throw new Error(LOCKDOWN_MESSAGE);
}

export function assertCanAdministerForGroup(
  user: { email?: string | null } | null | undefined,
  role: GroupRole | null | undefined,
): void {
  if (creationLockedForGroup(user, role)) throw new Error(LOCKDOWN_ADMIN_MESSAGE);
}
