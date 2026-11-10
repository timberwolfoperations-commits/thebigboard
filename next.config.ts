import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Router Cache (perceived-speed pass): keep a visited page's
    // render for 30s so flipping back to a tab you just left is
    // instant instead of a full server rebuild. Every mutation in
    // the app already calls revalidatePath/router.refresh, so
    // post-action freshness does not rely on this cache being 0.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
