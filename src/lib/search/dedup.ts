/**
 * Dedup candidates against each other and against the existing board.
 *
 * Two-pass:
 *   1. URL exact match (normalized — strip query string, trailing slash,
 *      lowercase host).
 *   2. (company, role) fuzzy — normalize whitespace + case, exact string
 *      match after normalization. Not Levenshtein-y yet; can layer that
 *      on later if it's a problem in practice.
 */
import { prisma } from "@/lib/db";
import type { Candidate } from "./candidate";

export async function dedupAgainstBoard(input: Candidate[]): Promise<Candidate[]> {
  // Fetch minimum fields from existing jobs to build the seen sets.
  const existing = await prisma.job.findMany({
    select: { sourceUrl: true, company: true, role: true },
  });

  const seenUrls = new Set<string>();
  const seenPairs = new Set<string>();
  for (const j of existing) {
    if (j.sourceUrl) seenUrls.add(canonUrl(j.sourceUrl));
    seenPairs.add(pairKey(j.company, j.role));
  }

  const out: Candidate[] = [];
  for (const c of input) {
    if (!c.sourceUrl) continue; // grounded output with no URL is worthless
    const url = canonUrl(c.sourceUrl);
    const pair = pairKey(c.company, c.role);
    if (seenUrls.has(url)) continue;
    if (seenPairs.has(pair)) continue;
    seenUrls.add(url);
    seenPairs.add(pair);
    out.push(c);
  }
  return out;
}

/**
 * Canonicalize a job URL for dedup. We KEEP the query string because many
 * ATS boards encode the job id in it (e.g. Stripe's Greenhouse:
 * `stripe.com/jobs/search?gh_jid=…` — every posting has the same path).
 * We only strip fragments and marketing-tracking params so the same job
 * with different tracking tags doesn't look distinct.
 */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gh_src",
  "ref",
  "source",
  "referrer",
  "mc_cid",
  "mc_eid",
  "fbclid",
  "gclid",
]);

function canonUrl(u: string): string {
  try {
    const url = new URL(u);
    for (const p of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAMS.has(p.toLowerCase())) url.searchParams.delete(p);
    }
    url.hash = "";
    // Sort remaining params so stable across sources emitting them in
    // different orders.
    url.searchParams.sort();
    let path = url.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    const qs = url.searchParams.toString();
    return `${url.protocol}//${url.host.toLowerCase()}${path}${qs ? `?${qs}` : ""}`;
  } catch {
    return u.trim().toLowerCase();
  }
}

function pairKey(company: string, role: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(company)}::${norm(role)}`;
}
