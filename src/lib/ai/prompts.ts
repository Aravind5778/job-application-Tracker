/**
 * Prompt builder for the kit generator.
 *
 * The system block is structured so we can mark it `cache_control:
 * ephemeral` and have Claude's prompt cache cover it. The breakpoint sits
 * just before the per-job listing text — everything above is stable across
 * kits in the same session, so each subsequent generation pays only the
 * incremental cost of the per-job content.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ProfileDTO } from "@/lib/profile";

export const KIT_PROMPT_VERSION = "kit/v1";

const PERSONA = `
You write application kits for a senior DevOps / Cloud / Platform engineer.

Voice:
- Specific and quantified. Numbers, scope, tradeoffs — never generic "I'm passionate about cloud infrastructure" filler.
- Direct, professional. Match the tone of the listing: a careful enterprise role gets careful prose; a scrappy startup gets scrappy prose.
- No AI clichés. Never start with "I am writing to express my interest" or "In today's fast-paced world". Never use "passionate" or "synergy".
- Markdown for any rich formatting. No emoji unless the listing uses them.

Honesty rules:
- Use only the candidate's actual background. Don't invent companies, titles, or numbers.
- When inferring something not in the listing — like tech stack guesses or recent company moves — say "based on the listing" or "guess" so the user knows it isn't fact.
- If the listing doesn't include enough info for a confident interview question or company brief field, write a shorter, more honest answer rather than padding.

Output:
- You MUST respond by calling the emit_application_kit tool exactly once with the full kit. Do not write anything outside the tool call.
`.trim();

export function buildKitSystemPrompt(profile: ProfileDTO): string {
  // The profile is appended after the persona so the cache breakpoint
  // covers the entire stable section. Per-job listing text is sent in the
  // user message and stays uncached.
  const parts: string[] = [PERSONA, "", "## Candidate profile", ""];
  if (profile.fullName) parts.push(`Name: ${profile.fullName}`);
  if (profile.email) parts.push(`Email: ${profile.email}`);
  parts.push(
    "",
    "### Résumé (verbatim)",
    "",
    profile.resumeText.trim() || "_(empty — flag in generated cover letter)_",
  );
  if (profile.backgroundNote.trim()) {
    parts.push("", "### Background note", "", profile.backgroundNote.trim());
  }
  return parts.join("\n");
}

export type KitJobContext = {
  company: string;
  role: string;
  location?: string | null;
  listingText: string;
};

export function buildKitUserMessage(job: KitJobContext): string {
  const headerBits = [
    `Company: ${job.company}`,
    `Role: ${job.role}`,
    job.location ? `Location: ${job.location}` : null,
  ].filter(Boolean) as string[];

  return [
    "Generate the application kit for the following posting.",
    "",
    headerBits.join("\n"),
    "",
    "## Listing text",
    "",
    job.listingText.trim(),
  ].join("\n");
}

// Convenience wrapper: produce the `system` block in the cache-friendly
// array form Anthropic expects when `cache_control` is set per-block.
export function buildSystemBlocks(
  profile: ProfileDTO,
): Anthropic.Messages.MessageCreateParams["system"] {
  return [
    {
      type: "text",
      text: buildKitSystemPrompt(profile),
      cache_control: { type: "ephemeral" },
    },
  ];
}
