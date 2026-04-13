import type { Workflow, Quill, ActionMeta } from '#/lib/api'

/** Derive default output alias for a step — matches FieldsSidebar's logic. */
export function deriveOutputAlias(quillId: string, quill?: Quill, mode?: string): string {
  if (quill) {
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

/** Validate a workflow form and return an array of error strings. */
export function validateWorkflow(
  form: Partial<Workflow>,
  getQuill: (id: string) => Quill | undefined,
  getAction: (name: string) => ActionMeta | undefined,
): string[] {
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
}
