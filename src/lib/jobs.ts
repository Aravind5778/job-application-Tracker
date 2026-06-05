/**
 * Job service layer. Same shape as src/lib/columns.ts — all DB access goes
 * through these functions so the API routes and (later) server components
 * never call Prisma directly.
 *
 * Ordering: each column has its own `order` sequence. New jobs slot in at
 * the TOP of their column (min(order) - 10), so what you just added is
 * what you see first — important for the paste flow where the user just
 * dropped a listing in and wants visual confirmation.
 */
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

const ORDER_STEP = 10;

export type JobSource = "url" | "paste";

export type JobListDTO = {
  id: string;
  columnId: string;
  order: number;
  company: string;
  role: string;
  location: string | null;
  source: JobSource;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  hasKit: boolean;
};

export type JobDetailDTO = JobListDTO & {
  listingText: string;
  notes: string | null;
};

type JobRow = {
  id: string;
  columnId: string;
  order: number;
  company: string;
  role: string;
  location: string | null;
  source: string;
  sourceUrl: string | null;
  listingText: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  kit?: { id: string } | null;
};

function toListDTO(row: JobRow): JobListDTO {
  return {
    id: row.id,
    columnId: row.columnId,
    order: row.order,
    company: row.company,
    role: row.role,
    location: row.location,
    source: (row.source === "url" ? "url" : "paste") as JobSource,
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    hasKit: !!row.kit,
  };
}

function toDetailDTO(row: JobRow): JobDetailDTO {
  return {
    ...toListDTO(row),
    listingText: row.listingText,
    notes: row.notes,
  };
}

// ---------------------------------------------------------------------------

export async function listJobs(opts?: { columnId?: string }): Promise<JobListDTO[]> {
  const where: Prisma.JobWhereInput = opts?.columnId
    ? { columnId: opts.columnId }
    : {};
  const rows = await prisma.job.findMany({
    where,
    include: { kit: { select: { id: true } } },
    orderBy: [{ columnId: "asc" }, { order: "asc" }],
  });
  return rows.map(toListDTO);
}

export async function getJob(id: string): Promise<JobDetailDTO | null> {
  const row = await prisma.job.findUnique({
    where: { id },
    include: { kit: { select: { id: true } } },
  });
  return row ? toDetailDTO(row) : null;
}

// ---------------------------------------------------------------------------

export class JobInputError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "JobInputError";
  }
}

export type CreateJobInput = {
  columnId: string;
  company: string;
  role: string;
  location?: string;
  source: JobSource;
  sourceUrl?: string;
  listingText: string;
  notes?: string;
};

function clean(value: string | undefined | null, max: number): string | null {
  if (value === undefined || value === null) return null;
  const t = value.trim();
  if (!t) return null;
  if (t.length > max) {
    throw new JobInputError(`Value too long (max ${max} chars).`);
  }
  return t;
}

function required(value: string | undefined | null, label: string, max: number): string {
  const v = clean(value, max);
  if (!v) throw new JobInputError(`${label} is required.`);
  return v;
}

export async function createJob(input: CreateJobInput): Promise<JobDetailDTO> {
  const company = required(input.company, "Company", 200);
  const role = required(input.role, "Role", 200);
  const listingText = required(input.listingText, "Listing text", 50_000);
  const location = clean(input.location, 200);
  const sourceUrl = clean(input.sourceUrl, 2000);
  const notes = clean(input.notes, 5000);

  if (input.source !== "url" && input.source !== "paste") {
    throw new JobInputError("Source must be 'url' or 'paste'.");
  }

  // Confirm column exists; users shouldn't be able to add into a deleted column.
  const col = await prisma.column.findUnique({ where: { id: input.columnId } });
  if (!col) throw new JobInputError("Column not found.");

  // Insert at the top of the column (min order - ORDER_STEP). Fresh column
  // starts at order = 0.
  const topJob = await prisma.job.findFirst({
    where: { columnId: input.columnId },
    orderBy: { order: "asc" },
    select: { order: true },
  });
  const nextOrder = (topJob?.order ?? ORDER_STEP) - ORDER_STEP;

  const row = await prisma.job.create({
    data: {
      columnId: input.columnId,
      order: nextOrder,
      company,
      role,
      location,
      source: input.source,
      sourceUrl,
      listingText,
      notes,
    },
    include: { kit: { select: { id: true } } },
  });

  return toDetailDTO(row);
}

