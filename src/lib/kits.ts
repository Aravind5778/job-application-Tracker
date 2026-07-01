/**
 * Kit service — orchestrates the model call and the on-disk Kit + KitSection
 * rows. Backed by Google Gemini via `@google/genai`.
 *
 * Storage shape:
 *   - One `Kit` row per job, keyed by `jobId` (unique).
 *   - Four `KitSection` rows per kit, one per `kind`. Each section stores
 *     `content` (JSON-encoded for arrays/objects, raw text for cover_letter)
 *     and an optional `editedContent` for in-place user edits.
 *
 * On regenerate we leave any `editedContent` for OTHER sections alone; the
 * target section's editedContent is cleared so the fresh model output shows.
 */
import { parse as parsePartialJson, Allow } from "partial-json";
import { prisma } from "./db";
import { getGoogleClient, MODELS } from "./ai/client";
import {
  KIT_SCHEMA,
  KIT_SECTION_KINDS,
  type KitContent,
  type KitSectionKind,
  validateKitContent,
} from "./ai/kit-tool";
import { buildKitSystemPrompt, buildKitUserMessage, KIT_PROMPT_VERSION } from "./ai/prompts";
import { getProfile, isProfileEmpty } from "./profile";
import { getJob } from "./jobs";

// ---------------------------------------------------------------------------
// DTO surface

export type SavedKitSectionDTO = {
  kind: KitSectionKind;
  content:
    | string
    | string[]
    | KitContent["interview_questions"]
    | KitContent["company_brief"];
  editedContent:
    | string
    | string[]
    | KitContent["interview_questions"]
    | KitContent["company_brief"]
    | null;
  updatedAt: string;
};

export type SavedKitDTO = {
  jobId: string;
  model: string;
  promptVersion: string;
  generatedAt: string;
  sections: SavedKitSectionDTO[];
};

// ---------------------------------------------------------------------------
// Errors

export class KitInputError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "KitInputError";
  }
}

// ---------------------------------------------------------------------------
// Read

export async function getKit(jobId: string): Promise<SavedKitDTO | null> {
  const kit = await prisma.kit.findUnique({
    where: { jobId },
    include: { sections: true },
  });
  if (!kit) return null;
  return {
    jobId: kit.jobId,
    model: kit.model,
    promptVersion: kit.promptVersion,
    generatedAt: kit.generatedAt.toISOString(),
    sections: kit.sections.map(rowToSectionDTO),
  };
}

