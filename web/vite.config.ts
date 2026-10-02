import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": r("./src"),
      "@shared": r("./shared"),
    },
  },
  server: {
    port: 5173,
    // `npm run preview:pages` (wrangler pages dev) serves the API on 8788.
    proxy: { "/api": "http://127.0.0.1:8788", "/sitemap.xml": "http://127.0.0.1:8788" },
  },
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
});
