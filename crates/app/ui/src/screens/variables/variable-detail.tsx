import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { callTool } from "@/api/bridge";
import { invalidateFor } from "@/api/queries";
import type { SetVarInput, VariablesOverviewOutput, VarType } from "@/api/tools.gen";
import { ChangePreviewDialog } from "@/components/app/change-preview-dialog";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { VarEditor } from "@/components/editors/var-editor";
import { EMPTY_SECRET, type SecretState } from "@/components/editors/secret-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { appName } from "@/lib/format";
import { showError } from "@/lib/toast";
import { markSaved, useUnsaved } from "@/lib/unsaved";
import { VAR_TYPES, emptyEdit, fromEdit, toEdit, validateName, validateValue, type EditValue } from "@/lib/var-values";

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="micro-label">
          {label}
        </label>
      ) : (
        <span className="micro-label">{label}</span>
      )}
      {children}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 @max-[640px]:px-3">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 @max-[640px]:p-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}

/** Whether two edit values (of the same type) are the same, for the dirty check. */
function editEquals(type: VarType, a: EditValue, b: EditValue): boolean {
  if (type === "string[]" || type === "path[]") return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/**
 * The editable form for one variable (spec §6.3, §7): an existing variable, or a new one — created blank
 * from `/variables/new`, or prefilled from a same-named requirement so Home's "needed" link lands ready to
 * fill in. `data` is `variables_overview`'s last successful result; the caller only mounts this once it has
 * one, keyed on `profile` and `name` together so a profile switch (or a different variable) always starts a
 * fresh instance rather than risking a write landing in the wrong profile.
 */
function VariableForm({ name, profile, data }: { name: string; profile: string; data: VariablesOverviewOutput }) {
  const [, navigate] = useLocation();
  const isBlankNew = name === "new";
  const requirementRow = data.requirements.find((r) => r.name === name) ?? null;
  const existingVar = data.variables.find((v) => v.name === name) ?? null;
  // Reactive, not frozen: once a save lands, the overview refetch this awaits (see `doSave`) makes this flip
  // to `false` in place, even when the URL was already this variable's own (opened from a requirement link,
  // so there's no route change — hence no remount — to re-derive it another way).
  const creating = existingVar === null;

  // The initial field values are still captured once, at mount, so a later overview refetch (this save's own,
  // or an unrelated one) never clobbers what the operator is mid-typing.
  const [init] = useState(() => {
    const type = (existingVar?.type ?? requirementRow?.type ?? "string") as VarType;
    return {
      name: isBlankNew ? "" : name,
      type,
      description: existingVar?.description ?? requirementRow?.description ?? "",
      value: existingVar && existingVar.type !== "secret" ? toEdit(existingVar.type, existingVar.value) : emptyEdit(type),
    };
  });

  const [baseline, setBaseline] = useState({ name: init.name, type: init.type, description: init.description, value: init.value, secretChanged: false });
  const [nameField, setNameField] = useState(init.name);
  const [type, setType] = useState<VarType>(init.type);
  const [description, setDescription] = useState(init.description);
  const [value, setValue] = useState<EditValue>(init.value);
  const [secretState, setSecretState] = useState<SecretState>(EMPTY_SECRET);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Set once a create-save succeeds; a separate effect (below) waits for `dirty` to actually render `false`
  // before navigating, rather than racing that render with an immediate `navigate()` call.
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameCaretRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (nameCaretRef.current !== null) nameInputRef.current?.setSelectionRange(nameCaretRef.current, nameCaretRef.current);
  }, [nameField]);

  // Strict Mode double-invokes this in dev (mount, simulated unmount, remount) specifically to catch effects
  // that aren't idempotent; only setting the ref on cleanup, never resetting it on setup, is exactly that bug
  // — it would leave `current` permanently `false` after the simulated round, even though the component is
  // genuinely still mounted.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const dirty =
    // The NAME field only exists (and only matters) while creating; ignoring it once `creating` flips false
    // also sidesteps a saved name's trimming ever reading as "still different" from what's on screen.
    (creating && nameField !== baseline.name) ||
    type !== baseline.type ||
    description !== baseline.description ||
    (type === "secret" ? secretState.changed !== baseline.secretChanged : !editEquals(type, value, baseline.value));
  useUnsaved(`variable:${name}`, dirty);

  // Once the save above has rendered as clean, the guarded `navigate` below will find nothing unsaved and go
  // straight through — no separate "force it clean" step needed (see `lib/unsaved.ts`).
  useEffect(() => {
    if (pendingRedirect === null || dirty) return;
    navigate(`/variables/${encodeURIComponent(pendingRedirect)}`, { replace: true });
    setPendingRedirect(null);
  }, [pendingRedirect, dirty, navigate]);

  const handleTypeChange = (t: VarType) => {
    setType(t);
    setValue(emptyEdit(t));
    setSecretState(EMPTY_SECRET);
  };

  const trimmedName = nameField.trim();
  const nameCollision = creating && data.variables.some((v) => v.name === trimmedName);
  const nameErr = !creating
    ? null
    : trimmedName === ""
      ? "Name the variable."
      : (validateName(trimmedName) ?? (nameCollision ? "A variable with this name already exists." : null));
  // A secret needs typing when there is nothing stored to keep instead: creating one from scratch, or one
  // just retyped from another type (the profile's stored value, if any, is of the *old* type).
  const secretNeedsValue = !secretState.changed && (creating || baseline.type !== "secret");
  const valueErr = type === "secret" ? (secretNeedsValue ? "Enter a value." : null) : validateValue(type, value);
  // While creating, a prefilled-but-untouched form (a bool requirement that's fine left Off, say) must still
  // be saveable — `dirty` alone would block it. Leaving with nothing entered still asks nothing, since the
  // guard below stays keyed on plain `dirty`.
  const canSave = (dirty || creating) && nameErr === null && valueErr === null;

  const mismatchRow =
    !creating && requirementRow?.state === "type_mismatch" && type !== requirementRow.type ? requirementRow : null;
  const requiredBy = requirementRow?.required_by ?? [];

  const revealSecret = () =>
    callTool("get_var", { name, reveal: true, profile }).then((r) => {
      if (typeof r.value !== "string") throw new Error(`${name} has no secret value to reveal`);
      return r.value;
    });

  // Read at call time, not closed over: a toast's "Try again" can invoke a `doSave` bound to an earlier
  // render, and without this it would silently re-save whatever the fields held back then, not what's on
  // screen now (and could resurrect a save the fields no longer even support, e.g. if they'd since gone
  // invalid).
  const latestRef = useRef({ nameField, trimmedName, type, description, value, secretState, creating, canSave, saving });
  latestRef.current = { nameField, trimmedName, type, description, value, secretState, creating, canSave, saving };

  const doSave = () => {
    const cur = latestRef.current;
    if (!cur.canSave || cur.saving) return;
    setSaving(true);
    const finalName = cur.creating ? cur.trimmedName : name;
    const payload: SetVarInput = { name: finalName, type: cur.type, description: cur.description, profile };
    if (cur.type === "secret") {
      if (cur.secretState.changed) payload.value = cur.secretState.value;
      // else: omit — keep the stored secret (spec §4.3: `set_var` keeps the current value when omitted).
    } else {
      payload.value = fromEdit(cur.type, cur.value);
    }
    callTool("set_var", payload).then(
      // Awaited: a new variable is about to (eventually) navigate to its own URL, which reads this same
      // variable back out of the overview cache to classify itself — that has to already show the just-
      // created row, or it would wrongly conclude the variable doesn't exist yet.
      async (result) => {
        await invalidateFor([`profile:${profile}`]);
        toast(`Saved ${result.name}`);
        // Told, regardless of whether this form is still mounted; but if the operator has already left (or
        // is about to, having discarded this in the meantime), don't touch its state or redirect them back.
        if (!mountedRef.current) return;
        setSaving(false);
        setBaseline({ name: result.name, type: result.type, description: result.description, value: cur.value, secretChanged: false });
        setSecretState(EMPTY_SECRET);
        if (cur.creating) setPendingRedirect(result.name);
      },
      (e: unknown) => {
        if (mountedRef.current) setSaving(false);
        showError(e, doSave);
      },
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 @max-[640px]:px-3">
        {isBlankNew ? (
          <span className="truncate text-base font-medium text-foreground-strong">New variable</span>
        ) : (
          <>
            <Mono className="min-w-0 truncate text-base font-medium" title={name}>
              {name}
            </Mono>
            <Badge>{type}</Badge>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 @max-[640px]:p-3">
        <div className="flex flex-col gap-4">
          {creating && (
            <Field label="Name" htmlFor="var-name">
              <Input
                id="var-name"
                ref={nameInputRef}
                autoFocus={isBlankNew}
                className="font-mono"
                spellCheck={false}
                value={nameField}
                onChange={(e) => {
                  nameCaretRef.current = e.target.selectionStart;
                  setNameField(e.target.value.toUpperCase());
                }}
                aria-invalid={dirty && nameErr !== null}
                aria-describedby={dirty && nameErr ? "var-name-error" : undefined}
              />
              {dirty && nameErr && (
                <p id="var-name-error" className="text-xs text-destructive">
                  {nameErr}
                </p>
              )}
            </Field>
          )}

          <Field label={`Value · ${type}`} htmlFor="var-value">
            <VarEditor
              id="var-value"
              type={type}
              value={value}
              onChange={setValue}
              error={dirty ? valueErr : null}
              secret={
                type === "secret"
                  ? { state: secretState, onChange: setSecretState, reveal: revealSecret, canRevealStored: !creating && baseline.type === "secret" }
                  : undefined
              }
            />
          </Field>

          {mismatchRow && (
            <div className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-tint px-3 py-2">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={1.75} />
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-warning">
                <p>
                  {mismatchRow.required_by[0]?.script ?? "A script"} needs {name} as {mismatchRow.type}; it is {mismatchRow.actual}.
                </p>
                <button
                  type="button"
                  className="w-fit font-medium text-warning underline decoration-dotted underline-offset-2 hover:decoration-solid"
                  onClick={() => handleTypeChange(mismatchRow.type)}
                >
                  Change type to {mismatchRow.type}
                </button>
              </div>
            </div>
          )}

          <Field label="Type" htmlFor="var-type">
            <Select value={type} onValueChange={(v) => handleTypeChange(v as VarType)}>
              <SelectTrigger id="var-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VAR_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Description" htmlFor="var-description">
            <Input id="var-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <Field label="Required by">
            {requiredBy.length === 0 ? (
              <p className="text-sm text-muted-foreground">No script needs it.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {requiredBy.map((r) => (
                  <Link key={r.script} href={`/scripts/${encodeURIComponent(r.script)}`} className="w-fit text-sm text-link hover:underline">
                    <Mono>{r.script}</Mono> <span className="text-muted-foreground">· {appName(r.app)} · {r.event ?? "—"}</span>
                  </Link>
                ))}
              </div>
            )}
          </Field>
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-t border-border px-4 @max-[640px]:px-3">
        <div>
          {!creating && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="micro-label">Unsaved changes</span>}
          <Button size="sm" disabled={!canSave || saving} aria-busy={saving} onClick={doSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {!creating && (
        <ChangePreviewDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete ${name}?`}
          applyLabel="Delete"
          destructive
          plan={() => callTool("delete_var", { name, dry_run: true, profile })}
          describe={(p) => {
            if (!("would_delete" in p)) throw new Error("delete_var: unexpected dry-run result");
            const { profile: deletedFrom, name: deletedName } = p.would_delete;
            return {
              summary: (
                <>
                  Delete <Mono className="text-foreground">{deletedName}</Mono> from <Mono className="text-foreground">{deletedFrom}</Mono>.
                </>
              ),
              changes: [{ kind: "delete", target: `${deletedFrom} › ${deletedName}`, detail: { text: "removed" } }],
              warnings:
                requiredBy.length > 0
                  ? requiredBy.map((r) => `${r.script} needs it and will stop with an error until it is set again.`)
                  : undefined,
            };
          }}
          apply={() => callTool("delete_var", { name, profile })}
          onApplied={async () => {
            await invalidateFor([`profile:${profile}`]);
            toast(`Deleted ${name}`);
            // Deleting discards whatever was unsaved here too — nothing left to ask about. Unlike a save,
            // there's no later render to naturally settle `dirty` to false (the variable is simply gone), so
            // this clears the guard's set directly rather than waiting on one.
            markSaved(`variable:${name}`);
            navigate("/variables", { replace: true });
          }}
        />
      )}
    </div>
  );
}

/**
 * Loads `variables_overview` (shared with the list — no extra fetch) and renders the form once it has data.
 * `name` is the route param: `"new"`, an existing variable, or a name that only a requirement knows. `profile`
 * is the active profile as of when this mounted (the caller keys on it, so a switch remounts rather than
 * silently retargeting an open edit at a different profile).
 */
export function VariableDetail({ name, profile, overview }: {
  name: string; profile: string; overview: UseQueryResult<VariablesOverviewOutput>;
}) {
  if (overview.isPending) return <DetailSkeleton />;
  if (overview.isError && !overview.isSuccess) {
    return (
      <div className="p-4 @max-[640px]:p-3">
        <ErrorPanel error={overview.error} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      </div>
    );
  }
  if (!overview.data) return <DetailSkeleton />;
  return <VariableForm name={name} profile={profile} data={overview.data} />;
}
