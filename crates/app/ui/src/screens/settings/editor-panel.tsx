import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { BridgeError, callApp } from "@/api/bridge";
import { invalidateFor, useSettingsOverview } from "@/api/queries";
import type { Os, SettingsOverviewOutput } from "@/api/tools.gen";
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

/** The help line's quoted-path example: a real path worth quoting on each OS (review round 2, minor — a
 *  Windows path made no sense in the macOS help line). */
const HELP_PATH_EXAMPLE: Record<Os, string> = {
  windows: '"C:\\Program Files\\…"',
  macos: '"/Applications/Sublime Text.app/…"',
};

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
 * The editable form, once `settings_overview` has loaded (brief step 3). `value`/`baseline` start from
 * `data.editor_command` at mount (the `useState` initialisers only ever run once); the effect below re-seeds
 * both from a *later* `data.editor_command`/`data.preferences_error` — but only while the form isn't dirty,
 * so a refetch mid-edit (another HedgeBuddy changing the preference, or this same one landing after a save)
 * never clobbers what the operator is typing (review round 2, Important 1: the form used to never pick up a
 * refetched value at all).
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

  // Re-seed from a fresh read, but only while nothing is unsaved — checked at effect-run time (`dirty` is
  // read fresh here, not captured stale), so this only ever fires for a *genuine* external change, never
  // for the read-back of this form's own successful save (that save already moves `baseline` to match, so
  // `dirty` is already false and this is a same-value no-op).
  useEffect(() => {
    if (dirty) return;
    setValue(data.editor_command ?? "");
    setBaseline(data.editor_command ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.editor_command, data.preferences_error]);

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
      async () => {
        await invalidateFor(["preferences"]);
        clearBusyToast();
        toast("Saved editor command");
        attemptedRef.current = null;
        if (!mountedRef.current) return;
        setSaving(false);
        // Only the baseline moves to what was actually saved — never the field itself, which would stomp
        // on text the operator kept typing while the request was in flight (review round 2, minor).
        setBaseline(cur.value);
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

  // `error === null`: once Rust rejects a value, Save stays disabled until the operator actually changes
  // the text — `onChange` below clears `error` on every keystroke, so retyping the identical rejected value
  // character by character still re-enables it the moment it differs even briefly (review round 2, minor).
  const canSave = dirty && !saving && !broken && error === null;

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
          <p id="editor-command-error" className="min-w-0 text-xs break-words text-destructive">
            {error}
          </p>
        )}
        {broken && (
          <p id="editor-command-broken" className="flex items-start gap-1.5 text-xs text-warning">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 break-words">
              {data.preferences_error}. HedgeBuddy uses {editorDefault} until preferences.json can be read.
            </span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Leave empty to open scripts in {editorDefault}. Use <Mono className="text-muted-foreground">{"{file}"}</Mono> where the script
          path goes; quote words with spaces (<Mono className="text-muted-foreground">{HELP_PATH_EXAMPLE[data.os]}</Mono>), and use single
          quotes for a word that ends in a backslash.
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
  // The shared `settings_overview` failure is shown once, by `SettingsScreen` — this panel simply doesn't
  // render while that's the case (review round 2, minor: "one ErrorPanel per failed query").
  if (query.isError && !query.isSuccess) return null;

  const data = query.data;
  if (!data) return null;
  return <EditorForm data={data} />;
}
