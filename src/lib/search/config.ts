/**
 * Search configuration is stored as a single JSON blob in the Setting
 * table under key `search_config`. Kept as one row so the whole config
 * round-trips atomically and the UI can save with a single PATCH.
 */
import { prisma } from "@/lib/db";

const SETTING_KEY = "search_config";

export type AtsSource = "greenhouse" | "lever" | "ashby";

export type AtsFeed = {
  source: AtsSource;
  /** Company slug — the one that goes in the ATS URL. */
  slug: string;
  /** Optional display name; falls back to slug. */
  label?: string;
};

export type SearchConfig = {
  /** Free-text location preference ("Remote", "Bangalore", "US-remote", etc.). */
  location: string;
  /** Seniority hint ("Senior", "Staff", "Senior/Staff") — used as a soft signal. */
  seniority: string;
  /** Max age of postings in days. */
  recencyDays: number;
  /** Optional named search queries. If empty, we fall back to a profile-derived query. */
  savedQueries: string[];
  /** ATS company feeds to poll alongside grounded search. */
  atsFeeds: AtsFeed[];
};

export const DEFAULT_CONFIG: SearchConfig = {
  location: "",
  seniority: "",
  recencyDays: 14,
  savedQueries: [],
  atsFeeds: [],
};

export async function getSearchConfig(): Promise<SearchConfig> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(row.value) as Partial<SearchConfig>;
    return {
      location: typeof parsed.location === "string" ? parsed.location : "",
      seniority: typeof parsed.seniority === "string" ? parsed.seniority : "",
      recencyDays:
        typeof parsed.recencyDays === "number" && parsed.recencyDays > 0
          ? Math.min(parsed.recencyDays, 90)
          : 14,
      savedQueries: Array.isArray(parsed.savedQueries)
        ? parsed.savedQueries.filter((q): q is string => typeof q === "string")
        : [],
      atsFeeds: Array.isArray(parsed.atsFeeds)
        ? parsed.atsFeeds.filter(
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
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function setSearchConfig(config: SearchConfig): Promise<void> {
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(config) },
    create: { key: SETTING_KEY, value: JSON.stringify(config) },
  });
}
