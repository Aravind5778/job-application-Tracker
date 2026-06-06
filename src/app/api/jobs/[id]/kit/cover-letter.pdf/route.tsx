import { pdf } from "@react-pdf/renderer";
import { getJob } from "@/lib/jobs";
import { getKit } from "@/lib/kits";
import { getProfile } from "@/lib/profile";
import { CoverLetterDocument } from "@/lib/pdf/cover-letter";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Render the cover letter as a downloadable PDF. Uses editedContent when
 * present so the user's revisions are exported (not the raw model output).
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const job = await getJob(id);
  if (!job) return new Response("Not found", { status: 404 });
  const kit = await getKit(id);
  if (!kit) return new Response("No kit on this job.", { status: 404 });
  const section = kit.sections.find((s) => s.kind === "cover_letter");
  if (!section) return new Response("No cover letter.", { status: 404 });

  const body = (section.editedContent ?? section.content) as string;
  const profile = await getProfile();

  const doc = (
    <CoverLetterDocument
      candidateName={profile.fullName || undefined}
      candidateEmail={profile.email || undefined}
      company={job.company}
      role={job.role}
      generatedAt={kit.generatedAt}
      body={body}
    />
  );

  const buffer = await pdf(doc).toBuffer();
  const filename =
    `${slugify(job.company)}_${slugify(job.role)}_cover-letter.pdf`;

  return new Response(buffer as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
