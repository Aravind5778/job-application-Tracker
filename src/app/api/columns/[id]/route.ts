import { NextResponse } from "next/server";
import {
  ColumnInputError,
  deleteColumn,
  updateColumn,
} from "@/lib/columns";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { name, isTerminal } = (body ?? {}) as {
    name?: unknown;
    isTerminal?: unknown;
  };

  try {
    const column = await updateColumn(id, {
      name: typeof name === "string" ? name : undefined,
      isTerminal: typeof isTerminal === "boolean" ? isTerminal : undefined,
    });
    return NextResponse.json({ column });
  } catch (err) {
    if (err instanceof ColumnInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await deleteColumn(id);
  return new NextResponse(null, { status: 204 });
}
