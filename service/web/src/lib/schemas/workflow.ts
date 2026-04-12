import { z } from 'zod/v4'

// --- Workflow schemas ---

export const conditionSchema = z.object({
  field: z.string().min(1, 'Field is required'),
  op: z.enum([
    'eq', 'neq', 'contains', 'not_contains',
    'starts_with', 'ends_with', 'gt', 'lt',
    'empty', 'not_empty', 'in', 'regex',
  ]),
  value: z.string(),
})

export const triggerSchema = z.object({
  event_type: z.string().min(1, 'Event type is required'),
  app_id: z.string().optional(),
  conditions: z.array(conditionSchema).optional(),
})

export const stepInputSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
})

export const stepSchema = z.object({
  quill_id: z.string().min(1, 'Quill is required'),
  mode: z.string().optional(),
  inputs: z.array(stepInputSchema),
})

export const workflowSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Workflow name is required'),
  enabled: z.boolean(),
  trigger: triggerSchema,
  steps: z.array(stepSchema).min(1, 'At least one step is required'),
})

export type WorkflowFormData = z.infer<typeof workflowSchema>
export type ConditionFormData = z.infer<typeof conditionSchema>
export type StepFormData = z.infer<typeof stepSchema>

// --- Condition operator metadata ---

export const CONDITION_OPS = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
  { value: 'empty', label: 'is empty' },
  { value: 'not_empty', label: 'is not empty' },
  { value: 'in', label: 'is one of' },
  { value: 'regex', label: 'matches regex' },
] as const
