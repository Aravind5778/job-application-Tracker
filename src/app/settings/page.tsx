import { TopNav } from "@/components/layout/top-nav";
import { ColumnsEditor } from "@/components/settings/columns-editor";
import { listColumns } from "@/lib/columns";

// Settings always reflects the live DB state — don't cache between requests.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const columns = await listColumns();

  return (
    <>
      <TopNav columns={columns} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[820px] px-6 pt-12 pb-12">
          <p className="text-eyebrow text-ink-subtle uppercase">Settings</p>
          <h1 className="text-display-md text-ink mt-2">Configure your board</h1>
          <p className="text-body-lg text-ink-muted mt-3 max-w-[640px]">
            Shape the pipeline to match how you actually job-hunt. The AI key
            and model defaults move in here in a later phase.
          </p>

          <section className="mt-12">
            <header className="flex items-baseline justify-between mb-4">
              <h2 className="text-card-title text-ink">Pipeline columns</h2>
              <span className="text-caption text-ink-tertiary">
                Click a name to rename
              </span>
            </header>
            <ColumnsEditor initialColumns={columns} />
          </section>
        </div>
      </main>
    </>
  );
}
