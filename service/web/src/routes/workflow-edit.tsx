import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from '@tanstack/react-router'
import {
  fetchWorkflow, updateWorkflow, fetchSchemas, fetchQuills, fetchActions, fetchHBVars, runWorkflow,
} from '#/lib/api'
import type { Workflow, Step, StepInput, Condition, ActionMeta, Field } from '#/lib/api'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Save, ArrowLeft, Play } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { FieldsSidebar } from '#/components/FieldsSidebar'
import { WorkflowRunHistory } from '#/components/WorkflowRunHistory'
import {
  Alerts, TriggerSection, StepsSection, LeaveDialog,
  deriveOutputAlias, validateWorkflow,
} from '#/components/workflow-edit'

// ─── Page ────────────────────────────────────────────────────────────────────

export function WorkflowEditPage() {
  const { id = '' } = useParams({ strict: false })
  const navigate = useNavigate()
  const qc = useQueryClient()

  // ── Data fetching ──
  const { data: workflow, isLoading } = useQuery({ queryKey: ['workflow', id], queryFn: () => fetchWorkflow(id) })
  const { data: schemas } = useQuery({ queryKey: ['schemas'], queryFn: fetchSchemas })
  const { data: quillsList } = useQuery({ queryKey: ['quills'], queryFn: fetchQuills })
  const { data: actionsList } = useQuery({ queryKey: ['actions'], queryFn: fetchActions })
  const { data: hbVars } = useQuery({ queryKey: ['hedgebuddy-vars'], queryFn: fetchHBVars })

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
    return Object.entries(schemas[selectedEvent.app].events[selectedEvent.value]?.fields ?? {})
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
  function update<TKey extends keyof Workflow>(key: TKey, val: Workflow[TKey]) {
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
    if (quill && !hasModes) inputs = quill.inputs.map((inp) => ({ name: inp.name, value: inp.default }))
    else if (action) inputs = action.inputs.map((inp) => ({ name: inp.name, value: inp.default ?? '' }))
    const output_alias = deriveOutputAlias(actionId, quill)
    updateStep(stepIdx, { quill_id: actionId, inputs, output_alias })
  }
  function addStep(actionId: string) {
    const quill = getQuill(actionId), action = getAction(actionId)
    let inputs: StepInput[] = []
    const hasModes = quill?.modes && Object.keys(quill.modes).length > 0
    if (quill && !hasModes) inputs = quill.inputs.map((inp) => ({ name: inp.name, value: inp.default }))
    else if (action) inputs = action.inputs.map((inp) => ({ name: inp.name, value: inp.default ?? '' }))
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
  const validate = useCallback(
    () => validateWorkflow(form, getQuill, getAction),
    [form, getQuill, getAction],
  )

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

          <StepsSection
            steps={form.steps ?? []}
            quillsList={quillsList ?? []}
            actionsList={actionsList ?? []}
            actionsByCategory={actionsByCategory}
            dragIdx={dragIdx}
            dragOverIdx={dragOverIdx}
            getQuill={getQuill}
            getAction={getAction}
            onAddStep={addStep}
            onUpdateStep={updateStep}
            onRemoveStep={removeStep}
            onSelectStepAction={selectStepAction}
            onDragStart={setDragIdx}
            onDragOver={setDragOverIdx}
            onDragEnd={() => {
              if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) moveStep(dragIdx, dragOverIdx)
              setDragIdx(null); setDragOverIdx(null)
            }}
          />

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
          hbVars={hbVars}
        />
      </div>

      <LeaveDialog
        open={showLeaveDialog}
        onOpenChange={setShowLeaveDialog}
        onStay={() => { setShowLeaveDialog(false); setPendingNav(null) }}
        onLeave={() => { setShowLeaveDialog(false); setDirty(false); pendingNav?.(); setPendingNav(null) }}
      />
    </div>
  )
}
