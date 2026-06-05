import { TopNav } from "@/components/layout/top-nav";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { listColumns } from "@/lib/columns";
import { getProfile, isProfileEmpty } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [columns, profile] = await Promise.all([listColumns(), getProfile()]);
  const empty = isProfileEmpty(profile);

  return (
    <>
      <TopNav columns={columns} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[820px] px-6 pt-12 pb-12">
          <p className="text-eyebrow text-ink-subtle uppercase">Profile</p>
          <h1 className="text-display-md text-ink mt-2">About you</h1>
          <p className="text-body-lg text-ink-muted mt-3 max-w-[640px]">
            Drop your résumé and a few lines about what you&apos;re looking for.
            The AI reads both as context for every generated kit, so make this
            specific.
          </p>

          {empty && (
            <div className="mt-6 rounded-lg border border-hairline bg-surface-1 px-4 py-3 text-body-sm text-ink-muted">
              Your profile is empty. Generate Kit will be disabled until at
              least one of the fields below has content.
            </div>
          )}

          <section className="mt-10">
            <ProfileEditor initial={profile} />
          </section>
        </div>
      </main>
    </>
  );
}
