import { TopNav } from "@/components/layout/top-nav";
import { ColumnsEditor } from "@/components/settings/columns-editor";
import { ApiKeyEditor } from "@/components/settings/api-key-editor";
import { listColumns } from "@/lib/columns";
import { getAnthropicApiKey } from "@/lib/ai/client";

// Settings always reflects the live DB state — don't cache between requests.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [columns, key] = await Promise.all([
    listColumns(),
    getAnthropicApiKey(),
  ]);
  const hasKey = !!key;
  const fromEnv = !!process.env.ANTHROPIC_API_KEY;

  return (
    <>
      <TopNav columns={columns} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[820px] px-6 pt-12 pb-12">
          <p className="text-eyebrow text-ink-subtle uppercase">Settings</p>
          <h1 className="text-display-md text-ink mt-2">Configure your board</h1>
          <p className="text-body-lg text-ink-muted mt-3 max-w-[640px]">
            Shape the pipeline to match how you actually job-hunt and wire up
            the AI key that powers Generate Kit.
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

          <section className="mt-12">
            <header className="mb-4">
              <h2 className="text-card-title text-ink">Anthropic API key</h2>
            </header>
            <ApiKeyEditor hasKey={hasKey} fromEnv={fromEnv} />
          </section>
        </div>
      </main>
    </>
  );
}
