import { NextResponse } from "next/server";
import { KitInputError, regenerateKitSection } from "@/lib/kits";
import { KIT_SECTION_KINDS, type KitSectionKind } from "@/lib/ai/kit-tool";

type Ctx = { params: Promise<{ id: string; kind: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id, kind } = await ctx.params;
  if (!(KIT_SECTION_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json(
      { error: "Unknown section kind." },
      { status: 400 },
    );
  }
  try {
    const section = await regenerateKitSection(id, kind as KitSectionKind);
    return NextResponse.json({ section });
  } catch (err) {
    if (err instanceof KitInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Regeneration failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
