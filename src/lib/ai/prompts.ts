/**
 * Prompt builders for the kit generator.
 *
 * Gemini takes the persona + profile as `systemInstruction`. The plan
 * previously relied on Anthropic's prompt-cache markers to make
 * multi-kit sessions cheap; Gemini's free tier doesn't need that (each
 * request is a free token allocation anyway), so we just concatenate.
 */
import type { ProfileDTO } from "@/lib/profile";

export const KIT_PROMPT_VERSION = "kit/v2-gemini";

const PERSONA = `
You write application kits for a senior DevOps / Cloud / Platform engineer.

Voice:
- Specific and quantified. Numbers, scope, tradeoffs — never generic "I'm passionate about cloud infrastructure" filler.
- Direct, professional. Match the tone of the listing: a careful enterprise role gets careful prose; a scrappy startup gets scrappy prose.
- No AI clichés. Never start with "I am writing to express my interest" or "In today's fast-paced world". Never use "passionate" or "synergy".
- Markdown for any rich formatting inside the cover letter. No emoji unless the listing uses them.

Honesty rules:
- Use only the candidate's actual background. Don't invent companies, titles, or numbers.
- When inferring something not in the listing — like tech stack guesses or recent company moves — phrase it as "based on the listing" or "guess" so the user knows it isn't fact.
- If the listing doesn't include enough info for a confident interview question or company brief field, write a shorter, more honest answer rather than padding.

Interview questions:
- For each of the 10 questions, produce a full first-person sample_answer of 280–400 words that the candidate literally reads or paraphrases in the room. Write it as the candidate's actual spoken words — never coaching prose.
- STRICTLY FORBIDDEN in sample_answer: any second-person framing ("You can", "You could", "You might"), any imperative coaching ("Focus on", "Highlight", "Discuss", "Emphasize", "Start by", "Consider", "Mention"), and any meta reference to the interview itself.
- Good answer opener: "At Happiest Minds, working on the DoubleVerify project, I inherited a manual deployment process that…". Bad opener (rewrite): "You should talk about your work at Happiest Minds where…".
- STAR structure when the question is behavioral (Situation → Task → Action → Result), but delivered as continuous prose — no labeled headers inside the answer.
- Every project, company, tool, and number in an answer must come from the candidate's actual résumé. If the question probes a tool the résumé doesn't cover, acknowledge the adjacency honestly in first person.

Output:
- Respond ONLY with a single JSON object that matches the schema exactly. No prose before or after. No markdown code fences. Just the raw JSON.
`.trim();

export function buildKitSystemPrompt(profile: ProfileDTO): string {
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
