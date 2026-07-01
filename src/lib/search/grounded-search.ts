/**
 * Grounded job discovery via Gemini 2.5 Flash + Google Search tool.
 *
 * Gemini doesn't let us combine `tools: [{ googleSearch }]` with
 * `responseJsonSchema`, so the model can't be forced into a strict shape
 * on this call. We prompt it hard to output ONLY a JSON array, strip
 * markdown fences if present, JSON.parse, and defensively validate each
 * candidate. Bad rows are dropped, not thrown.
 */
import { getGoogleClient, MODELS } from "@/lib/ai/client";
import type { ProfileDTO } from "@/lib/profile";
import type { SearchConfig } from "./config";
import type { Candidate } from "./candidate";

export type GroundedRun = {
  query: string;
  candidates: Candidate[];
  error?: string;
};

/**
 * Runs one grounded search per query. Returns per-query results so the
 * caller can attribute counts back to specific queries in the UI.
 */
export async function runGroundedSearches(
  queries: string[],
  profile: ProfileDTO,
  config: SearchConfig,
): Promise<GroundedRun[]> {
  const client = await getGoogleClient();
  if (!client) {
    return queries.map((q) => ({
      query: q,
      candidates: [],
      error: "No Google API key configured.",
    }));
  }
  // Sequential — Gemini free tier has a low per-minute rate limit and
  // grounded search is heavier than a plain call.
  const out: GroundedRun[] = [];
  for (const q of queries) {
    out.push(await runOne(client, q, profile, config));
  }
  return out;
}

async function runOne(
  client: NonNullable<Awaited<ReturnType<typeof getGoogleClient>>>,
  query: string,
  profile: ProfileDTO,
  config: SearchConfig,
): Promise<GroundedRun> {
  const prompt = buildPrompt(query, profile, config);
  try {
    const res = await client.models.generateContent({
      model: MODELS.kit, // gemini-2.5-flash — grounded search is only on Flash tier
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 6000,
      },
    });
    const text = res.text ?? "";
    const raw = extractJsonArray(text);
    const parsed = safeParseArray(raw);
    return { query, candidates: parsed.map(normalize) };
  } catch (err) {
    return {
      query,
      candidates: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------

function buildPrompt(
  query: string,
  profile: ProfileDTO,
  config: SearchConfig,
): string {
  const bits: string[] = [];
  bits.push(
    "You are a job-search assistant. Use Google Search to find fresh, currently-open job postings matching the query below.",
    "",
    "## Query",
    query,
    "",
  );
  if (config.location) bits.push(`Location preference: ${config.location}`);
  if (config.seniority) bits.push(`Seniority: ${config.seniority}`);
  bits.push(
    `Max age: ${config.recencyDays} days. Reject anything clearly older or ambiguously dated.`,
    "",
    "## Candidate profile (for relevance filtering)",
    "",
    profile.resumeText.trim().slice(0, 3000) ||
      "_(no résumé text; use the query alone)_",
  );
  if (profile.backgroundNote.trim()) {
    bits.push("", "Background:", profile.backgroundNote.trim().slice(0, 1000));
  }
  bits.push(
    "",
    "## Output",
    "",
    'Return ONLY a JSON array (no prose before or after, no markdown fences). 12–20 items maximum. Each item MUST be an object with keys:',
    "",
    '  { "company": string, "role": string, "location": string | "", "source_url": string, "summary": string (150–350 chars), "posted_at": string (ISO date if you can determine it, else empty string) }',
    "",
    "Rules:",
    "- Only return postings whose source_url points DIRECTLY to the job page on the hiring company's site or on Greenhouse/Lever/Ashby/Workday. Never return aggregator listings (Indeed, LinkedIn feed URLs, glassdoor summaries).",
    "- If the URL isn't a real job page, drop the item.",
    "- If you can't find 12 confident matches, return fewer — quality over quantity.",
    "- No duplicates (same company + role).",
  );
  return bits.join("\n");
}

// ---------------------------------------------------------------------------

/**
 * Pull the first JSON array out of the model's response, tolerating
 * ```json fences, leading prose, and trailing "Sources" sections.
 */
function extractJsonArray(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return "[]";
}

function safeParseArray(raw: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalize(row: Record<string, unknown>): Candidate {
  const str = (k: string): string => {
    const v = row[k];
    return typeof v === "string" ? v.trim() : "";
  };
  const sourceUrl = str("source_url");
  return {
    company: str("company") || "Unknown",
    role: str("role") || "Untitled role",
    location: str("location") || null,
    sourceUrl,
    listingText: str("summary"),
    postedAt: str("posted_at") || undefined,
    discoveredVia: "grounded",
  };
}
