/**
 * Render each kit section as plain markdown — used by the per-section Copy
 * button and the full-kit markdown export.
 */
import type {
  CompanyBrief,
  InterviewQuestion,
  KitSectionKind,
} from "./ai/kit-tool";
import type { SavedKitDTO, SavedKitSectionDTO } from "./kits";

export function sectionToMarkdown(section: SavedKitSectionDTO): string {
  const value = section.editedContent ?? section.content;
  switch (section.kind) {
    case "cover_letter":
      return value as string;

    case "resume_bullets":
      return (value as string[]).map((b) => `- ${b}`).join("\n");

    case "interview_questions":
      return (value as InterviewQuestion[])
        .map((q, i) => {
          const parts = [
            `### ${i + 1}. ${q.question}`,
            `**Why it matters:** ${q.why_it_matters}`,
            `**Approach:** ${q.approach}`,
          ];
          if (q.sample_answer && q.sample_answer.trim()) {
            parts.push(`**Sample answer:**\n\n${q.sample_answer}`);
          }
          return parts.join("\n\n");
        })
        .join("\n\n");

    case "company_brief": {
      const cb = value as CompanyBrief;
      const lines: string[] = [];
      lines.push(`### What they do\n\n${cb.what_they_do}`);
      if (cb.recent_signals.length) {
        lines.push(
          "### Recent signals\n\n" +
            cb.recent_signals.map((s) => `- ${s}`).join("\n"),
        );
      }
      if (cb.tech_stack_guesses.length) {
        lines.push(
          "### Tech stack (guesses)\n\n" +
            cb.tech_stack_guesses.map((s) => `- ${s}`).join("\n"),
        );
      }
      lines.push(`### Team fit angle\n\n${cb.team_fit_angle}`);
      if (cb.questions_to_ask.length) {
        lines.push(
          "### Questions to ask them\n\n" +
            cb.questions_to_ask.map((s) => `- ${s}`).join("\n"),
        );
      }
      return lines.join("\n\n");
    }
  }
}

export function kitToMarkdown(
  kit: SavedKitDTO,
  meta: { company: string; role: string; location?: string | null },
): string {
  const head = [
    `# ${meta.company} — ${meta.role}`,
    meta.location ? `_${meta.location}_` : null,
    `_Generated ${new Date(kit.generatedAt).toLocaleString()} · ${kit.model}_`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const labels: Record<KitSectionKind, string> = {
    cover_letter: "Cover letter",
    resume_bullets: "Résumé bullets",
    interview_questions: "Likely interview questions",
    company_brief: "Company brief",
  };

  const order: KitSectionKind[] = [
    "cover_letter",
    "resume_bullets",
    "interview_questions",
    "company_brief",
  ];

  const sections = order
    .map((kind) => {
      const s = kit.sections.find((x) => x.kind === kind);
      if (!s) return null;
      return `## ${labels[kind]}\n\n${sectionToMarkdown(s)}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  return `${head}\n\n${sections}\n`;
}