// ---------------------------------------------------------------------------

export type UpdateJobInput = {
  company?: string;
  role?: string;
  location?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
  listingText?: string;
  columnId?: string;
};

export async function updateJob(
  id: string,
  patch: UpdateJobInput,
): Promise<JobDetailDTO> {
  const data: Prisma.JobUpdateInput = {};

  if (patch.company !== undefined) {
    data.company = required(patch.company, "Company", 200);
  }
  if (patch.role !== undefined) {
    data.role = required(patch.role, "Role", 200);
  }
  if (patch.location !== undefined) {
    data.location = clean(patch.location, 200);
  }
  if (patch.sourceUrl !== undefined) {
    data.sourceUrl = clean(patch.sourceUrl, 2000);
  }
  if (patch.notes !== undefined) {
    data.notes = clean(patch.notes, 5000);
  }
  if (patch.listingText !== undefined) {
    data.listingText = required(patch.listingText, "Listing text", 50_000);
  }
  if (patch.columnId !== undefined) {
    // Validate target column and place the job at the top of its new column,
    // matching createJob's insert-at-top behavior so manual column moves
    // mirror what dragging will do in Phase 4.
    const target = await prisma.column.findUnique({
      where: { id: patch.columnId },
    });
    if (!target) throw new JobInputError("Target column not found.");

    const topInTarget = await prisma.job.findFirst({
      where: { columnId: patch.columnId, NOT: { id } },
      orderBy: { order: "asc" },
      select: { order: true },
    });
    data.column = { connect: { id: patch.columnId } };
    data.order = (topInTarget?.order ?? ORDER_STEP) - ORDER_STEP;
  }

  const row = await prisma.job.update({
    where: { id },
    data,
    include: { kit: { select: { id: true } } },
  });
  return toDetailDTO(row);
}

export async function deleteJob(id: string): Promise<void> {
  await prisma.job.delete({ where: { id } });
}

/**
 * Apply a board-wide reorder.
 *
 * `byColumn` is the desired new ordering per affected column — keys are
 * column IDs, values are the column's complete job-id list in display order
 * (top-to-bottom). Jobs that move to a new column appear in the destination
 * list (and disappear from the source list), so we can derive both the new
 * `columnId` and `order` for every job from this single structure.
 *
 * The rewrite happens in one transaction, two passes (negatives, then real
 * order values), to dodge any unique-key skirmishes if we add one later.
 */
export async function reorderJobs(byColumn: Record<string, string[]>): Promise<void> {
  const entries = Object.entries(byColumn);
  if (entries.length === 0) return;

  // Build a flat list of (jobId → desired columnId + index). We do this
  // outside the transaction so any malformed input fails fast.
  type Move = { jobId: string; columnId: string; index: number };
  const moves: Move[] = [];
  for (const [columnId, ids] of entries) {
    ids.forEach((jobId, index) => moves.push({ jobId, columnId, index }));
  }

  await prisma.$transaction(async (tx) => {
    // Pass 1: park each job at a negative order so we can't collide with
    // any future @@unique([columnId, order]) constraint mid-update.
    await Promise.all(
      moves.map((m, i) =>
        tx.job.update({
          where: { id: m.jobId },
          data: { columnId: m.columnId, order: -(i + 1) },
        }),
      ),
    );

    // Pass 2: write the final spaced ordering.
    await Promise.all(
      moves.map((m) =>
        tx.job.update({
          where: { id: m.jobId },
          data: { order: (m.index + 1) * ORDER_STEP },
        }),
      ),
    );
  });
}
