import type { Metadata } from "next";
import Link from "next/link";
import { Card, SectionTitle } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy Policy — The Big Board",
  description: "How The Big Board collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-slate-600">Effective November 14, 2026</p>

      <Card className="mt-6 space-y-6">
        <section>
          <SectionTitle>What we collect</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            When you sign in with Google, we receive your name, email address,
            and profile photo. Inside the app, we store what you do here: the
            groups you join, the pools you enter, your picks, bets, quiz and
            poker play, and your display name and avatar choices. We also
            collect anonymous usage measurements (page views and load times)
            through Vercel Analytics, which does not track you across other
            sites.
          </p>
        </section>

        <section>
          <SectionTitle>How we use it</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            To run the competitions: keep score, show leaderboards, settle
            bets, and send the notifications you turn on — only your-move
            reminders and your results. We do not use your information for
            advertising.
          </p>
        </section>

        <section>
          <SectionTitle>Who processes it</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            Your data is stored and processed by the services that run the
            app: Supabase (database and sign-in), Vercel (hosting and
            analytics), and Google (sign-in only). We do not sell your
            information, and we do not share it with advertisers or data
            brokers.
          </p>
        </section>

        <section>
          <SectionTitle>Your choices</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            You can change your display name and avatar on your profile page,
            and turn notifications off there or in your browser settings. To
            have your account and its data deleted, email{" "}
            <a
              href="mailto:mpizzuto193@gmail.com"
              className="font-medium text-slate-900 underline"
            >
              mpizzuto193@gmail.com
            </a>{" "}
            from the address you signed in with, and we will remove it.
          </p>
        </section>

        <section>
          <SectionTitle>Children</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            The Big Board is for adults 18 and over. We do not knowingly
            collect information from anyone under 18.
          </p>
        </section>

        <section>
          <SectionTitle>Changes</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            If this policy changes, we will update this page and the effective
            date above. Questions about this policy can go to{" "}
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
        <Link href="/terms" className="font-medium text-slate-900 underline">
          Terms of Service
        </Link>
      </p>
    </div>
  );
}
