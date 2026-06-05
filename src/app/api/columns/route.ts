import { NextResponse } from "next/server";
import {
  ColumnInputError,
  createColumn,
  listColumns,
} from "@/lib/columns";

export async function GET() {
  const columns = await listColumns();
  return NextResponse.json({ columns });
}

export async function POST(req: Request) {
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

  if (typeof name !== "string") {
    return NextResponse.json(
      { error: "`name` must be a string." },
      { status: 400 },
    );
  }

  try {
    const column = await createColumn({
      name,
      isTerminal: typeof isTerminal === "boolean" ? isTerminal : undefined,
    });
    return NextResponse.json({ column }, { status: 201 });
  } catch (err) {
    if (err instanceof ColumnInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
