import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["@libsql/client", "libsql", "nodemailer"],
  poweredByHeader: false,
  experimental: {
    // The app is fronted by a Cloudflare Pages proxy at createva.skinticals.com
    // (see cf-proxy/), which forwards requests to this Worker's own
    // *.workers.dev host. Browsers send Origin: https://createva.skinticals.com
    // on every Server Action POST (form submissions, e.g. admin login), but
    // Next.js's built-in CSRF check otherwise only trusts the Worker's own
    // host — without this, every Server Action fails with a same-origin
    // mismatch when accessed through the custom domain, even though plain
    // page loads (GET) work fine.
    serverActions: {
      allowedOrigins: ["createva.skinticals.com", "creator-academy.hardcorgamingstyle.workers.dev"],
    },
  },
  // @libsql/client (and its transitive @libsql/isomorphic-ws dependency)
  // resolve to different files under the "workerd" export condition, used
  // when deploying to Cloudflare via @opennextjs/cloudflare. Next's file
  // tracing only follows the Node.js resolution path, so those files get
  // pruned from the standalone output unless explicitly included here.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@libsql/client/lib-esm/web.js",
      "./node_modules/@libsql/isomorphic-ws/web.mjs",
      "./node_modules/@libsql/isomorphic-ws/web.cjs",
    ],
  },
};

export default nextConfig;