function rowToSectionDTO(row: {
  kind: string;
  content: string;
  editedContent: string | null;
  updatedAt: Date;
}): SavedKitSectionDTO {
  const kind = row.kind as KitSectionKind;
  return {
    kind,
    content: decodeSection(kind, row.content),
    editedContent:
      row.editedContent !== null ? decodeSection(kind, row.editedContent) : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function decodeSection(
  kind: KitSectionKind,
  raw: string,
): SavedKitSectionDTO["content"] {
  if (kind === "cover_letter") return raw;
  return JSON.parse(raw);
}

function encodeSection(kind: KitSectionKind, value: unknown): string {
  if (kind === "cover_letter") {
    if (typeof value !== "string") {
      throw new KitInputError("cover_letter must be a string.");
    }
    return value;
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Model config shared by all kit calls

const MAX_LISTING_CHARS = 12_000;
// Gemini 2.5 Flash supports up to 65k output tokens. A full kit with
// 10 × ~350-word sample answers can easily hit 6–7k tokens for the
// answers alone; ceiling generously to 16k so we never truncate.
const MAX_OUTPUT_TOKENS = 16384;

// Gemini 2.5 models run "thinking" tokens by default, and those thoughts
// are billed to the output-token budget — so a request with a 4k output
// cap can burn 3k on thinking and truncate the JSON mid-string. Setting
// thinkingBudget: 0 turns that off entirely for structured-output calls,
// where the model doesn't need to "reason out loud" before emitting JSON.
const THINKING_OFF = { thinkingBudget: 0 } as const;

function trimListing(text: string): string {
  return text.length > MAX_LISTING_CHARS
    ? text.slice(0, MAX_LISTING_CHARS) + "\n\n[truncated]"
    : text;
}

// ---------------------------------------------------------------------------
// Generate (non-streaming)

export async function generateKit(jobId: string): Promise<SavedKitDTO> {
  const job = await getJob(jobId);
  if (!job) throw new KitInputError("Job not found.");

  const profile = await getProfile();
  if (isProfileEmpty(profile)) {
    throw new KitInputError(
      "Your profile is empty. Fill it in on /profile before generating a kit.",
    );
  }

  const client = await getGoogleClient();
  if (!client) {
    throw new KitInputError(
      "No Google API key configured. Set GEMINI_API_KEY or paste a key into Settings.",
    );
  }

  const model = MODELS.kit;
  const listingText = trimListing(job.listingText);
  const t0 = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let content: KitContent | null = null;

  try {
    const res = await client.models.generateContent({
      model,
      contents: buildKitUserMessage({
        company: job.company,
        role: job.role,
        location: job.location,
        listingText,
      }),
      config: {
        systemInstruction: buildKitSystemPrompt(profile),
        responseMimeType: "application/json",
        responseJsonSchema: KIT_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: THINKING_OFF,
      },
    });

    inputTokens = res.usageMetadata?.promptTokenCount ?? 0;
    outputTokens = res.usageMetadata?.candidatesTokenCount ?? 0;

    const text = res.text;
    if (!text) throw new KitInputError("Model returned empty output.");
    content = validateKitContent(JSON.parse(text));
  } catch (e) {
    await logKitCall({
      jobId,
      model,
      operation: "kit",
      latencyMs: Date.now() - t0,
      inputTokens,
      outputTokens,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  await logKitCall({
    jobId,
    model,
    operation: "kit",
    latencyMs: Date.now() - t0,
    inputTokens,
    outputTokens,
    error: null,
  });

  return persistKit(jobId, model, content);
}

// ---------------------------------------------------------------------------
// Generate (streaming)
//
// Yields events as the model writes the JSON:
//   { type: "partial", partial: Partial<KitContent> }   — many
//   { type: "done", kit: SavedKitDTO }                  — once persisted
//   { type: "error", error: string }                    — terminal failure

export type KitStreamEvent =
  | { type: "partial"; partial: Partial<KitContent> }
  | { type: "done"; kit: SavedKitDTO }
  | { type: "error"; error: string };

export async function* generateKitStream(
  jobId: string,
): AsyncGenerator<KitStreamEvent, void, void> {
  let job;
  try {
    job = await getJob(jobId);
    if (!job) throw new KitInputError("Job not found.");
    const profile = await getProfile();
    if (isProfileEmpty(profile)) {
      throw new KitInputError(
        "Your profile is empty. Fill it in on /profile before generating a kit.",
      );
    }
    const client = await getGoogleClient();
    if (!client) {
      throw new KitInputError(
        "No Google API key configured. Set GEMINI_API_KEY or paste a key into Settings.",
      );
    }

    const model = MODELS.kit;
    const listingText = trimListing(job.listingText);
    const t0 = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await client.models.generateContentStream({
      model,
      contents: buildKitUserMessage({
        company: job.company,
        role: job.role,
        location: job.location,
        listingText,
      }),
      config: {
        systemInstruction: buildKitSystemPrompt(profile),
        responseMimeType: "application/json",
        responseJsonSchema: KIT_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: THINKING_OFF,
      },
    });

    let jsonBuf = "";
    for await (const chunk of stream) {
      const delta = chunk.text ?? "";
      if (delta) {
        jsonBuf += delta;
        try {
          const parsed = parsePartialJson(jsonBuf, Allow.ALL) as Partial<KitContent>;
          yield { type: "partial", partial: parsed };
        } catch {
          // Mid-token; ignore and wait for the next chunk.
        }
      }
      // Usage metadata typically only lands on the final chunk.
      const usage = chunk.usageMetadata;
      if (usage) {
        inputTokens = usage.promptTokenCount ?? inputTokens;
        outputTokens = usage.candidatesTokenCount ?? outputTokens;
      }
    }

    // Final parse — with responseJsonSchema + thinkingBudget:0 this should
    // always be complete JSON. If it isn't, the model likely hit the
    // output-token cap; give the user an actionable message instead of a
    // raw JSON.parse error.
    let content: KitContent;
    try {
      content = validateKitContent(JSON.parse(jsonBuf));
    } catch (parseErr) {
      const truncated = jsonBuf.length > 0 && !jsonBuf.trimEnd().endsWith("}");
      const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new KitInputError(
        truncated
          ? "Model ran out of output tokens before finishing the kit. Try again, or shorten the listing text."
          : `Model returned malformed JSON: ${detail}`,
      );
    }

    await logKitCall({
      jobId,
      model,
      operation: "kit",
      latencyMs: Date.now() - t0,
      inputTokens,
      outputTokens,
      error: null,
    });

    const saved = await persistKit(jobId, model, content);
    yield { type: "done", kit: saved };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    yield { type: "error", error: msg };
  }
}

// ---------------------------------------------------------------------------
// Regenerate one section
//
// Reuses the full-kit schema (Gemini's structured output enforcement doesn't
// give us a per-section schema easily). We tell the model which sections to
// keep and pass them as a voice sample; only the target section is written
// back to the DB.

export async function regenerateKitSection(
  jobId: string,
  kind: KitSectionKind,
): Promise<SavedKitSectionDTO> {
  const job = await getJob(jobId);
  if (!job) throw new KitInputError("Job not found.");
  const existing = await getKit(jobId);
  if (!existing) {
    throw new KitInputError("Generate the full kit first.");
  }
  const profile = await getProfile();
  if (isProfileEmpty(profile)) {
    throw new KitInputError("Your profile is empty.");
  }
  const client = await getGoogleClient();
  if (!client) {
    throw new KitInputError("No Google API key configured.");
  }

  const kept = existing.sections
    .filter((s) => s.kind !== kind)
    .map((s) => ({
      kind: s.kind,
      value: s.editedContent ?? s.content,
    }));

  const userMessage =
    buildKitUserMessage({
      company: job.company,
      role: job.role,
      location: job.location,
      listingText: trimListing(job.listingText),
    }) +
    "\n\n## Kept sections (match this voice and specificity)\n\n" +
    kept
      .map(
        (k) =>
          `### ${k.kind}\n\n` +
          (typeof k.value === "string" ? k.value : JSON.stringify(k.value, null, 2)),
      )
      .join("\n\n") +
    `\n\n## Task\n\nRegenerate ONLY the \`${kind}\` field. The other fields will be discarded — copy them verbatim from the kept sections above. Keep the same tone and specificity as the kept sections.`;

  const model = MODELS.kit;
  const t0 = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const res = await client.models.generateContent({
      model,
      contents: userMessage,
      config: {
        systemInstruction: buildKitSystemPrompt(profile),
        responseMimeType: "application/json",
        responseJsonSchema: KIT_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: THINKING_OFF,
      },
    });

    inputTokens = res.usageMetadata?.promptTokenCount ?? 0;
    outputTokens = res.usageMetadata?.candidatesTokenCount ?? 0;

    const text = res.text;
    if (!text) throw new KitInputError("Model returned empty output.");
    const content = validateKitContent(JSON.parse(text));

    await logKitCall({
      jobId,
      model,
      operation: "kit_section",
      latencyMs: Date.now() - t0,
      inputTokens,
      outputTokens,
      error: null,
    });

    const kit = await prisma.kit.findUnique({ where: { jobId } });
    if (!kit) throw new KitInputError("Kit vanished mid-regenerate.");
    const updated = await prisma.kitSection.update({
      where: { kitId_kind: { kitId: kit.id, kind } },
      data: {
        content: encodeSection(kind, content[kind]),
        editedContent: null,
      },
    });
    return rowToSectionDTO(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logKitCall({
      jobId,
      model,
      operation: "kit_section",
      latencyMs: Date.now() - t0,
      inputTokens,
      outputTokens,
      error: msg,
    });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Edit + revert

export async function updateKitSection(
  jobId: string,
  kind: KitSectionKind,
  edited: SavedKitSectionDTO["content"] | null,
): Promise<SavedKitSectionDTO> {
  const kit = await prisma.kit.findUnique({ where: { jobId } });
  if (!kit) throw new KitInputError("No kit on this job.");

  const data =
    edited === null
      ? { editedContent: null }
      : { editedContent: encodeSection(kind, edited) };

  const updated = await prisma.kitSection.update({
    where: { kitId_kind: { kitId: kit.id, kind } },
    data,
  });
  return rowToSectionDTO(updated);
}

// ---------------------------------------------------------------------------
// Persistence + logging

async function persistKit(
  jobId: string,
  model: string,
  content: KitContent,
): Promise<SavedKitDTO> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.kit.findUnique({ where: { jobId } });
    if (existing) {
      await tx.kitSection.deleteMany({ where: { kitId: existing.id } });
      await tx.kit.delete({ where: { id: existing.id } });
    }

    const kit = await tx.kit.create({
      data: {
        jobId,
        model,
        promptVersion: KIT_PROMPT_VERSION,
        sections: {
          create: KIT_SECTION_KINDS.map((kind) => ({
            kind,
            content: encodeSection(kind, content[kind]),
          })),
        },
      },
      include: { sections: true },
    });

    return {
      jobId,
      model: kit.model,
      promptVersion: kit.promptVersion,
      generatedAt: kit.generatedAt.toISOString(),
      sections: kit.sections.map(rowToSectionDTO),
    };
  });
}

async function logKitCall(d: {
  jobId: string;
  model: string;
  operation: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  error: string | null;
}) {
  await prisma.aiLog
    .create({
      data: {
        jobId: d.jobId,
        model: d.model,
        operation: d.operation,
        latencyMs: d.latencyMs,
        inputTokens: d.inputTokens,
        outputTokens: d.outputTokens,
        // Free tier: cost is $0. Log tokens for volume tracking anyway.
        estCostCents: 0,
        error: d.error,
      },
    })
    .catch(() => {
      /* logging best-effort */
    });
}
