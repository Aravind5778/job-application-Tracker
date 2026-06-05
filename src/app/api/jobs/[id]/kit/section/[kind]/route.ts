import { NextResponse } from "next/server";
import { KitInputError, updateKitSection } from "@/lib/kits";
import { KIT_SECTION_KINDS, type KitSectionKind } from "@/lib/ai/kit-tool";

type Ctx = { params: Promise<{ id: string; kind: string }> };

function isKnownKind(k: string): k is KitSectionKind {
  return (KIT_SECTION_KINDS as readonly string[]).includes(k);
}

/**
 * PATCH = save a user edit to one section's content.
 *
 *   Body: { edited: string | array | object | null }
 *   `null` reverts the section to its model-generated original.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id, kind } = await ctx.params;
  if (!isKnownKind(kind)) {
    return NextResponse.json({ error: "Unknown section kind." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { edited } = (body ?? {}) as { edited?: unknown };
  // Allow null to revert; otherwise the value must match the section shape
  // (a string for cover_letter, an array for bullets/questions, object for
  // company_brief). updateKitSection will throw KitInputError on mismatches.
  try {
    const section = await updateKitSection(
      id,
      kind,
      edited === null
        ? null
        : (edited as Parameters<typeof updateKitSection>[2]),
    );
    return NextResponse.json({ section });
  } catch (err) {
    if (err instanceof KitInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
