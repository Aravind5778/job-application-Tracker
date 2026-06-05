/**
 * Profile service — the singleton row that holds Aravind's résumé text +
 * background note. Used as system-prompt context for every generated kit.
 *
 * The row is seeded empty by prisma/seed.ts (id="singleton"), so this
 * service never has to think about absence.
 */
import { prisma } from "./db";

export type ProfileDTO = {
  fullName: string;
  email: string;
  resumeText: string;
  backgroundNote: string;
  updatedAt: string;
};

export async function getProfile(): Promise<ProfileDTO> {
  const row = await prisma.profile.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
  return {
    fullName: row.fullName,
    email: row.email,
    resumeText: row.resumeText,
    backgroundNote: row.backgroundNote,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateProfile(patch: Partial<{
  fullName: string;
  email: string;
  resumeText: string;
  backgroundNote: string;
}>): Promise<ProfileDTO> {
  const row = await prisma.profile.update({
    where: { id: "singleton" },
    data: {
      ...(patch.fullName !== undefined && { fullName: patch.fullName }),
      ...(patch.email !== undefined && { email: patch.email }),
      ...(patch.resumeText !== undefined && { resumeText: patch.resumeText }),
      ...(patch.backgroundNote !== undefined && {
        backgroundNote: patch.backgroundNote,
      }),
    },
  });
  return {
    fullName: row.fullName,
    email: row.email,
    resumeText: row.resumeText,
    backgroundNote: row.backgroundNote,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function isProfileEmpty(p: ProfileDTO): boolean {
  return !p.resumeText.trim() && !p.backgroundNote.trim();
}
