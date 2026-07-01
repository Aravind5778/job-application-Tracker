/**
 * Extract `{ company, role, location }` from a raw job-listing text blob
 * using Gemini's structured JSON output.
 *
 * Returns null when no Google API key is configured so the paste-flow UI
 * degrades to "fill it in by hand".
 */
import { getGoogleClient, MODELS } from "@/lib/ai/client";
import { prisma } from "@/lib/db";

export type MetaExtract = {
  company?: string;
  role?: string;
  location?: string;
};

const META_SCHEMA = {
  type: "object",
  required: ["company", "role"],
  properties: {
    company: {
      type: "string",
      description: "Hiring company name. Trim parent/division if obvious.",
    },
    role: {
      type: "string",
      description: "Role title as printed in the listing.",
    },
    location: {
      type: "string",
      description:
        "Location (city, state, country, or 'Remote'). Empty string if absent.",
    },
  },
} as const;

const SYSTEM =
  "You extract structured job metadata. Read the listing, then emit ONLY a " +
  "JSON object matching the schema. Never fabricate — if a field isn't in " +
  "the text, use an empty string.";

export async function extractMetaFromText(
  listingText: string,
): Promise<MetaExtract | null> {
  const client = await getGoogleClient();
  if (!client) return null;

  const snippet = listingText.slice(0, 2000);
  const model = MODELS.metaExtract;
  const t0 = Date.now();

  try {
    const res = await client.models.generateContent({
      model,
      contents: `Listing:\n\n${snippet}`,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseJsonSchema: META_SCHEMA,
        maxOutputTokens: 512,
        // Skip "thinking" tokens; small structured extraction doesn't
        // need chain-of-thought and it would eat the output budget.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const usage = res.usageMetadata;
    await prisma.aiLog.create({
      data: {
        model,
        operation: "meta_extract",
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - t0,
      },
    });

    const text = res.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as MetaExtract;
    return {
      company: parsed.company?.trim() || undefined,
      role: parsed.role?.trim() || undefined,
      location: parsed.location?.trim() || undefined,
    };
  } catch (err) {
    await prisma.aiLog
      .create({
        data: {
          model,
          operation: "meta_extract",
          latencyMs: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});
    return null;
  }
}
