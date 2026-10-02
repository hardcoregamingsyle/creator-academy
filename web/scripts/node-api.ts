/**
 * Runs the Pages Functions API in plain Node (no Cloudflare needed) against a
 * local SQLite file, for development and testing:
 *
 *   npm run dev:api     # http://127.0.0.1:8788, the target of vite's /api proxy
 *
 * Config comes from web/.env.local (see .env.example); the defaults below are
 * dev-only.
 */
import http from "node:http";
import { Readable } from "node:stream";

try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url));
} catch {
  // no .env.local — defaults below apply
}

process.env.DATABASE_URL ||= "file:../data/academy.db";
process.env.ADMIN_PASSWORD ||= "admin12345";
process.env.SESSION_SECRET ||= "dev-only-secret";
process.env.SITE_URL ||= "http://localhost:5173";

const PORT = Number(process.env.PORT || 8788);

// Dynamic import: the app reads process.env while its modules load, so the
// defaults above must be in place first (static imports are hoisted).
const { default: app } = await import("../functions/_routes/app");

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? `127.0.0.1:${PORT}`;
    const url = new URL(req.url ?? "/", `http://${host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) for (const v of value) headers.append(key, v);
      else if (value !== undefined) headers.set(key, value);
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
      duplex: "half",
    } as RequestInit);

    const response = await app.fetch(request, process.env as Record<string, string | undefined>);

    res.statusCode = response.status;
    res.statusMessage = response.statusText;
    const setCookies = response.headers.getSetCookie();
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") res.setHeader(key, value);
    });
    if (setCookies.length) res.setHeader("set-cookie", setCookies);

    if (response.body) res.end(Buffer.from(await response.arrayBuffer()));
    else res.end();
  } catch (err) {
    console.error("[node-api] unhandled error:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, message: "Something went wrong. Please try again." }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${PORT} (DATABASE_URL=${process.env.DATABASE_URL})`);
});
