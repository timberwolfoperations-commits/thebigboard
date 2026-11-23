import type { Metadata } from "next";
import Link from "next/link";
import { Card, SectionTitle } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms of Service — The Big Board",
  description: "The rules for using The Big Board.",
};

export default function TermsPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-slate-600">Effective November 14, 2026</p>

      <Card className="mt-6 space-y-6">
        <section>
          <SectionTitle>What this is</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            The Big Board is a social scoreboard for friendly sports
            competitions among friends: head-to-head bets, pick&apos;em pools,
            survivor pools, quizzes, and slow-play poker. You must be 18 or
            older to use it.
          </p>
        </section>

        <section>
          <SectionTitle>Points, not money</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            Everything on The Big Board is played for points. Points have no
            cash value, cannot be redeemed, transferred, or cashed out. There
            is no real-money betting, wagering, or payouts on the service. If
            friends settle anything up between themselves outside the app,
            that is between them.
          </p>
        </section>

        <section>
          <SectionTitle>Your account</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            You sign in with your Google account and are responsible for what
            happens under it. Use your own name, do not impersonate anyone,
            and do not create extra accounts to game a competition. Group
            commissioners run their own groups and pools, and their rulings
            on their contests stand.
          </p>
        </section>

        <section>
          <SectionTitle>Fair play</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            No cheating, no fake accounts, no abusing the app or other
            players. We may remove content or close accounts that break these
            rules or spoil the game for everyone else.
          </p>
        </section>

        <section>
          <SectionTitle>Availability</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            The service is provided as-is. Scores come from public sports
            data feeds and can occasionally be delayed or corrected; when a
            correction lands, standings update to match it. We do our best to
            keep the site up, especially on game days, but we cannot guarantee
            uninterrupted access.
          </p>
        </section>

        <section>
          <SectionTitle>Changes</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            We may update these terms as the service grows. If we do, we will
            update this page and the effective date above. Questions can go
            to{" "}
            <a
              href="mailto:mpizzuto193@gmail.com"
              className="font-medium text-slate-900 underline"
            >
              mpizzuto193@gmail.com
            </a>
            .
          </p>
        </section>
      </Card>

      <p className="mt-6 text-center text-sm text-slate-600">
        See also:{" "}
        <Link href="/privacy" className="font-medium text-slate-900 underline">
          Privacy Policy
        </Link>
      </p>
    </div>
  );
}
