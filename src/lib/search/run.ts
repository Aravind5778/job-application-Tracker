/**
 * Search orchestrator — the "Find new jobs" pipeline.
 *
 * Steps:
 *   1. Load profile + config + existing jobs.
 *   2. Fan out in parallel:
 *      - ATS-feed fetches for every configured company
 *      - Gemini grounded searches for the profile query + saved queries
 *   3. Dedup against the board and within the freshly-collected pool.
 *   4. Batch-score every survivor with Gemini Flash-Lite.
 *   5. Auto-provision a "Suggested" column if needed.
 *   6. Insert all scored candidates into Suggested (top of column, score
 *      order) with the score + one-line reason saved as the note.
 *   7. Kick off kit generation for the top 3 as a background promise —
 *      the API route returns before they complete.
 */
import { prisma } from "@/lib/db";
import { getProfile, isProfileEmpty } from "@/lib/profile";
import { createJob } from "@/lib/jobs";
import { generateKit } from "@/lib/kits";
import { getSearchConfig, type SearchConfig } from "./config";
import { fetchAllAtsFeeds } from "./ats-feeds";
import { runGroundedSearches } from "./grounded-search";
import { dedupAgainstBoard } from "./dedup";
import { scoreCandidates } from "./score";
import type { ScoredCandidate } from "./candidate";
import type { ProfileDTO } from "@/lib/profile";

const SUGGESTED_COLUMN_NAME = "Suggested";
const AUTO_KIT_TOP_N = 3;
const SCORE_INSERT_THRESHOLD = 40; // don't insert obvious noise
// Scoring is a single batched Gemini call; too many candidates blows the
// output-token budget. Pre-filter (keyword match) narrows the pool
// before we spend model tokens on it.
const MAX_SCORE_BATCH = 50;

export type SearchResult = {
  ok: boolean;
  error?: string;
  totals: {
    atsFetched: number;
    groundedFetched: number;
    afterDedup: number;
    inserted: number;
    autoKitQueued: number;
  };
  atsErrors: Array<{ feed: string; error: string }>;
  groundedErrors: Array<{ query: string; error: string }>;
  /** The scored candidates that were inserted, in display order. */
  inserted: Array<ScoredCandidate & { jobId: string }>;
};

export async function runSearch(): Promise<SearchResult> {
  const profile = await getProfile();
  if (isProfileEmpty(profile)) {
    return errorResult("Fill in your profile before running a search.");
  }
  const config = await getSearchConfig();
  const queries = buildQueryList(profile, config);

  if (config.atsFeeds.length === 0 && queries.length === 0) {
    return errorResult(
      "No search sources configured. Add saved queries or ATS feeds in Settings, or fill in your profile background.",
    );
  }

  // 1. Fan out — ATS feeds and grounded searches in parallel.
  const [atsResults, groundedResults] = await Promise.all([
    fetchAllAtsFeeds(config.atsFeeds),
    runGroundedSearches(queries, profile, config),
  ]);

  const atsCandidates = atsResults.flatMap((r) => r.candidates);
  const groundedCandidates = groundedResults.flatMap((r) => r.candidates);
  const atsErrors = atsResults
    .filter((r) => r.error)
    .map((r) => ({ feed: `${r.feed.source}:${r.feed.slug}`, error: r.error! }));
  const groundedErrors = groundedResults
    .filter((r) => r.error)
    .map((r) => ({ query: r.query, error: r.error! }));

  // 2. Dedup: board + within-batch.
  const deduped = await dedupAgainstBoard([
    ...atsCandidates,
    ...groundedCandidates,
  ]);

  // 2a. Pre-score keyword filter. Big ATS boards (Stripe: ~500 open
  // roles) would blow the scorer's output-token budget if we sent them
  // all. Filter by role-keyword match against the profile before
  // spending model tokens.
  const keywords = extractProfileKeywords(profile);
  const preFiltered =
    keywords.length > 0 && deduped.length > MAX_SCORE_BATCH
      ? deduped.filter((c) => hasKeywordMatch(c.role, keywords))
      : deduped;
  const capped = preFiltered.slice(0, MAX_SCORE_BATCH);

  // 3. Score.
  const scored = await scoreCandidates(capped, profile);
  const kept = scored.filter((c) => c.score >= SCORE_INSERT_THRESHOLD);

  // 4. Insert into Suggested column, provisioning it if missing.
  const suggestedColumnId = await ensureSuggestedColumn();
  const inserted: Array<ScoredCandidate & { jobId: string }> = [];
  for (const c of kept) {
    try {
      const created = await createJob({
        columnId: suggestedColumnId,
        company: c.company,
        role: c.role,
        location: c.location ?? undefined,
        source: c.discoveredVia === "grounded" ? "url" : "url",
        sourceUrl: c.sourceUrl,
        listingText: c.listingText || `${c.role} at ${c.company}`,
        notes: `Score ${c.score}/100 · ${c.discoveredVia} · ${c.reason}`,
      });
      inserted.push({ ...c, jobId: created.id });
    } catch {
      // Skip failures (validation errors on empty fields, etc.) rather
      // than abort the whole run.
    }
  }

  // 5. Fire-and-forget kit generation for the top N.
  const topForKits = inserted.slice(0, AUTO_KIT_TOP_N);
  void generateKitsInBackground(topForKits.map((c) => c.jobId));

  return {
    ok: true,
    totals: {
      atsFetched: atsCandidates.length,
      groundedFetched: groundedCandidates.length,
      afterDedup: deduped.length,
      inserted: inserted.length,
      autoKitQueued: topForKits.length,
    },
    atsErrors,
    groundedErrors,
    inserted,
  };
}

