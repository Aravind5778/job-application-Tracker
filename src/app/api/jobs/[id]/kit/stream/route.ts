import { generateKitStream } from "@/lib/kits";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/jobs/[id]/kit/stream
 *
 * Streams the kit generation as NDJSON: each line is one JSON event of
 * shape `{ type: "partial" | "done" | "error", ... }`. The client uses a
 * fetch+ReadableStream reader (not EventSource, which is GET-only).
 */
export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of generateKitStream(id)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", error: msg }) + "\n"),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
