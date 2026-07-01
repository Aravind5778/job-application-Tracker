"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

/**
 * Google Gemini API key entry. The current key is never echoed back — we
 * only tell the user whether one is set. Rotate by pasting a new one; clear
 * with the Remove button.
 *
 * If the key comes from the GEMINI_API_KEY env var, the field is disabled
 * and we say so — env value wins over the DB value.
 */
export function ApiKeyEditor({
  hasKey,
  fromEnv,
}: {
  hasKey: boolean;
  fromEnv: boolean;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  function call(body: { value: string | null }, okMsg: string) {
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/settings/google-key", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok && res.status !== 204) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `Save failed (${res.status}).`);
        }
        setStatus({ kind: "ok", msg: okMsg });
        setValue("");
      } catch (e) {
        setStatus({
          kind: "err",
          msg: e instanceof Error ? e.message : "Save failed.",
        });
      }
    });
  }

  if (fromEnv) {
    return (
      <div className="rounded-lg border border-hairline bg-surface-1 p-4 text-body-sm text-ink-muted">
        Key is coming from the <code className="text-ink">GEMINI_API_KEY</code> env
        var. Edit your <code className="text-ink">.env</code> file to change it.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-hairline bg-surface-1 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-body-sm text-ink">Status:</span>
          {hasKey ? (
            <span className="text-body-sm text-[var(--color-success)]">
              key set
            </span>
          ) : (
            <span className="text-body-sm text-ink-subtle">no key</span>
          )}
        </div>
        <p className="text-caption text-ink-tertiary">
          Get a free key at{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:text-primary-hover"
          >
            aistudio.google.com/apikey
          </a>
          . Stored locally in SQLite; never logged, never leaves this machine
          except in API calls to Google.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          placeholder={hasKey ? "Paste a new key to rotate" : "AIza…"}
          className="flex-1 h-9 px-3 rounded-md bg-canvas border border-hairline text-ink text-body-sm placeholder:text-ink-tertiary"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
        />
        <Button
          onClick={() => call({ value }, "Saved.")}
          disabled={pending || !value.trim()}
        >
          {pending ? "Saving…" : "Save key"}
        </Button>
        {hasKey && (
          <Button
            variant="secondary"
            onClick={() => call({ value: null }, "Removed.")}
            disabled={pending}
          >
            Remove
          </Button>
        )}
      </div>

      {status && (
        <p
          className={
            status.kind === "ok"
              ? "text-caption text-[var(--color-success)]"
              : "text-caption text-ink"
          }
        >
          {status.msg}
        </p>
      )}
    </div>
  );
}
