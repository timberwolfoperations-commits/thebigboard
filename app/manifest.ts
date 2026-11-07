import type { MetadataRoute } from "next";

// Installable-app manifest (notifications groundwork): on iPhone,
// web push only exists for a site that's been added to the Home
// Screen, so the app has to be installable before it can tap anyone
// on the shoulder. Icons live in public/icons — black tile, cream B,
// same as the wordmark.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Big Board",
    short_name: "Big Board",
    description: "Friendly bets, settled properly — pools, pick'em, quizzes, and slow-play poker for friend groups.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#faf9f7",
    theme_color: "#141414",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
