/**
 * Column service layer. Used by API routes (and later by the Board server
 * component) so the data-access rules live in one place.
 *
 * Order strategy: columns use spaced integers (10, 20, 30…) so new inserts
 * can slot in between existing rows without a full renumber. `reorder()`
 * compresses the order field on every call to keep the gap reusable.
 */
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

const ORDER_STEP = 10;

export type ColumnDTO = {
  id: string;
  name: string;
  order: number;
  isTerminal: boolean;
  createdAt: string;
};

function toDTO(col: {
  id: string;
  name: string;
  order: number;
  isTerminal: boolean;
  createdAt: Date;
}): ColumnDTO {
  return {
    id: col.id,
    name: col.name,
    order: col.order,
    isTerminal: col.isTerminal,
    createdAt: col.createdAt.toISOString(),
  };
}

export async function listColumns(): Promise<ColumnDTO[]> {
  const rows = await prisma.column.findMany({ orderBy: { order: "asc" } });
  return rows.map(toDTO);
}

export async function createColumn(input: {
  name: string;
  isTerminal?: boolean;
}): Promise<ColumnDTO> {
  const trimmed = input.name.trim();
  if (!trimmed) throw new ColumnInputError("Name is required.");
  if (trimmed.length > 60) {
    throw new ColumnInputError("Name must be 60 characters or fewer.");
  }

  // Place new column at the end (max order + step).
  const lastOrder = await prisma.column.aggregate({
    _max: { order: true },
  });
  const nextOrder = (lastOrder._max.order ?? 0) + ORDER_STEP;

  const created = await prisma.column.create({
    data: {
      name: trimmed,
      order: nextOrder,
      isTerminal: input.isTerminal ?? false,
    },
  });
  return toDTO(created);
}

export async function updateColumn(
  id: string,
  patch: { name?: string; isTerminal?: boolean },
): Promise<ColumnDTO> {
  const data: Prisma.ColumnUpdateInput = {};

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new ColumnInputError("Name is required.");
    if (trimmed.length > 60) {
      throw new ColumnInputError("Name must be 60 characters or fewer.");
    }
    data.name = trimmed;
  }

  if (patch.isTerminal !== undefined) {
    data.isTerminal = patch.isTerminal;
  }

  const updated = await prisma.column.update({ where: { id }, data });
  return toDTO(updated);
}

export async function deleteColumn(id: string): Promise<void> {
  // Cascade on Job is set in schema; deleting a column drops its jobs too.
  // (Phase 2 has no jobs yet, so this is harmless for now.)
  await prisma.column.delete({ where: { id } });
}

/**
 * Rewrite the `order` field on all columns in one transaction.
 * `orderedIds` is the new desired order, top-of-board to bottom.
 *
 * We renumber to a fresh 10, 20, 30… sequence so the inter-column gap
 * stays usable for future insertions. Because `order` is `@unique`, we
 * stage the renumber as negative values first to avoid mid-update
 * collisions, then flip them positive.
 */
export async function reorderColumns(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    // Two-pass renumber to dodge the unique-order collision during update.
    await Promise.all(
      orderedIds.map((id, i) =>
        tx.column.update({
          where: { id },
          data: { order: -1 * (i + 1) },
        }),
      ),
    );

    await Promise.all(
      orderedIds.map((id, i) =>
        tx.column.update({
          where: { id },
          data: { order: (i + 1) * ORDER_STEP },
        }),
      ),
    );
  });
}

export class ColumnInputError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ColumnInputError";
  }
}
