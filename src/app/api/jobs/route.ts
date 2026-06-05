import { NextResponse } from "next/server";
import { createJob, JobInputError, listJobs } from "@/lib/jobs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const columnId = url.searchParams.get("columnId") ?? undefined;
  const jobs = await listJobs({ columnId });
  return NextResponse.json({ jobs });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : undefined);

  try {
    const job = await createJob({
      columnId: str("columnId") ?? "",
      company: str("company") ?? "",
      role: str("role") ?? "",
      location: str("location"),
      source: (str("source") === "url" ? "url" : "paste"),
      sourceUrl: str("sourceUrl"),
      listingText: str("listingText") ?? "",
      notes: str("notes"),
    });
    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    if (err instanceof JobInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
