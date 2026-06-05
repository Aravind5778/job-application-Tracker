import { NextResponse } from "next/server";
import { deleteJob, getJob, JobInputError, updateJob } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ job });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (k: string) =>
    typeof b[k] === "string" ? (b[k] as string) : undefined;

  try {
    const job = await updateJob(id, {
      company: str("company"),
      role: str("role"),
      location: "location" in b ? str("location") ?? null : undefined,
      sourceUrl: "sourceUrl" in b ? str("sourceUrl") ?? null : undefined,
      notes: "notes" in b ? str("notes") ?? null : undefined,
      listingText: str("listingText"),
      columnId: str("columnId"),
    });
    return NextResponse.json({ job });
  } catch (err) {
    if (err instanceof JobInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await deleteJob(id);
  return new NextResponse(null, { status: 204 });
}
