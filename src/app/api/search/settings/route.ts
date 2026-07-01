import { NextResponse } from "next/server";
import {
  DEFAULT_CONFIG,
  getSearchConfig,
  setSearchConfig,
  type AtsFeed,
  type SearchConfig,
} from "@/lib/search/config";

export async function GET() {
  const config = await getSearchConfig();
  return NextResponse.json({ config });
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Partial<SearchConfig>;

  const next: SearchConfig = {
    location:
      typeof b.location === "string" ? b.location : DEFAULT_CONFIG.location,
    seniority:
      typeof b.seniority === "string" ? b.seniority : DEFAULT_CONFIG.seniority,
    recencyDays:
      typeof b.recencyDays === "number" && b.recencyDays > 0
        ? Math.min(Math.round(b.recencyDays), 90)
        : DEFAULT_CONFIG.recencyDays,
    savedQueries: Array.isArray(b.savedQueries)
      ? b.savedQueries
          .filter((q): q is string => typeof q === "string")
          .map((q) => q.trim())
          .filter(Boolean)
      : [],
    atsFeeds: Array.isArray(b.atsFeeds)
      ? b.atsFeeds.filter(
          (f): f is AtsFeed =>
            !!f &&
            typeof f === "object" &&
            (f.source === "greenhouse" ||
              f.source === "lever" ||
              f.source === "ashby") &&
            typeof f.slug === "string" &&
            !!f.slug.trim(),
        )
      : [],
  };

  await setSearchConfig(next);
  return NextResponse.json({ config: next });
}
