import { NextResponse } from "next/server";
import { getProfile, updateProfile } from "@/lib/profile";

export async function GET() {
  const profile = await getProfile();
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : undefined);

  const profile = await updateProfile({
    fullName: str("fullName"),
    email: str("email"),
    resumeText: str("resumeText"),
    backgroundNote: str("backgroundNote"),
  });
  return NextResponse.json({ profile });
}
