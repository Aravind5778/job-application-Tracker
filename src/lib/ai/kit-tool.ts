/**
 * Kit schema + types + runtime validator.
 *
 * With Gemini we get structured output via `responseMimeType:
 * "application/json"` + `responseJsonSchema`, so no tool wrapper is
 * needed — the raw response is guaranteed to be valid JSON matching
 * the schema.
 */

// --- JSON Schema (used as Gemini's responseJsonSchema) --------------------

export const KIT_SCHEMA = {
  type: "object",
  required: [
    "cover_letter",
    "resume_bullets",
    "interview_questions",
    "company_brief",
  ],
  properties: {
    cover_letter: {
      type: "string",
      description:
        "300–400 words, markdown, addressed to the hiring team. Specific, " +
        "quantified, no AI cliches like 'I am writing to express my interest'.",
    },
    resume_bullets: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "string",
        description:
          "STAR-style, quantified, ATS-friendly bullet rewritten from the " +
          "candidate's résumé to align with this listing.",
      },
    },
    interview_questions: {
      type: "array",
      minItems: 10,
      maxItems: 10,
      items: {
        type: "object",
        required: ["question", "why_it_matters", "approach"],
        properties: {
          question: { type: "string" },
          why_it_matters: { type: "string" },
          approach: {
            type: "string",
            description: "2–3 sentence hint of how to answer well.",
          },
        },
      },
    },
    company_brief: {
      type: "object",
      required: [
        "what_they_do",
        "recent_signals",
        "tech_stack_guesses",
        "team_fit_angle",
        "questions_to_ask",
      ],
      properties: {
        what_they_do: { type: "string" },
        recent_signals: {
          type: "array",
          items: { type: "string" },
          description:
            "Funding, launches, hiring trends, recent news. Empty if unknown.",
        },
        tech_stack_guesses: {
          type: "array",
          items: { type: "string" },
          description:
            "Best-effort guesses based on the listing language. Flag as " +
            "guesses, not certainties, in the rendered UI.",
        },
        team_fit_angle: {
          type: "string",
          description:
            "Why the candidate's background fits this team's specific work.",
        },
        questions_to_ask: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: { type: "string" },
        },
      },
    },
  },
} as const;

// --- Output types ----------------------------------------------------------

export type InterviewQuestion = {
  question: string;
  why_it_matters: string;
  approach: string;
};

export type CompanyBrief = {
  what_they_do: string;
  recent_signals: string[];
  tech_stack_guesses: string[];
  team_fit_angle: string;
  questions_to_ask: string[];
};

export type KitContent = {
  cover_letter: string;
  resume_bullets: string[];
  interview_questions: InterviewQuestion[];
  company_brief: CompanyBrief;
};

export const KIT_SECTION_KINDS = [
  "cover_letter",
  "resume_bullets",
  "interview_questions",
  "company_brief",
] as const;

export type KitSectionKind = (typeof KIT_SECTION_KINDS)[number];

// --- Validation helpers ----------------------------------------------------
// Structured-output constraints Gemini enforces server-side; we still
// defend the boundary so a stray null / wrong-typed field can't silently
// persist a broken kit.

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString);
}

export function validateKitContent(input: unknown): KitContent {
  if (!input || typeof input !== "object") {
    throw new Error("Model returned non-object output.");
  }
  const o = input as Record<string, unknown>;

  if (!isString(o.cover_letter) || !o.cover_letter.trim()) {
    throw new Error("cover_letter missing or empty.");
  }
  if (!isStringArray(o.resume_bullets) || o.resume_bullets.length !== 4) {
    throw new Error("resume_bullets must be 4 strings.");
  }
  if (
    !Array.isArray(o.interview_questions) ||
    o.interview_questions.length !== 10 ||
    !o.interview_questions.every(
      (q) =>
        q &&
        typeof q === "object" &&
        isString((q as InterviewQuestion).question) &&
        isString((q as InterviewQuestion).why_it_matters) &&
        isString((q as InterviewQuestion).approach),
    )
  ) {
    throw new Error("interview_questions must be 10 well-formed objects.");
  }
  const cb = o.company_brief as CompanyBrief | undefined;
  if (
    !cb ||
    typeof cb !== "object" ||
    !isString(cb.what_they_do) ||
    !Array.isArray(cb.recent_signals) ||
    !cb.recent_signals.every(isString) ||
    !Array.isArray(cb.tech_stack_guesses) ||
    !cb.tech_stack_guesses.every(isString) ||
    !isString(cb.team_fit_angle) ||
    !Array.isArray(cb.questions_to_ask) ||
    !cb.questions_to_ask.every(isString)
  ) {
    throw new Error("company_brief is malformed.");
  }

  return {
    cover_letter: o.cover_letter,
    resume_bullets: o.resume_bullets,
    interview_questions: o.interview_questions as InterviewQuestion[],
    company_brief: cb,
  };
}
