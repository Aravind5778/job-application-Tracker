/**
 * Google Gemini SDK accessor + API-key resolution.
 *
 * Key precedence (highest first):
 *   1. process.env.GEMINI_API_KEY   (dev shells / one-off runs)
 *   2. Setting row { key: "google_api_key" }  (typed into /settings)
 *
 * Returns null when no key is configured; callers treat that as "AI is
 * unavailable, fall back to the no-AI happy path."
 *
 * The GoogleGenAI instance is constructed lazily so importing this file
 * doesn't spawn a client at cold-start.
 */
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/db";

const SETTING_KEY = "google_api_key";

export async function getGoogleApiKey(): Promise<string | null> {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  return row?.value ?? null;
}

export async function setGoogleApiKey(value: string | null): Promise<void> {
  if (!value) {
    await prisma.setting.delete({ where: { key: SETTING_KEY } }).catch(() => {});
    return;
  }
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value },
    create: { key: SETTING_KEY, value },
  });
}

export async function getGoogleClient(): Promise<GoogleGenAI | null> {
  const apiKey = await getGoogleApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/**
 * Model constants. Gemini 2.5 Flash is the free-tier workhorse with a
 * generous daily quota (thousands of requests/day) and quality that
 * matches or beats Claude Sonnet for long-form structured writing.
 *
 * Flash-Lite is faster and cheaper still — used for the paste-flow
 * meta-extract where we just need company / role / location.
 */
export const MODELS = {
  kit: "gemini-2.5-flash",
  metaExtract: "gemini-2.5-flash-lite",
} as const;
