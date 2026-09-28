import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { BridgeError, callApp } from "@/api/bridge";
import { invalidateFor, useSettingsOverview } from "@/api/queries";
import type { Os, SettingsOverviewOutput } from "@/api/tools.gen";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { clearBusyToast, showError } from "@/lib/toast";
import { useUnsaved } from "@/lib/unsaved";

/** The system default editor named in the placeholder and the help line (brief step 3), from
 *  `settings_overview.os` — not `text_editor_argv`'s own "the default text editor" phrasing (that names
 *  what `open -t` opens on macOS to a Hedge app; this names the app the operator actually sees). */
const DEFAULT_EDITOR: Record<Os, string> = { windows: "Notepad", macos: "TextEdit" };

function PanelSkeleton() {
  return (
    <section className="surface flex flex-col gap-3 p-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-32 rounded-sm" />
      <Skeleton className="h-8 w-full rounded-md" />
      <Skeleton className="h-3 w-2/3 rounded-sm" />
    </section>
  );
}

/**
 * The editable form, once `settings_overview` has loaded (brief step 3). `data` is that overview's own
 * result; the key on the caller (`data.editor_command`/`preferences_error`) isn't needed here since a
 * refetch that changes either simply re-renders this same instance's baseline through props — the fields
 * themselves stay controlled by local state so mid-edit typing survives an unrelated refetch.
 */
function EditorForm({ data }: { data: SettingsOverviewOutput }) {
  const editorDefault = DEFAULT_EDITOR[data.os];
  const broken = data.preferences_error !== null;

  const [value, setValue] = useState(data.editor_command ?? "");
  const [baseline, setBaseline] = useState(data.editor_command ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const dirty = value !== baseline;
  useUnsaved("settings-editor", dirty && !broken);

  // Read at call time, not closed over: the toast's own "Try again" (`retrySave`, below) has to see whatever
  // is on screen *now*, not what the fields held when the failed save started.
  const latestRef = useRef({ value, baseline, saving, broken });
  latestRef.current = { value, baseline, saving, broken };
  // The exact value a save attempt sent, kept only while a busy failure's "Try again" could still fire.
  const attemptedRef = useRef<string | null>(null);

  const doSave = () => {
    if (!mountedRef.current) return;
    const cur = latestRef.current;
    if (cur.saving || cur.broken || cur.value === cur.baseline) return;
    attemptedRef.current = cur.value;
    setSaving(true);
    setError(null);
    callApp("preferences_set", { editor_command: cur.value.trim() || null }).then(
      async (result) => {
        await invalidateFor(["preferences"]);
        clearBusyToast();
        toast("Saved editor command");
        attemptedRef.current = null;
        if (!mountedRef.current) return;
        setSaving(false);
        // Rust trims (and blank-to-nulls) the value it actually stored; matching the field to that exact
        // text keeps `dirty` from reading true again over a leading/trailing space alone.
        setValue(result.editor_command ?? "");
        setBaseline(result.editor_command ?? "");
      },
      (e: unknown) => {
        if (mountedRef.current) setSaving(false);
        if (e instanceof BridgeError && e.kind === "busy") {
          showError(e, retrySave);
        } else {
          attemptedRef.current = null;
          if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
        }
      },
    );
  };

  // Task 6 ruling: a leftover "Try again" from a busy failure does nothing once the value has changed since
  // (the Save button already reflects that newer edit) or the form has unmounted.
  const retrySave = () => {
    if (!mountedRef.current) return;
    if (latestRef.current.value !== attemptedRef.current) return;
    doSave();
  };

  const canSave = dirty && !saving && !broken;

  return (
    <section className="surface @container flex flex-col gap-3 p-3">
      <h2 className="micro-label">Editor command</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="editor-command" className="sr-only">
          Editor command
        </label>
        <Input
          id="editor-command"
          className="font-mono"
          spellCheck={false}
          placeholder={editorDefault}
          value={value}
          disabled={broken}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? "editor-command-error" : broken ? "editor-command-broken" : undefined}
        />
        {error && (
          <p id="editor-command-error" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {broken && (
          <p id="editor-command-broken" className="flex items-start gap-1.5 text-xs text-warning">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
            <span>
              {data.preferences_error}. HedgeBuddy uses {editorDefault} until preferences.json can be read.
            </span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Leave empty to open scripts in {editorDefault}. Use <Mono className="text-muted-foreground">{"{file}"}</Mono> where the script
          path goes; quote words with spaces (<Mono className="text-muted-foreground">"C:\Program Files\…"</Mono>), and use single quotes
          for a word that ends in a backslash.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-2">
        {dirty && !broken && <span className="micro-label">Unsaved changes</span>}
        <Button
          size="sm"
          className="aria-disabled:pointer-events-none aria-disabled:opacity-45"
          aria-disabled={!canSave}
          aria-busy={saving}
          onClick={doSave}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}

/** The editor command panel (spec §6.7): the optional command "Open in editor" runs, saved with an explicit
 *  Save and guarded against leaving with unsaved edits (`useUnsaved`). Disabled while `preferences.json`
 *  can't be read (`preferences_error`) — there is nothing to save into until that is fixed. */
export function EditorPanel() {
  const query = useSettingsOverview();

  if (query.isPending) return <PanelSkeleton />;
  if (query.isError && !query.isSuccess) {
    return (
      <section className="surface flex flex-col gap-3 p-3">
        <h2 className="micro-label">Editor command</h2>
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </section>
    );
  }

  const data = query.data;
  if (!data) return null;
  return <EditorForm data={data} />;
}
