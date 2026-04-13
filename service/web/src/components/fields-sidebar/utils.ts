import type { ActionMeta, OutputMeta } from '#/lib/api'
import type { Step } from '#/lib/generated/storage'
import type { Quill } from '#/lib/generated/quills'

export interface StepOutputGroup {
  stepIndex: number
  label: string
  outputAlias: string
  outputs: OutputMeta[]
}

/** Derive the default output alias from a quill/action ID (e.g. "file-ops" → "file_ops"). */
export function defaultAlias(quillId: string, mode?: string): string {
  const base = quillId.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  return mode ? `${base}_${mode}` : base
}

/**
 * Resolve the output fields for a step by looking at the quill's last action step,
 * then finding that action's declared OutputMeta.
 */
export function resolveStepOutputs(
  step: Step,
  quills: Quill[],
  actions: ActionMeta[],
): OutputMeta[] {
  const quill = quills.find((q) => q.id === step.quill_id)
  if (quill) {
    const mode = step.mode ?? ''
    const modeSteps = mode ? quill.modes?.[mode]?.steps : undefined
    const steps = modeSteps ?? quill.steps ?? []
    if (steps.length === 0) return []
    const lastWithOutput = [...steps].reverse().find((s) => s.output)
    const actionName = lastWithOutput?.action ?? steps[steps.length - 1]?.action
    if (actionName) {
      const action = actions.find((a) => a.name === actionName)
      return action?.outputs ?? []
    }
    return []
  }
  const action = actions.find((a) => a.name === step.quill_id)
  return action?.outputs ?? []
}

/** Derive the output alias for a step. */
export function resolveAlias(step: Step, _stepIndex: number, quills: Quill[]): string {
  if (step.output_alias) return step.output_alias
  const quill = quills.find((q) => q.id === step.quill_id)
  if (quill) {
    const mode = step.mode ?? ''
    const modeSteps = mode ? quill.modes?.[mode]?.steps : undefined
    const steps = modeSteps ?? quill.steps ?? []
    if (steps.length === 0) return defaultAlias(step.quill_id, step.mode)
    const lastWithOutput = [...steps].reverse().find((s) => s.output)
    if (lastWithOutput?.output) return lastWithOutput.output
    return defaultAlias(step.quill_id, step.mode)
  }
  return defaultAlias(step.quill_id)
}
