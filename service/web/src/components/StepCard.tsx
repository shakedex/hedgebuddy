import { GripVertical, Trash2, Info } from 'lucide-react'
import type { Step, Quill, ActionMeta } from '#/lib/api'
import { CATEGORY_LABELS } from '#/lib/constants'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Label } from '#/components/ui/label'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '#/components/ui/tooltip'
import { InputWithFieldPicker } from './InputWithFieldPicker'
import { StepAdder } from './StepAdder'

interface StepCardProps {
  index: number
  step: Step
  quill?: Quill
  action?: ActionMeta
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
  index, step, quill, action,
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
    onUpdate({ ...step, mode, inputs: modeInputs })
  }

  return (
    <div
      className={`rounded-lg border bg-card transition-all ${
        isDragging ? 'opacity-50 border-primary'
          : isDragOver ? 'border-primary/50 ring-1 ring-primary/30'
          : 'border-border'
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
                  <TooltipProvider key={key}>
                    <Tooltip>
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
                  </TooltipProvider>
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
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="size-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{def.description}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <InputWithFieldPicker
                  value={getInputValue(def.name)}
                  onChange={(v) => updateInput(def.name, v)}
                  inputDef={def}
                />
              </div>
            ))
          ) : !hasModes ? (
            <p className="text-xs text-muted-foreground italic">No configuration needed</p>
          ) : null}
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