// ---------------------------------------------------------------------------

/**
 * Extract a small keyword set from the profile to pre-filter big ATS
 * boards down to plausibly-relevant role titles. Keeps well-known role
 * tokens ("engineer", "devops", "sre", "platform"…) plus anything that
 * looks like a proper-noun tool (Kubernetes, Terraform, AWS, GCP…).
 * Very rough — the AI scorer does the real judgment after.
 */
const ROLE_TOKENS = [
  "engineer",
  "developer",
  "architect",
  "sre",
  "devops",
  "devsecops",
  "platform",
  "cloud",
  "infrastructure",
  "infra",
  "reliability",
  "backend",
  "systems",
  "kubernetes",
  "k8s",
  "terraform",
];

function extractProfileKeywords(profile: {
  resumeText: string;
  backgroundNote: string;
}): string[] {
  const text = (profile.resumeText + " " + profile.backgroundNote).toLowerCase();
  return ROLE_TOKENS.filter((t) => text.includes(t));
}

function hasKeywordMatch(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function buildQueryList(profile: ProfileDTO, config: SearchConfig): string[] {
  const saved = config.savedQueries.filter((q) => q.trim());
  if (saved.length > 0) {
    // Always run the saved queries; profile-derived is a fallback.
    return saved;
  }
  const bits: string[] = [];
  const bg = profile.backgroundNote.trim();
  if (bg) {
    // Take the first ~200 chars as the "what I'm looking for" seed.
    bits.push(bg.slice(0, 200));
  } else if (profile.resumeText.trim()) {
    // Try to pull a role title from the first ~500 chars of the résumé.
    const head = profile.resumeText.slice(0, 500);
    const roleMatch = head.match(
      /\b(devops|sre|platform|cloud|infrastructure|backend|frontend|full[-\s]?stack|data|ml|security)[a-z\s/]{0,40}engineer\b/i,
    );
    bits.push(
      roleMatch
        ? `${roleMatch[0]} jobs`
        : "senior engineer jobs matching my résumé",
    );
  }
  if (bits.length === 0) return [];
  const q = bits[0];
  const parts: string[] = [q];
  if (config.location) parts.push(config.location);
  if (config.seniority) parts.push(config.seniority);
  return [parts.join(" — ")];
}

// ---------------------------------------------------------------------------

async function ensureSuggestedColumn(): Promise<string> {
  const existing = await prisma.column.findFirst({
    where: { name: SUGGESTED_COLUMN_NAME },
  });
  if (existing) return existing.id;

  // Provision at the top of the board (smallest order value).
  const min = await prisma.column.aggregate({ _min: { order: true } });
  const nextOrder = (min._min.order ?? 10) - 10;
  const created = await prisma.column.create({
    data: {
      name: SUGGESTED_COLUMN_NAME,
      order: nextOrder,
      isTerminal: false,
    },
  });
  return created.id;
}

// ---------------------------------------------------------------------------

function generateKitsInBackground(jobIds: string[]): Promise<void> {
  // These run after the API response is sent. The Next dev / node
  // process keeps them alive; individual failures don't affect the
  // response the user already got.
  return Promise.allSettled(jobIds.map((id) => generateKit(id))).then(
    () => undefined,
  );
}

// ---------------------------------------------------------------------------

function errorResult(msg: string): SearchResult {
  return {
    ok: false,
    error: msg,
    totals: {
      atsFetched: 0,
      groundedFetched: 0,
      afterDedup: 0,
      inserted: 0,
      autoKitQueued: 0,
    },
    atsErrors: [],
    groundedErrors: [],
    inserted: [],
  };
}
