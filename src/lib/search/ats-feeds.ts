/**
 * ATS-feed adapters — the "hybrid" side of the search pipeline.
 *
 * Greenhouse, Lever, and Ashby all publish public JSON feeds per company.
 * No LLM cost, no hallucination, deterministic — but limited to the
 * specific companies the user has told us to poll (stored in
 * SearchConfig.atsFeeds).
 *
 * All three normalize to a common `Candidate` shape.
 */
import type { AtsFeed, AtsSource } from "./config";
import type { Candidate } from "./candidate";

const FEED_TIMEOUT_MS = 10_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Safari/605.1.15";

export type FeedFetchResult = {
  feed: AtsFeed;
  candidates: Candidate[];
  error?: string;
};

export async function fetchAllAtsFeeds(
  feeds: AtsFeed[],
): Promise<FeedFetchResult[]> {
  // Parallel — one slow feed shouldn't block the others.
  return Promise.all(feeds.map((f) => fetchOne(f)));
}

async function fetchOne(feed: AtsFeed): Promise<FeedFetchResult> {
  try {
    const candidates = await fetchByProvider(feed);
    return { feed, candidates };
  } catch (err) {
    return {
      feed,
      candidates: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchByProvider(feed: AtsFeed): Promise<Candidate[]> {
  switch (feed.source as AtsSource) {
    case "greenhouse":
      return fetchGreenhouse(feed.slug, feed.label);
    case "lever":
      return fetchLever(feed.slug, feed.label);
    case "ashby":
      return fetchAshby(feed.slug, feed.label);
  }
}

// --- Greenhouse --------------------------------------------------------
// https://boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true

type GreenhouseJob = {
  id: number;
  absolute_url: string;
  title: string;
  content?: string;
  updated_at?: string;
  location?: { name?: string };
  offices?: Array<{ name?: string }>;
  company_name?: string;
};

async function fetchGreenhouse(
  slug: string,
  label?: string,
): Promise<Candidate[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    slug,
  )}/jobs?content=true`;
  const res = await fetchWithTimeout(url);
  const data = (await res.json()) as { jobs?: GreenhouseJob[] };
  const jobs = data.jobs ?? [];
  const company = label ?? slug;
  return jobs.map((j) => ({
    company: j.company_name ?? company,
    role: (j.title ?? "").trim() || "Untitled role",
    location:
      j.location?.name ?? j.offices?.[0]?.name ?? null,
    sourceUrl: j.absolute_url,
    listingText: stripHtml(j.content ?? ""),
    postedAt: j.updated_at,
    discoveredVia: "greenhouse",
  }));
}

// --- Lever -------------------------------------------------------------
// https://api.lever.co/v0/postings/<slug>?mode=json

type LeverPosting = {
  id: string;
  hostedUrl: string;
  text: string; // role title
  description?: string;
  descriptionPlain?: string;
  createdAt?: number; // epoch ms
  categories?: { location?: string; team?: string; commitment?: string };
};

async function fetchLever(slug: string, label?: string): Promise<Candidate[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(
    slug,
  )}?mode=json`;
  const res = await fetchWithTimeout(url);
  const jobs = (await res.json()) as LeverPosting[];
  const company = label ?? slug;
  return (jobs ?? []).map((j) => ({
    company,
    role: j.text?.trim() || "Untitled role",
    location: j.categories?.location ?? null,
    sourceUrl: j.hostedUrl,
    listingText: (j.descriptionPlain ?? stripHtml(j.description ?? "")).trim(),
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
    discoveredVia: "lever",
  }));
}

// --- Ashby -------------------------------------------------------------
// https://api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true

type AshbyResponse = {
  jobs?: Array<{
    id: string;
    title: string;
    jobUrl: string;
    location?: string;
    department?: string;
    publishedDate?: string;
    descriptionPlain?: string;
    descriptionHtml?: string;
  }>;
};

async function fetchAshby(slug: string, label?: string): Promise<Candidate[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
    slug,
  )}?includeCompensation=true`;
  const res = await fetchWithTimeout(url);
  const data = (await res.json()) as AshbyResponse;
  const company = label ?? slug;
  return (data.jobs ?? []).map((j) => ({
    company,
    role: j.title?.trim() || "Untitled role",
    location: j.location ?? null,
    sourceUrl: j.jobUrl,
    listingText: (j.descriptionPlain ?? stripHtml(j.descriptionHtml ?? "")).trim(),
    postedAt: j.publishedDate,
    discoveredVia: "ashby",
  }));
}

// --- Helpers -----------------------------------------------------------

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html: string): string {
  // Very light HTML → text: replace tags with spaces, decode a few common
  // entities, collapse whitespace. Good enough for match-signal listing
  // snippets; full extraction isn't necessary here.
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
