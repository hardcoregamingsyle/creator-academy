/**
 * Reverse proxy so createva.skinticals.com (external DNS at GoDaddy, no
 * Cloudflare zone) can front the real app, which runs as a Cloudflare
 * Worker at ORIGIN. Pages custom domains support external CNAME without
 * owning the zone; Workers custom domains do not — this project exists
 * purely to bridge that gap. It has no logic of its own.
 */
const ORIGIN = "https://creator-academy.hardcorgamingstyle.workers.dev";

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, ORIGIN);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = new Request(target, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
  });

  const response = await fetch(upstream);

  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location) {
    const rewritten = new URL(location, ORIGIN);
    if (rewritten.origin === ORIGIN) {
      rewritten.protocol = url.protocol;
      rewritten.host = url.host;
      const headers = new Headers(response.headers);
      headers.set("location", rewritten.toString());
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  }

  return response;
};
