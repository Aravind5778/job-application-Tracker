import { NextResponse } from "next/server";
import { getAnthropicApiKey, setAnthropicApiKey } from "@/lib/ai/client";

/**
 * Read: returns whether a key is set, NOT the key itself. We never echo
 * the secret back to the browser — once you've pasted it, the only way to
 * change it is to paste a new one or clear it.
 */
export async function GET() {
  const key = await getAnthropicApiKey();
  return NextResponse.json({
    hasKey: !!key,
    fromEnv: !!process.env.ANTHROPIC_API_KEY,
  });
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { value } = (body ?? {}) as { value?: unknown };
  const next =
    typeof value === "string"
      ? value.trim() || null
      : value === null
        ? null
        : undefined;
  if (next === undefined) {
    return NextResponse.json(
      { error: "`value` must be a string or null." },
      { status: 400 },
    );
  }
  await setAnthropicApiKey(next);
  return new NextResponse(null, { status: 204 });
}
