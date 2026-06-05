import { NextResponse } from "next/server";
import { reorderColumns } from "@/lib/columns";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { orderedIds } = (body ?? {}) as { orderedIds?: unknown };
  if (
    !Array.isArray(orderedIds) ||
    orderedIds.some((x) => typeof x !== "string")
  ) {
    return NextResponse.json(
      { error: "`orderedIds` must be an array of column IDs." },
      { status: 400 },
    );
  }

  await reorderColumns(orderedIds as string[]);
  return new NextResponse(null, { status: 204 });
}
