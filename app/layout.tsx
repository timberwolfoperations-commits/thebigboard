import type { Metadata } from "next";
import Link from "next/link";
import { Barlow_Condensed } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/AuthButtons";
import "./globals.css";

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  title: "The Big Board",
  description: "Friendly bets, settled properly. The unbreakable contract for friend groups.",
  openGraph: {
    title: "The Big Board",
    description:
      "Bet your friends on anything. Written down, both sides sign off, points live forever.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "The Big Board",
    description:
      "Bet your friends on anything. Written down, both sides sign off, points live forever.",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className={barlow.variable}>
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center bg-slate-900 font-display text-lg font-bold text-white"
              >
                B
              </span>
              <span className="flex h-7 items-center font-display text-2xl font-bold uppercase leading-none tracking-wide">
                The Big Board
              </span>
            </Link>
            {user && (
              <div className="flex items-center gap-4">
                <Link href="/scoring" className="text-sm text-slate-500 underline-offset-4 hover:underline">
                  Scoring
                </Link>
                <SignOutButton />
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
