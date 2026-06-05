/**
 * Use Claude Haiku (forced tool-use) to extract `company / role / location`
 * from a raw job-listing text blob. We don't trust the model to free-form
 * JSON, so we declare a single tool with a strict input schema and force
 * the model to call it.
 *
 * If no Anthropic key is configured, returns null — callers degrade to
 * "user fills the fields in by hand".
 */
import { getAnthropicClient, MODELS } from "@/lib/ai/client";
import { prisma } from "@/lib/db";

export type MetaExtract = {
  company?: string;
  role?: string;
  location?: string;
};

import type Anthropic from "@anthropic-ai/sdk";

const TOOL: Anthropic.Messages.Tool = {
  name: "emit_job_meta",
  description: "Emit the company, role, and location for the listing.",
  input_schema: {
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
          "Location (city, state, country, or 'Remote'). Empty if absent.",
      },
    },
  },
};

const SYSTEM =
  "You extract structured job metadata. Read the listing, then call the " +
  "emit_job_meta tool exactly once with the extracted fields. Never " +
  "fabricate — if a field isn't in the text, leave it empty.";

export async function extractMetaFromText(
  listingText: string,
): Promise<MetaExtract | null> {
  const client = await getAnthropicClient();
  if (!client) return null;

  // Trim to ~2k chars — top of the listing usually has the title + company.
  const snippet = listingText.slice(0, 2000);
  const t0 = Date.now();

  try {
    const res = await client.messages.create({
      model: MODELS.haiku,
      max_tokens: 200,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: `Listing:\n\n${snippet}`,
        },
      ],
    });

    // Log usage so the Settings page can show the user what they're spending.
    const usage = res.usage;
    await prisma.aiLog.create({
      data: {
        model: MODELS.haiku,
        operation: "meta_extract",
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
        latencyMs: Date.now() - t0,
      },
    });

    for (const block of res.content) {
      if (block.type === "tool_use" && block.name === TOOL.name) {
        const input = block.input as MetaExtract;
        return {
          company: input.company?.trim() || undefined,
          role: input.role?.trim() || undefined,
          location: input.location?.trim() || undefined,
        };
      }
    }
    return null;
  } catch (err) {
    await prisma.aiLog
      .create({
        data: {
          model: MODELS.haiku,
          operation: "meta_extract",
          latencyMs: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});
    return null;
  }
}
