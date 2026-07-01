import { NextResponse } from "next/server";
import { runSearch } from "@/lib/search/run";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // grounded search + scoring can take ~60s+

export async function POST() {
  const result = await runSearch();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
