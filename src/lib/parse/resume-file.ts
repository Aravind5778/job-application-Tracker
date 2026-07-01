/**
 * Extract plain text from an uploaded résumé file (PDF or Word .docx).
 *
 * Both extractors run server-side — they need Buffer + native libs that
 * aren't available (or worth shipping) in the browser bundle.
 */
import mammoth from "mammoth";

export type ResumeExtractResult = {
  text: string;
  warnings: string[];
};

export class ResumeExtractError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ResumeExtractError";
  }
}

const MAX_BYTES = 8 * 1024 * 1024; // 8MB cap

export async function extractResumeText(file: File): Promise<ResumeExtractResult> {
  if (file.size > MAX_BYTES) {
    throw new ResumeExtractError(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdf(buffer);
  }
  if (
    name.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocx(buffer);
  }
  throw new ResumeExtractError(
    "Only PDF (.pdf) and Word (.docx) files are supported. For .doc, please save as .docx first.",
  );
}

async function extractPdf(buffer: Buffer): Promise<ResumeExtractResult> {
  // pdf-parse v2 exports a PDFParse class instead of the v1 default function.
  // Dynamic import so its heavy pdfjs bootstrap doesn't run at module load.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    const cleaned = text.replace(/\r\n/g, "\n").trim();
    if (!cleaned) {
      throw new ResumeExtractError(
        "Couldn't find any text in that PDF — is it a scanned image? OCR isn't supported yet; paste the text manually.",
      );
    }
    return { text: cleaned, warnings: [] };
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<ResumeExtractResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.replace(/\r\n/g, "\n").trim();
  if (!text) {
    throw new ResumeExtractError(
      "Couldn't find any text in that Word document.",
    );
  }
  return {
    text,
    warnings: result.messages
      .filter((m) => m.type === "warning")
      .map((m) => m.message),
  };
}
