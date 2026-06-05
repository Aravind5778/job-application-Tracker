import { NextResponse } from "next/server";
import { fetchListing } from "@/lib/parse/fetch-url";
import { parseJobPostingJsonLd } from "@/lib/parse/jsonld";
import { extractReadable } from "@/lib/parse/readability";
import { extractMetaFromText } from "@/lib/parse/meta-extract";

/**
 * Parse a job listing from either a URL or pasted text.
 *
 * Body shape:
 *   { url: string }   — fetch + JSON-LD → Readability fallback
 *   { text: string }  — try Haiku meta extraction on the text
 *
 * Always returns the same DTO so the modal's two tabs share the same
 * downstream code:
 *   {
 *     ok: true,
 *     company?: string,
 *     role?: string,
 *     location?: string,
 *     listingText: string,
 *     sourceUrl?: string,
 *     extractor: "jsonld" | "readability" | "haiku" | "none",
 *     warning?: string,
 *   }
 *   or { ok: false, error: string, code?: "fetch_blocked" }
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const url = typeof b.url === "string" ? b.url.trim() : undefined;
  const text = typeof b.text === "string" ? b.text : undefined;

  if (url) return parseFromUrl(url);
  if (text) return parseFromText(text);
  return NextResponse.json(
    { ok: false, error: "Provide either `url` or `text`." },
    { status: 400 },
  );
}

async function parseFromUrl(url: string) {
  try {
    new URL(url);
  } catch {
    return NextResponse.json(
      { ok: false, error: "That doesn't look like a valid URL." },
      { status: 400 },
    );
  }

  const fetched = await fetchListing(url);
  if (!fetched.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "fetch_blocked",
        error: `Couldn't fetch the page (${fetched.reason}). Paste the listing instead.`,
      },
      { status: 200 }, // user-actionable, not a server failure
    );
  }

  // Try JSON-LD first — it gives us clean fields with no heuristics.
  const ld = parseJobPostingJsonLd(fetched.html);
  if (ld && ld.description && ld.description.length > 200) {
    return NextResponse.json({
      ok: true,
      company: ld.company,
      role: ld.title,
      location: ld.location,
      listingText: ld.description,
      sourceUrl: fetched.finalUrl,
      extractor: "jsonld" as const,
    });
  }

  // Fall back to Mozilla Readability for sites without JobPosting schema.
  const readable = extractReadable(fetched.html, fetched.finalUrl);
  if (!readable || readable.textContent.length < 200) {
    return NextResponse.json(
      {
        ok: false,
        code: "fetch_blocked",
        error:
          "Fetched the page but couldn't find listing-shaped content. " +
          "The site may require login. Paste the listing instead.",
      },
      { status: 200 },
    );
  }

  // Best-effort role guess from the page title.
  return NextResponse.json({
    ok: true,
    role: readable.title,
    listingText: readable.textContent,
    sourceUrl: fetched.finalUrl,
    extractor: "readability" as const,
    warning:
      "Pulled the page text but didn't find structured job metadata. " +
      "Double-check company/role before saving.",
  });
}

async function parseFromText(text: string) {
  const cleaned = text.trim();
  if (cleaned.length < 40) {
    return NextResponse.json(
      { ok: false, error: "Listing text is too short to extract from." },
      { status: 400 },
    );
  }

  const meta = await extractMetaFromText(cleaned);
  if (!meta) {
    return NextResponse.json({
      ok: true,
      listingText: cleaned,
      extractor: "none" as const,
      warning:
        "AI meta-extraction is unavailable (no API key configured) — " +
        "fill in company and role yourself.",
    });
  }

  return NextResponse.json({
    ok: true,
    company: meta.company,
    role: meta.role,
    location: meta.location,
    listingText: cleaned,
    extractor: "haiku" as const,
  });
}
