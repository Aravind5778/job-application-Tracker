/**
 * Kit service — orchestrates the model call and the on-disk Kit + KitSection
 * rows. Generation is non-streaming in this phase; Phase 8 layers a streaming
 * variant on top.
 *
 * Storage shape:
 *   - One `Kit` row per job, keyed by `jobId` (unique).
 *   - Four `KitSection` rows per kit, one per `kind`. Each section stores
 *     `content` (JSON-encoded for arrays/objects, raw text for cover_letter)
 *     and an optional `editedContent` for in-place user edits.
 *
 * On regenerate we leave any `editedContent` alone unless explicitly
 * requested — Phase 9 will surface per-section regenerate with that nuance.
 */
import { parse as parsePartialJson, Allow } from "partial-json";
import { prisma } from "./db";
import { getAnthropicClient, MODELS } from "./ai/client";
import {
  KIT_SECTION_KINDS,
  KIT_TOOL,
  KIT_TOOL_NAME,
  type KitContent,
  type KitSectionKind,
  validateKitContent,
} from "./ai/kit-tool";
import { buildKitUserMessage, buildSystemBlocks, KIT_PROMPT_VERSION } from "./ai/prompts";
import { getProfile, isProfileEmpty } from "./profile";
import { getJob } from "./jobs";

// ---------------------------------------------------------------------------
// DTO surface

export type SavedKitSectionDTO = {
  kind: KitSectionKind;
  // `content` is stored as a string in the DB; for non-string kinds we
  // JSON-decode it before returning. The drawer renders shape-specific UI.
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
// Generate (non-streaming)

const MAX_LISTING_CHARS = 12_000;

export async function generateKit(jobId: string): Promise<SavedKitDTO> {
  const job = await getJob(jobId);
  if (!job) throw new KitInputError("Job not found.");

  const profile = await getProfile();
  if (isProfileEmpty(profile)) {
    throw new KitInputError(
      "Your profile is empty. Fill it in on /profile before generating a kit.",
    );
  }

  const client = await getAnthropicClient();
  if (!client) {
    throw new KitInputError(
      "No Anthropic API key configured. Set ANTHROPIC_API_KEY or paste a key into Settings.",
    );
  }

  // Bound listing length so we don't burn tokens on absurd posts.
  const listingText =
    job.listingText.length > MAX_LISTING_CHARS
      ? job.listingText.slice(0, MAX_LISTING_CHARS) + "\n\n[truncated]"
      : job.listingText;

  const model = MODELS.opus;
  const t0 = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let error: string | null = null;
  let content: KitContent | null = null;

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 4000,
      system: buildSystemBlocks(profile),
      tools: [KIT_TOOL],
      tool_choice: { type: "tool", name: KIT_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: buildKitUserMessage({
            company: job.company,
            role: job.role,
            location: job.location,
            listingText,
          }),
        },
      ],
    });

    inputTokens = res.usage?.input_tokens ?? 0;
    outputTokens = res.usage?.output_tokens ?? 0;
    cacheReadTokens = res.usage?.cache_read_input_tokens ?? 0;
    cacheWriteTokens = res.usage?.cache_creation_input_tokens ?? 0;

    for (const block of res.content) {
      if (block.type === "tool_use" && block.name === KIT_TOOL_NAME) {
        content = validateKitContent(block.input);
        break;
      }
    }
    if (!content) {
      throw new KitInputError(
        "Model didn't call the emit_application_kit tool. Try again.",
      );
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    await logKitCall({
      jobId,
      model,
      operation: "kit",
      latencyMs: Date.now() - t0,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      error,
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
    cacheReadTokens,
    cacheWriteTokens,
    error: null,
  });

  return persistKit(jobId, model, content);
}

// ---------------------------------------------------------------------------
// Generate (streaming)
//
// Yields events as the model writes the kit tool's JSON input:
//   { type: "partial", partial: Partial<KitContent> }   — many of these
//   { type: "done", kit: SavedKitDTO }                 — once persisted
//   { type: "error", error: string }                   — terminal failure
//
// The route handler turns this AsyncIterable into an NDJSON ReadableStream;
// the client parses each line and progressively renders sections as they
// fill in.

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
    const client = await getAnthropicClient();
    if (!client) {
      throw new KitInputError(
        "No Anthropic API key configured. Set ANTHROPIC_API_KEY or paste a key into Settings.",
      );
    }

    const listingText =
      job.listingText.length > MAX_LISTING_CHARS
        ? job.listingText.slice(0, MAX_LISTING_CHARS) + "\n\n[truncated]"
        : job.listingText;

    const model = MODELS.opus;
    const t0 = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;

    const stream = client.messages.stream({
      model,
      max_tokens: 4000,
      system: buildSystemBlocks(profile),
      tools: [KIT_TOOL],
      tool_choice: { type: "tool", name: KIT_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: buildKitUserMessage({
            company: job.company,
            role: job.role,
            location: job.location,
            listingText,
          }),
        },
      ],
    });

    // Accumulate the tool's `input` JSON as it streams in.
    let jsonBuf = "";
    // `partial-json` Allow.ALL lets us tolerate unterminated strings, arrays,
    // and objects mid-stream — exactly what we want for progressive UI.

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "input_json_delta") {
          jsonBuf += delta.partial_json ?? "";
          try {
            const parsed = parsePartialJson(jsonBuf, Allow.ALL) as Partial<KitContent>;
            yield { type: "partial", partial: parsed };
          } catch {
            // Mid-token; ignore and wait for the next delta.
          }
        }
      } else if (event.type === "message_delta") {
        // usage arrives on message_delta
        const usage = event.usage as {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        } | undefined;
        if (usage) {
          inputTokens = usage.input_tokens ?? inputTokens;
          outputTokens = usage.output_tokens ?? outputTokens;
          cacheReadTokens = usage.cache_read_input_tokens ?? cacheReadTokens;
          cacheWriteTokens =
            usage.cache_creation_input_tokens ?? cacheWriteTokens;
        }
      }
    }

    const finalMessage = await stream.finalMessage();
    let content: KitContent | null = null;
    for (const block of finalMessage.content) {
      if (block.type === "tool_use" && block.name === KIT_TOOL_NAME) {
        content = validateKitContent(block.input);
        break;
      }
    }
    if (!content) {
      throw new KitInputError(
        "Model didn't call the emit_application_kit tool. Try again.",
      );
    }

    await logKitCall({
      jobId,
      model,
      operation: "kit",
      latencyMs: Date.now() - t0,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      error: null,
    });

    const saved = await persistKit(jobId, model, content);
    yield { type: "done", kit: saved };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    yield { type: "error", error: msg };
  }
}

