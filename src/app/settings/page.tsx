import { TopNav } from "@/components/layout/top-nav";
import { ColumnsEditor } from "@/components/settings/columns-editor";
import { ApiKeyEditor } from "@/components/settings/api-key-editor";
import { AiLogTable } from "@/components/settings/ai-log-table";
import { SearchSettings } from "@/components/settings/search-settings";
import { listColumns } from "@/lib/columns";
import { getGoogleApiKey } from "@/lib/ai/client";
import { listAiLog, totalSpendCents } from "@/lib/ai-log";
import { getSearchConfig } from "@/lib/search/config";

// Settings always reflects the live DB state — don't cache between requests.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [columns, key, aiLog, total, searchConfig] = await Promise.all([
    listColumns(),
    getGoogleApiKey(),
    listAiLog(30),
    totalSpendCents(),
    getSearchConfig(),
  ]);
  const hasKey = !!key;
  const fromEnv = !!process.env.GEMINI_API_KEY;

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
              <h2 className="text-card-title text-ink">Google Gemini API key</h2>
            </header>
            <ApiKeyEditor hasKey={hasKey} fromEnv={fromEnv} />
          </section>

          <section className="mt-12">
            <header className="mb-4">
              <h2 className="text-card-title text-ink">Job search</h2>
              <p className="text-caption text-ink-tertiary mt-1">
                Configuration for the &ldquo;Find jobs&rdquo; button.
              </p>
            </header>
            <SearchSettings initial={searchConfig} />
          </section>

          <section className="mt-12">
            <header className="mb-4">
              <h2 className="text-card-title text-ink">AI usage</h2>
            </header>
            <AiLogTable entries={aiLog} totalCents={total} />
          </section>
        </div>
      </main>
    </>
  );
}
