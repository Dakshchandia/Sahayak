import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Never bundle these on the server — they use Node.js native APIs
  // that webpack would otherwise replace with browser shims.
  serverExternalPackages: [
    "bcryptjs",
    "postgres",
    "nodemailer",
    "@electric-sql/pglite",
    "drizzle-orm",
  ],
  // Explicitly set the project root so Next.js doesn't search parent dirs
  // for lockfiles and warn about multiple package-lock.json files.
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "cloudflare:workers": false,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
