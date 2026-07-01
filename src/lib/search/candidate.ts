/**
 * Shared candidate shape emitted by every search source (ATS feed adapter
 * or grounded Gemini search). Downstream dedup / scoring / persistence
 * consume this uniform type.
 */
export type CandidateSource = "greenhouse" | "lever" | "ashby" | "grounded";

export type Candidate = {
  company: string;
  role: string;
  location: string | null;
  sourceUrl: string;
  /** May be short/summary for ATS feeds, longer for grounded discoveries. */
  listingText: string;
  /** ISO string when the source exposes it. */
  postedAt?: string;
  discoveredVia: CandidateSource;
};

export type ScoredCandidate = Candidate & {
  score: number; // 0-100
  reason: string; // one-line justification from the scorer
};
