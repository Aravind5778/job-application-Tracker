/**
 * Anthropic SDK accessor + API-key resolution.
 *
 * Key precedence (highest first):
 *   1. process.env.ANTHROPIC_API_KEY  (dev shells / one-off runs)
 *   2. Setting row { key: "anthropic_api_key" }  (the user typed it into /settings)
 *
 * If neither is set we return null; callers should treat that as "AI is
 * unavailable, fall back to the no-AI happy path."
 *
 * The Anthropic instance is constructed lazily — we don't want every API
 * route boot to instantiate a client (and risk validating its baseURL at
 * cold-start) just because the file is imported.
 */
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";

const SETTING_KEY = "anthropic_api_key";

export async function getAnthropicApiKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  return row?.value ?? null;
}

export async function setAnthropicApiKey(value: string | null): Promise<void> {
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

export async function getAnthropicClient(): Promise<Anthropic | null> {
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

// Default model selections. Override via the Settings page when we expose
// the field; for now, callers reference these constants directly.
export const MODELS = {
  // Cheap / fast — used for meta extraction (company/role/location from text).
  haiku: "claude-haiku-4-5",
  // Best for long-form structured writing — used by Generate Kit.
  opus: "claude-opus-4-5",
  // Mid-tier alternative for kit if the user wants to save on cost.
  sonnet: "claude-sonnet-4-5",
} as const;
