import { GripVertical, Trash2, Info, Tag } from 'lucide-react'
import type { Step, Quill, ActionMeta } from '#/lib/api'
import { CATEGORY_LABELS } from '#/lib/constants'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '#/components/ui/tooltip'
import { InputWithFieldPicker } from './InputWithFieldPicker'
import { StepAdder } from './StepAdder'

interface StepCardProps {
  index: number
  step: Step
  quill?: Quill
  action?: ActionMeta
  allActions?: ActionMeta[]
  onUpdate: (s: Step) => void
  onRemove: () => void
  onSelectAction: (id: string) => void
  quillsList: Quill[]
  actionsByCategory: Record<string, ActionMeta[]>
  isDragging: boolean
  isDragOver: boolean
  onDragStart: () => void
  onDragOver: () => void
  onDragEnd: () => void
}

export function StepCard({
  index, step, quill, action, allActions,
  onUpdate, onRemove, onSelectAction,
  quillsList, actionsByCategory,
  isDragging, isDragOver, onDragStart, onDragOver, onDragEnd,
}: StepCardProps) {
  const displayName = quill?.name ?? action?.name ?? step.quill_id
  const description = quill?.description ?? action?.description ?? ''
  const category = quill?.category ?? action?.category ?? ''

  // Mode support
  const modes = quill?.modes
  const hasModes = modes && Object.keys(modes).length > 0
  const selectedMode = step.mode ?? ''
  const inputDefs = buildInputDefs(quill, action, selectedMode)

  function updateInput(name: string, value: string) {
    const inputs = [...(step.inputs ?? [])]
    const idx = inputs.findIndex((i) => i.name === name)
    if (idx >= 0) inputs[idx] = { ...inputs[idx], value }
    else inputs.push({ name, value })
    onUpdate({ ...step, inputs })
  }

  function getInputValue(name: string): string {
    return (step.inputs ?? []).find((i) => i.name === name)?.value ?? ''
  }

  function handleModeChange(mode: string) {
    if (!quill) return
    const modeInputs = (quill.inputs ?? [])
      .filter((inp) => !inp.for_modes?.length || inp.for_modes.includes(mode))
      .map((inp) => ({
        name: inp.name,
        value: (step.inputs ?? []).find((i) => i.name === inp.name)?.value ?? inp.default ?? '',
      }))
    // Recalculate output_alias for the new mode.
    const modeSteps = quill.modes?.[mode]?.steps ?? []
    const lastWithOutput = [...modeSteps].reverse().find((s) => s.output)
    const output_alias = lastWithOutput?.output ?? defaultOutputAlias({ ...step, mode })
    onUpdate({ ...step, mode, inputs: modeInputs, output_alias })
  }

  return (
    <div
      className={`rounded-lg border bg-card transition-all duration-150 ${
        isDragging ? 'opacity-50 scale-[1.02] border-primary shadow-lg'
          : isDragOver ? 'border-primary/50 ring-1 ring-primary/30'
          : 'border-border hover:shadow-sm'
      }`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver() }}
      onDrop={(e) => { e.preventDefault(); onDragEnd() }}
      onDragEnd={onDragEnd}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <GripVertical className="size-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing" />
        <span className="text-xs text-muted-foreground w-5">{index + 1}.</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{displayName || 'Select action...'}</span>
            {category && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {CATEGORY_LABELS[category] ?? category}
              </Badge>
            )}
          </div>
          {description && (
            <p className="text-[11px] text-muted-foreground truncate">{description}</p>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onRemove}>
          <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>

      {/* Body */}
      {!step.quill_id ? (
        <div className="p-3">
          <StepAdder
            quills={quillsList}
            actionsByCategory={actionsByCategory}
            onSelect={onSelectAction}
          />
        </div>
      ) : (
        <div className="p-3 space-y-3">
          {/* Mode selector */}
          {hasModes && (
            <div className="space-y-1.5">
              <Label className="text-xs">Mode</Label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(modes!).map(([key, mode]) => (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={selectedMode === key ? 'default' : 'outline'}
                        size="xs"
                        onClick={() => handleModeChange(key)}
                      >
                        {mode.label}
                      </Button>
                    </TooltipTrigger>
                    {mode.description && (
                      <TooltipContent>{mode.description}</TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </div>
            </div>
          )}

          {hasModes && !selectedMode && (
            <p className="text-xs text-amber-500 italic">Select a mode to configure inputs</p>
          )}

          {/* Inputs */}
          {inputDefs.length > 0 && (!hasModes || selectedMode) ? (
            inputDefs.map((def) => (
              <div key={def.name} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs">
                    {def.label}
                    {def.required && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  {def.description && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="size-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">{def.description}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <InputWithFieldPicker
                  value={getInputValue(def.name)}
                  onChange={(v) => updateInput(def.name, v)}
                  inputDef={def}
                  quillId={step.quill_id}
                />
              </div>
            ))
          ) : !hasModes ? (
            <p className="text-xs text-muted-foreground italic">No configuration needed</p>
          ) : null}

          {/* Output alias — only for actions that produce outputs */}
          {step.quill_id && hasOutputs(step, quill, allActions ?? []) && (
            <div className="mt-1 rounded-md bg-muted/40 border border-dashed border-border px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Tag className="size-3 text-primary/70" />
                <Label className="text-[11px] font-semibold text-primary/80 uppercase tracking-wider">Output as</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="size-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Name used to reference this step's output in later steps, e.g. {'{{steps.<name>.body}}'}
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                value={step.output_alias ?? ''}
                onChange={(e) => onUpdate({ ...step, output_alias: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                placeholder={defaultOutputAlias(step)}
                className="font-mono text-xs h-7 bg-background"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function buildInputDefs(quill: Quill | undefined, action: ActionMeta | undefined, mode: string) {
  if (quill) {
    return (quill.inputs ?? [])
      .filter((inp) => !inp.for_modes?.length || (mode && inp.for_modes.includes(mode)))
      .map((inp) => ({
        name: inp.name,
        type: inp.type,
        label: inp.label || inp.name,
        description: inp.description,
        required: inp.required,
        default: inp.default,
        values: inp.type === 'enum' ? inp.values : undefined,
      }))
  }
  if (action) {
    return (action.inputs ?? []).map((inp) => ({
      name: inp.name,
      type: inp.type,
      label: inp.name,
      description: inp.description,
      required: inp.required,
      default: inp.default,
      values: inp.values,
    }))
  }
  return []
}

/** Check if a step's underlying action(s) declare any outputs. */
function hasOutputs(step: Step, quill: Quill | undefined, allActions: ActionMeta[]): boolean {
  if (quill) {
    const mode = step.mode ?? ''
    const modeSteps = mode ? quill.modes?.[mode]?.steps : undefined
    const steps = modeSteps ?? quill.steps ?? []
    for (const s of steps) {
      const act = allActions.find((a) => a.name === s.action)
      if (act && (act.outputs?.length ?? 0) > 0) return true
    }
    return false
  }
  const act = allActions.find((a) => a.name === step.quill_id)
  return act != null && (act.outputs?.length ?? 0) > 0
}

/** Generate default output alias from quill ID. */
function defaultOutputAlias(step: Step): string {
  const base = step.quill_id.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  return step.mode ? `${base}_${step.mode}` : base
}
