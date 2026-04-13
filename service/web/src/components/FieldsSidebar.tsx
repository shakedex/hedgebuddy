import { useMemo, useState } from 'react'
import type { ActionMeta, Field, OutputMeta } from '#/lib/api'
import type { Step } from '#/lib/generated/storage'
import type { Quill } from '#/lib/generated/quills'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Badge } from '#/components/ui/badge'
import { Input } from '#/components/ui/input'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '#/components/ui/popover'
import { GripHorizontal, Clock, Hash, FileText, Braces, Settings2, ArrowRight } from 'lucide-react'

// ── Template definitions ──

interface TemplateItem {
  label: string
  value: string
  icon: typeof Braces
  /** If set, this chip opens a format configurator before inserting. */
  configurable?: true
  /** Preset formats for configurable items. */
  presets?: { label: string; value: string; example: string }[]
}

const DATE_PRESETS = [
  { label: 'Date (ISO)', value: '{{date}}', example: '2026-04-11' },
  { label: 'US Date', value: '{{date:MM/DD/YYYY}}', example: '04/11/2026' },
  { label: 'EU Date', value: '{{date:DD.MM.YYYY}}', example: '11.04.2026' },
  { label: 'Compact', value: '{{date:YYYYMMDD}}', example: '20260411' },
  { label: 'Time 24h', value: '{{date:HH:mm:ss}}', example: '14:30:05' },
  { label: 'Time 24h short', value: '{{date:HH:mm}}', example: '14:30' },
  { label: 'Full datetime', value: '{{datetime}}', example: '2026-04-11T14:30:05Z' },
  { label: 'Date + Time', value: '{{date:YYYY-MM-DD_HH-mm-ss}}', example: '2026-04-11_14-30-05' },
  { label: 'Unix timestamp', value: '{{timestamp}}', example: '1776192605' },
]

const TEMPLATE_ITEMS: TemplateItem[] = [
  { label: 'App ID', value: '{{app_id}}', icon: Braces },
  { label: 'Event Name', value: '{{event_name}}', icon: Braces },
  { label: 'Event Summary', value: '{{event_summary}}', icon: FileText },
  { label: 'Date / Time', value: '{{date}}', icon: Clock, configurable: true, presets: DATE_PRESETS },
  { label: 'Counter', value: '{{counter}}', icon: Hash },
]

// ── Component ──

export interface StepOutputGroup {
  stepIndex: number
  label: string
  outputAlias: string
  outputs: OutputMeta[]
}

interface FieldsSidebarProps {
  eventFields: [string, Field][]
  eventType?: string
  steps?: Step[]
  quills?: Quill[]
  actions?: ActionMeta[]
}

/** Derive the default output alias from a quill/action ID (e.g. "file-ops" → "file_ops"). */
function defaultAlias(quillId: string, mode?: string): string {
  const base = quillId.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  return mode ? `${base}_${mode}` : base
}

/**
 * Resolve the output fields for a step by looking at the quill's last action step,
 * then finding that action's declared OutputMeta.
 */
