import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["@libsql/client", "libsql", "nodemailer"],
  poweredByHeader: false,
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
