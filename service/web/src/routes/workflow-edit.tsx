import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from '@tanstack/react-router'
import {
  fetchWorkflow, updateWorkflow, fetchSchemas, fetchQuills, fetchActions, runWorkflow,
} from '#/lib/api'
import type { Workflow, Step, StepInput, Condition, ActionMeta, Field, Quill } from '#/lib/api'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Save, ArrowLeft, Plus, Zap, Play, AlertTriangle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '#/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { StepAdder } from '#/components/StepAdder'
import { StepCard } from '#/components/StepCard'
import { ConditionRow } from '#/components/ConditionRow'
import { FieldsSidebar } from '#/components/FieldsSidebar'
import { WorkflowRunHistory } from '#/components/WorkflowRunHistory'

// ─── Page ────────────────────────────────────────────────────────────────────

export function WorkflowEditPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const navigate = useNavigate()
  const qc = useQueryClient()

  // ── Data fetching ──
  const { data: workflow, isLoading } = useQuery({ queryKey: ['workflow', id], queryFn: () => fetchWorkflow(id) })
  const { data: schemas } = useQuery({ queryKey: ['schemas'], queryFn: fetchSchemas })
  const { data: quillsList } = useQuery({ queryKey: ['quills'], queryFn: fetchQuills })
  const { data: actionsList } = useQuery({ queryKey: ['actions'], queryFn: fetchActions })

  // ── Local state ──
  const [form, setForm] = useState<Partial<Workflow>>({})
  const [dirty, setDirty] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => { if (workflow) setForm(workflow) }, [workflow])

  // ── Browser close guard ──
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // ── Derived data ──
  const eventOptions = useMemo(() => {
    if (!schemas) return []
    const opts: { value: string; label: string; app: string; appDisplay: string }[] = []
    for (const s of Object.values(schemas)) {
      for (const [name, evt] of Object.entries(s.events)) {
        if (evt) opts.push({ value: name, label: evt.display_name, app: s.app, appDisplay: s.display_name })
      }
    }
    return opts
  }, [schemas])

  const selectedEvent = eventOptions.find((e) => e.value === form.trigger?.event_type)

  const eventFieldEntries: [string, Field][] = useMemo(() => {
    if (!selectedEvent || !schemas) return []
    return Object.entries(schemas[selectedEvent.app]?.events[selectedEvent.value]?.fields ?? {})
      .filter((e): e is [string, Field] => e[1] != null)
  }, [schemas, selectedEvent])

  const eventsByApp = useMemo(() =>
    eventOptions.reduce<Record<string, typeof eventOptions>>((acc, o) => {
      ;(acc[o.appDisplay] ??= []).push(o); return acc
    }, {}),
  [eventOptions])

  const actionsByCategory = useMemo(() => {
    const map: Record<string, ActionMeta[]> = {}
    for (const a of actionsList ?? []) { ;(map[a.category] ??= []).push(a) }
    return map
  }, [actionsList])

  // ── Lookups ──
  const getQuill = useCallback((qid: string) => quillsList?.find((q) => q.id === qid), [quillsList])
  const getAction = useCallback((name: string) => actionsList?.find((a) => a.name === name), [actionsList])

  // ── Updaters ──
  function update<K extends keyof Workflow>(key: K, val: Workflow[K]) {
    setForm((prev) => ({ ...prev, [key]: val }))
    setDirty(true)
  }
  function updateStep(idx: number, step: Step) {
    const steps = [...(form.steps ?? [])]; steps[idx] = step; update('steps', steps)
  }
  function removeStep(idx: number) { update('steps', (form.steps ?? []).filter((_, i) => i !== idx)) }
  function moveStep(from: number, to: number) {
    const s = [...(form.steps ?? [])]; const [m] = s.splice(from, 1); s.splice(to, 0, m); update('steps', s)
  }
  function selectStepAction(stepIdx: number, actionId: string) {
    const quill = getQuill(actionId), action = getAction(actionId)
    let inputs: StepInput[] = []
    const hasModes = quill?.modes && Object.keys(quill.modes).length > 0
    if (quill && !hasModes) inputs = (quill.inputs ?? []).map((inp) => ({ name: inp.name, value: inp.default ?? '' }))
    else if (action) inputs = (action.inputs ?? []).map((inp) => ({ name: inp.name, value: inp.default ?? '' }))
    const output_alias = deriveOutputAlias(actionId, quill)
    updateStep(stepIdx, { quill_id: actionId, inputs, output_alias })
  }
  function addStep(actionId: string) {
    const quill = getQuill(actionId), action = getAction(actionId)
    let inputs: StepInput[] = []
    const hasModes = quill?.modes && Object.keys(quill.modes).length > 0
    if (quill && !hasModes) inputs = (quill.inputs ?? []).map((inp) => ({ name: inp.name, value: inp.default ?? '' }))
    else if (action) inputs = (action.inputs ?? []).map((inp) => ({ name: inp.name, value: inp.default ?? '' }))
    const output_alias = deriveOutputAlias(actionId, quill)
    update('steps', [...(form.steps ?? []), { quill_id: actionId, inputs, output_alias }])
  }

  // ── Conditions ──
  function addCondition() {
    const c = [...(form.trigger?.conditions ?? []), { field: '', op: 'eq' as const, value: '' }]
    update('trigger', { ...form.trigger!, conditions: c })
  }
  function updateCondition(idx: number, cond: Condition) {
    const c = [...(form.trigger?.conditions ?? [])]; c[idx] = cond
    update('trigger', { ...form.trigger!, conditions: c })
  }
  function removeCondition(idx: number) {
    update('trigger', { ...form.trigger!, conditions: (form.trigger?.conditions ?? []).filter((_, i) => i !== idx) })
  }

  // ── Validation ──
  const validate = useCallback((): string[] => {
    const errs: string[] = []
    if (!form.name?.trim()) errs.push('Workflow name is required')
    if (!form.trigger?.app_id) errs.push('Trigger app is required')
    if (!form.trigger?.event_type) errs.push('Trigger event is required')
    const steps = form.steps ?? []
    if (steps.length === 0) errs.push('At least one step is required')
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      if (!step.quill_id) { errs.push(`Step ${i + 1}: no action selected`); continue }
      const quill = getQuill(step.quill_id), action = getAction(step.quill_id)
      const mode = step.mode ?? ''
      // Filter inputs for the selected mode.
      const quillInputs = (quill?.inputs ?? [])
        .filter((inp) => !inp.for_modes?.length || (mode && inp.for_modes.includes(mode)))
      const actionInputs = (!quill && action) ? (action.inputs ?? []) : []
      const required = [...quillInputs, ...actionInputs].filter((inp) => inp.required)
      for (const inp of required) {
        const val = (step.inputs ?? []).find((si) => si.name === inp.name)?.value
        if (!val?.trim()) errs.push(`Step ${i + 1} (${quill?.name ?? step.quill_id}): "${inp.name}" is required`)
      }
    }
    return errs
  }, [form, getQuill, getAction])

  function guardedNavigate(to: () => void) {
    if (dirty) { setPendingNav(() => to); setShowLeaveDialog(true) } else to()
  }

  // ── Mutations ──
  const saveMut = useMutation({
    mutationFn: () => {
      const e = validate()
      if (e.length > 0) { setValidationErrors(e); return Promise.reject(new Error('Validation failed')) }
      setValidationErrors([]); setSaveError(null)
      return updateWorkflow(id, form as Workflow)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      qc.invalidateQueries({ queryKey: ['workflow', id] })
      setDirty(false)
    },
    onError: (err) => { if (err.message !== 'Validation failed') setSaveError(err.message) },
  })

  const testMut = useMutation({
    mutationFn: () => runWorkflow(id),
    onSuccess: () => setTestResult({ ok: true, msg: 'Workflow executed successfully' }),
    onError: (err) => setTestResult({ ok: false, msg: err.message }),
  })

  // ── Loading ──
  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
  if (!workflow) return <div className="p-8 text-center text-sm text-muted-foreground">Workflow not found</div>

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => guardedNavigate(() => navigate({ to: '/workflows' }))} aria-label="Back to workflows">
          <ArrowLeft />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight flex-1">Edit Workflow</h1>
        <Button
          variant="outline"
          onClick={() => { setTestResult(null); testMut.mutate() }}
          disabled={testMut.isPending || dirty}
          title={dirty ? 'Save first' : 'Run workflow with a test event'}
        >
          <Play />
          {testMut.isPending ? 'Running...' : 'Test Run'}
        </Button>
        <Button onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
          <Save />
          {saveMut.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* Alerts */}
      <Alerts errors={validationErrors} saveError={saveError} testResult={testResult} />

      {/* Main content + sidebar */}
      <div className="flex gap-6 items-start">
        {/* Left: form */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Workflow Name</Label>
            <Input value={form.name ?? ''} onChange={(e) => update('name', e.target.value)} />
          </div>

          {/* Trigger */}
          <TriggerSection
            form={form}
            eventsByApp={eventsByApp}
            eventOptions={eventOptions}
            eventFieldEntries={eventFieldEntries}
            selectedEvent={selectedEvent}
            onUpdate={update}
            onAddCondition={addCondition}
            onUpdateCondition={updateCondition}
            onRemoveCondition={removeCondition}
          />

          {/* Steps */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Steps</h2>
              <StepAdder
                quills={quillsList ?? []}
                actionsByCategory={actionsByCategory}
                onSelect={addStep}
              />
            </div>

            {(form.steps ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No steps yet. Add a step to define what happens when this workflow triggers.
              </div>
            ) : (
              <div className="space-y-2">
                {(form.steps ?? []).map((step, i) => (
                  <StepCard
                    key={i}
                    index={i}
                    step={step}
                    quill={getQuill(step.quill_id)}
                    action={getAction(step.quill_id)}
                    allActions={actionsList}
                    onUpdate={(s) => updateStep(i, s)}
                    onRemove={() => removeStep(i)}
                    onSelectAction={(aid) => selectStepAction(i, aid)}
                    quillsList={quillsList ?? []}
                    actionsByCategory={actionsByCategory}
                    isDragging={dragIdx === i}
                    isDragOver={dragOverIdx === i}
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={() => setDragOverIdx(i)}
                    onDragEnd={() => {
                      if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) moveStep(dragIdx, dragOverIdx)
                      setDragIdx(null); setDragOverIdx(null)
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Runs */}
          <WorkflowRunHistory workflowId={id} />
        </div>

        {/* Right: sidebar */}
        <FieldsSidebar
          eventFields={eventFieldEntries}
          eventType={selectedEvent?.value}
          steps={form.steps}
          quills={quillsList}
          actions={actionsList}
        />
      </div>

      {/* Leave dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? Changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowLeaveDialog(false); setPendingNav(null) }}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowLeaveDialog(false); setDirty(false); pendingNav?.(); setPendingNav(null) }}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive default output alias for a step — matches FieldsSidebar's logic. */
function deriveOutputAlias(quillId: string, quill?: Quill, mode?: string): string {
  if (quill) {
    // Check mode-specific steps first, then top-level steps.
    const modeSteps = mode ? quill.modes?.[mode]?.steps : undefined
    const steps = modeSteps ?? quill.steps ?? []
    if (steps.length > 0) {
      const lastWithOutput = [...steps].reverse().find((s) => s.output)
      if (lastWithOutput?.output) return lastWithOutput.output
    }
  }
  const base = quillId.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  return mode ? `${base}_${mode}` : base
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Alerts({ errors, saveError, testResult }: {
  errors: string[]; saveError: string | null; testResult: { ok: boolean; msg: string } | null
}) {
  return (
    <>
      {errors.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" />Please fix before saving:
          </div>
          <ul className="list-disc list-inside text-xs text-destructive space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {saveError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive">
          Save failed: {saveError}
        </div>
      )}
      {testResult && (
        <div className={`rounded-lg border p-3 text-xs ${
          testResult.ok ? 'border-green-500/30 bg-green-500/5 text-green-400' : 'border-destructive/50 bg-destructive/5 text-destructive'
        }`}>
          {testResult.ok ? 'Test run started successfully.' : `Test run failed: ${testResult.msg}`}
        </div>
      )}
    </>
  )
}

function TriggerSection({ form, eventsByApp, eventOptions, eventFieldEntries, selectedEvent, onUpdate, onAddCondition, onUpdateCondition, onRemoveCondition }: {
  form: Partial<Workflow>
  eventsByApp: Record<string, { value: string; label: string; app: string; appDisplay: string }[]>
  eventOptions: { value: string; label: string; app: string; appDisplay: string }[]
  eventFieldEntries: [string, Field][]
  selectedEvent?: { value: string; label: string; app: string; appDisplay: string }
  onUpdate: <K extends keyof Workflow>(key: K, val: Workflow[K]) => void
  onAddCondition: () => void
  onUpdateCondition: (i: number, c: Condition) => void
  onRemoveCondition: (i: number) => void
}) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="size-4 text-amber-500" /><h2 className="text-sm font-semibold">Trigger</h2>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">When this event fires</Label>
        <Select
          value={form.trigger?.event_type ?? ''}
          onValueChange={(val) => {
            const opt = eventOptions.find((o) => o.value === val)
            onUpdate('trigger', {
              ...form.trigger!,
              event_type: val,
              app_id: opt?.app ?? '',
              conditions: form.trigger?.conditions ?? [],
            })
          }}
        >
          <SelectTrigger className="w-full"><SelectValue placeholder="Select event..." /></SelectTrigger>
          <SelectContent>
            {Object.entries(eventsByApp).map(([appName, opts]) => (
              <SelectGroup key={appName}>
                <SelectLabel>{appName}</SelectLabel>
                {opts.map((opt) => (
                  <SelectItem key={`${opt.app}/${opt.value}`} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Conditions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Only if these conditions are met</Label>
          <Button variant="outline" size="xs" onClick={onAddCondition}><Plus /> Add Condition</Button>
        </div>
        {(form.trigger?.conditions ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No conditions — triggers on every event of this type</p>
        ) : (
          <div className="space-y-2">
            {(form.trigger?.conditions ?? []).map((c, i) => (
              <ConditionRow
                key={i}
                cond={c}
                eventFields={eventFieldEntries}
                eventType={selectedEvent?.value}
                onChange={(nc) => onUpdateCondition(i, nc)}
                onRemove={() => onRemoveCondition(i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