function resolveStepOutputs(
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
function resolveAlias(step: Step, _stepIndex: number, quills: Quill[]): string {
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

export function FieldsSidebar({ eventFields, eventType, steps, quills, actions }: FieldsSidebarProps) {
  // Compute step output groups.
  const stepOutputGroups = useMemo((): StepOutputGroup[] => {
    if (!steps?.length || !quills?.length || !actions?.length) return []
    const groups: StepOutputGroup[] = []
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      if (!step.quill_id) continue
      const outputs = resolveStepOutputs(step, quills, actions)
      if (outputs.length === 0) continue
      const quill = quills.find((q) => q.id === step.quill_id)
      const label = quill?.name ?? step.quill_id
      const alias = resolveAlias(step, i, quills)
      groups.push({ stepIndex: i, label, outputAlias: alias, outputs })
    }
    return groups
  }, [steps, quills, actions])

  return (
    <div className="w-56 shrink-0 rounded-lg border border-border bg-card/50 self-start sticky top-6">
      <div className="px-3 py-2.5 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Drag into inputs
        </h3>
      </div>
      <ScrollArea className="max-h-[calc(100vh-12rem)]">
        <div className="p-2 space-y-3">
          {/* Event fields */}
          {eventFields.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Event Fields
              </p>
              {eventFields.map(([name, field]) => (
                <DraggableChip
                  key={name}
                  label={name}
                  value={`{{event.${eventType}_${name}}}`}
                  badge={field.type}
                />
              ))}
            </div>
          )}

          {/* Step outputs */}
          {stepOutputGroups.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Step Outputs
              </p>
              {stepOutputGroups.map((group) => (
                <div key={group.stepIndex} className="space-y-1">
                  <div className="flex items-center gap-1 px-1">
                    <ArrowRight className="size-3 text-muted-foreground/60" />
                    <p className="text-[10px] font-medium text-muted-foreground truncate" title={`Step ${group.stepIndex + 1}: ${group.label} → ${group.outputAlias}`}>
                      Step {group.stepIndex + 1}: {group.label}
                    </p>
                  </div>
                  {group.outputs.map((out) => (
                    <DraggableChip
                      key={`${group.outputAlias}.${out.name}`}
                      label={`${group.outputAlias}.${out.name}`}
                      value={`{{steps.${group.outputAlias}.${out.name}}}`}
                      badge={out.type}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Template items */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Templates
            </p>
            {TEMPLATE_ITEMS.map((item) =>
              item.configurable ? (
                <ConfigurableChip key={item.label} item={item} />
              ) : (
                <DraggableChip
                  key={item.value}
                  label={item.label}
                  value={item.value}
                  icon={<item.icon className="size-3" />}
                />
              ),
            )}
          </div>

          {eventFields.length === 0 && stepOutputGroups.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic px-1">
              Select a trigger event to see available fields
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Configurable chip (Date/Time) ──

function ConfigurableChip({ item }: { item: TemplateItem }) {
  const [open, setOpen] = useState(false)
  const [customFmt, setCustomFmt] = useState('')

  const customValue = customFmt.trim() ? `{{date:${customFmt.trim()}}}` : ''

  return (
    <div className="flex items-center gap-1">
      {/* The default draggable chip */}
      <DraggableChip
        label={item.label}
        value={item.value}
        icon={<item.icon className="size-3" />}
        className="flex-1"
      />

      {/* Configurator popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="p-1 rounded hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors">
            <Settings2 className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="left" align="start" className="w-60 p-0">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold">Date / Time Format</p>
            <p className="text-[10px] text-muted-foreground">Pick a preset or create a custom format. Drag from list.</p>
          </div>
          <ScrollArea className="max-h-52">
            <div className="p-1.5 space-y-0.5">
              {(item.presets ?? []).map((preset) => (
                <DraggableChip
                  key={preset.value}
                  label={preset.label}
                  value={preset.value}
                  badge={preset.example}
                />
              ))}
            </div>
          </ScrollArea>
          <div className="px-3 py-2 border-t border-border space-y-1.5">
            <p className="text-[10px] text-muted-foreground">
              Custom: YYYY, MM, DD, HH, mm, ss
            </p>
            <div className="flex gap-1.5">
              <Input
                value={customFmt}
                onChange={(e) => setCustomFmt(e.target.value)}
                placeholder="e.g. DD-MM-YY"
                className="font-mono text-xs h-7"
              />
              {customValue && (
                <DraggableChip label="⋯" value={customValue} className="shrink-0" />
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ── Base draggable chip ──

function DraggableChip({
  label,
  value,
  badge,
  icon,
  className,
}: {
  label: string
  value: string
  badge?: string
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', value)
        e.dataTransfer.setData('application/x-quill-template', value)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-border/60 bg-background
        hover:border-primary/40 hover:bg-accent/30 cursor-grab active:cursor-grabbing
        transition-colors text-xs group select-none ${className ?? ''}`}
      title={`Drag to insert: ${value}`}
    >
      <GripHorizontal className="size-3 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0" />
      {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      <span className="font-mono truncate flex-1">{label}</span>
      {badge && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 max-w-20 truncate">
          {badge}
        </Badge>
      )}
    </div>
  )
}
