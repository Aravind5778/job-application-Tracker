/**
 * Score candidate jobs against the candidate profile using Gemini
 * Flash-Lite with a strict JSON schema. Single batched call to avoid
 * paying prompt overhead per candidate.
 */
import { getGoogleClient, MODELS } from "@/lib/ai/client";
import type { ProfileDTO } from "@/lib/profile";
import type { Candidate, ScoredCandidate } from "./candidate";

const SCORE_SCHEMA = {
  type: "object",
  required: ["scores"],
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        required: ["index", "score", "reason"],
        properties: {
          index: { type: "integer" },
          score: {
            type: "integer",
            description:
              "0–100 fit against the candidate's résumé + preferences. " +
              "70+ is a strong match; 40–70 is worth reviewing; below 40 is likely noise.",
          },
          reason: {
            type: "string",
            description: "One-line justification (≤120 chars).",
          },
        },
      },
    },
  },
} as const;

/**
 * Score a batch. Returns candidates with `score` and `reason` populated,
 * sorted descending by score. Unscored candidates (model didn't return
 * an entry for them) default to 0.
 */
export async function scoreCandidates(
  candidates: Candidate[],
  profile: ProfileDTO,
): Promise<ScoredCandidate[]> {
  if (candidates.length === 0) return [];

  const client = await getGoogleClient();
  if (!client) {
    // No key → give everything a neutral score so caller can still
    // insert; ranking becomes arbitrary but nothing gets lost.
    return candidates.map((c) => ({
      ...c,
      score: 50,
      reason: "Not scored (no Google API key).",
    }));
  }

  const model = MODELS.metaExtract; // Flash-Lite — cheapest, fine for scoring

  const summary = candidates
    .map(
      (c, i) =>
        `[${i}] ${c.company} — ${c.role}` +
        (c.location ? ` (${c.location})` : "") +
        `\n${c.listingText.slice(0, 600)}`,
    )
    .join("\n\n---\n\n");

  const system =
    "You score how well each job matches a specific candidate's résumé and " +
    "preferences. Return one JSON object with a `scores` array — one entry " +
    "per input candidate, keyed by its input index. Score 0–100 where 70+ " +
    "means the candidate should definitely apply.";

  const user = [
    "## Candidate résumé",
    profile.resumeText.trim().slice(0, 4000) || "_(empty)_",
    "",
    profile.backgroundNote.trim() ? "## Background\n" + profile.backgroundNote.trim() : "",
    "## Candidates to score",
    summary,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await client.models.generateContent({
      model,
      contents: user,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseJsonSchema: SCORE_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: Math.min(6000, 200 + candidates.length * 80),
      },
    });
    const text = res.text ?? "{}";
    const parsed = JSON.parse(text) as {
      scores?: Array<{ index?: number; score?: number; reason?: string }>;
    };
    const byIndex = new Map<number, { score: number; reason: string }>();
    for (const s of parsed.scores ?? []) {
      if (
        typeof s.index === "number" &&
        typeof s.score === "number" &&
        typeof s.reason === "string"
      ) {
        byIndex.set(s.index, {
          score: Math.max(0, Math.min(100, Math.round(s.score))),
          reason: s.reason.trim(),
        });
      }
    }
    const scored = candidates.map((c, i) => {
      const s = byIndex.get(i);
      return {
        ...c,
        score: s?.score ?? 0,
        reason: s?.reason ?? "Not returned by scorer.",
      };
    });
    // Sort desc by score.
    return scored.sort((a, b) => b.score - a.score);
  } catch {
    return candidates.map((c) => ({
      ...c,
      score: 50,
      reason: "Scoring call failed; defaulted to neutral.",
    }));
  }
}