async function persistKit(
  jobId: string,
  model: string,
  content: KitContent,
): Promise<SavedKitDTO> {
  return prisma.$transaction(async (tx) => {
    // Replace any previous kit + sections for this job atomically.
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

// ---------------------------------------------------------------------------
// Regenerate one section
//
// Reuses the same emit_application_kit tool — easier than maintaining a
// separate per-section tool — and tells the model which sections to keep,
// then writes only the target section back to the DB. The kept sections'
// existing values (preferring editedContent) go into the prompt so the
// regenerated output matches the user's voice.

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
  const client = await getAnthropicClient();
  if (!client) {
    throw new KitInputError("No Anthropic API key configured.");
  }

  // Build the "keep these, regenerate that" instruction. The kept sections
  // double as a voice sample for the model.
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
      listingText:
        job.listingText.length > MAX_LISTING_CHARS
          ? job.listingText.slice(0, MAX_LISTING_CHARS) + "\n\n[truncated]"
          : job.listingText,
    }) +
    "\n\n## Kept sections (match this voice and specificity)\n\n" +
    kept
      .map(
        (k) =>
          `### ${k.kind}\n\n` +
          (typeof k.value === "string" ? k.value : JSON.stringify(k.value, null, 2)),
      )
      .join("\n\n") +
    `\n\n## Task\n\nRegenerate ONLY the \`${kind}\` field. The other fields will be discarded — feel free to copy them verbatim from the kept sections above. Keep the same tone and specificity as the kept sections.`;

  const model = MODELS.opus;
  const t0 = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 2000,
      system: buildSystemBlocks(profile),
      tools: [KIT_TOOL],
      tool_choice: { type: "tool", name: KIT_TOOL_NAME },
      messages: [{ role: "user", content: userMessage }],
    });

    inputTokens = res.usage?.input_tokens ?? 0;
    outputTokens = res.usage?.output_tokens ?? 0;
    cacheReadTokens = res.usage?.cache_read_input_tokens ?? 0;
    cacheWriteTokens = res.usage?.cache_creation_input_tokens ?? 0;

    let content: KitContent | null = null;
    for (const block of res.content) {
      if (block.type === "tool_use" && block.name === KIT_TOOL_NAME) {
        content = validateKitContent(block.input);
        break;
      }
    }
    if (!content) {
      throw new KitInputError("Model didn't call the tool. Try again.");
    }

    await logKitCall({
      jobId,
      model,
      operation: "kit_section",
      latencyMs: Date.now() - t0,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      error: null,
    });

    // Persist only the target section. Editing keeps the user's editedContent
    // intact if they had any — regeneration is an update to `content` only.
    const kit = await prisma.kit.findUnique({ where: { jobId } });
    if (!kit) throw new KitInputError("Kit vanished mid-regenerate.");
    const updated = await prisma.kitSection.update({
      where: { kitId_kind: { kitId: kit.id, kind } },
      data: {
        content: encodeSection(kind, content[kind]),
        // Drop any prior edit so the fresh model output is visible.
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
      cacheReadTokens,
      cacheWriteTokens,
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

async function logKitCall(d: {
  jobId: string;
  model: string;
  operation: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
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
        cacheReadTokens: d.cacheReadTokens,
        cacheWriteTokens: d.cacheWriteTokens,
        estCostCents: estimateCostCents(
          d.model,
          d.inputTokens,
          d.outputTokens,
          d.cacheReadTokens,
          d.cacheWriteTokens,
        ),
        error: d.error,
      },
    })
    .catch(() => {
      /* logging best-effort */
    });
}

/**
 * Rough cost estimator. Values are approximations of public Anthropic prices
 * (subject to change) — meant to give the user a "this run cost ~$0.04" feel,
 * not to be authoritative. All values are USD per million tokens.
 */
function estimateCostCents(
  model: string,
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
): number {
  let prices: { input: number; output: number; cacheR: number; cacheW: number };
  if (model.includes("opus")) {
    prices = { input: 15, output: 75, cacheR: 1.5, cacheW: 18.75 };
  } else if (model.includes("sonnet")) {
    prices = { input: 3, output: 15, cacheR: 0.3, cacheW: 3.75 };
  } else {
    // haiku-class
    prices = { input: 0.8, output: 4, cacheR: 0.08, cacheW: 1 };
  }
  const dollars =
    (input * prices.input +
      output * prices.output +
      cacheRead * prices.cacheR +
      cacheWrite * prices.cacheW) /
    1_000_000;
  return Math.round(dollars * 100);
}
