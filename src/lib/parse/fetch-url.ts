/**
 * URL fetch with a 10s timeout and a desktop User-Agent string. Returns the
 * response body as text (we don't trust Content-Length to give us the right
 * thing on ATS sites), plus the final URL after any redirects.
 *
 * Many tougher sites (LinkedIn, Workday) will respond with a login wall —
 * we don't try to detect that here; the caller's extraction logic will fail
 * predictably and the UI falls back to paste-text.
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Safari/605.1.15";

export type FetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; status: number; reason: string };

export async function fetchListing(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return {
        ok: false,
        status: res.status,
        reason: `Unexpected content-type: ${contentType}`,
      };
    }
    const html = await res.text();
    return { ok: true, html, finalUrl: res.url };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      reason: err instanceof Error ? err.message : "Network error.",
    };
  } finally {
    clearTimeout(timer);
  }
}
