import { NextResponse } from "next/server";
import {
  extractResumeText,
  ResumeExtractError,
} from "@/lib/parse/resume-file";

/**
 * POST /api/profile/extract-resume
 *
 * Multipart form-data with a `file` field. Returns { text, warnings }.
 * We deliberately DON'T persist here — the client puts the extracted text
 * into the Résumé textarea and the user reviews/edits before saving via
 * PATCH /api/profile.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form-data with a `file` field." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing `file` upload." },
      { status: 400 },
    );
  }

  try {
    const result = await extractResumeText(file);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ResumeExtractError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Extraction failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
