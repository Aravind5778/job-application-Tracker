import { NextResponse } from "next/server";
import { generateKit, getKit, KitInputError } from "@/lib/kits";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const kit = await getKit(id);
  return NextResponse.json({ kit });
}

/**
 * POST = generate (or regenerate) the kit for this job.
 *
 * Replaces any existing Kit + KitSection rows for the job. Phase 9 will add
 * per-section regeneration that keeps the other sections untouched.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const kit = await generateKit(id);
    return NextResponse.json({ kit }, { status: 201 });
  } catch (err) {
    if (err instanceof KitInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
