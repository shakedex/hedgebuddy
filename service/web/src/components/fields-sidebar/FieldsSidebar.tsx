import { useMemo } from 'react'
import type { ActionMeta, Field } from '#/lib/api'
import type { Step } from '#/lib/generated/storage'
import type { Quill } from '#/lib/generated/quills'
import { ScrollArea } from '#/components/ui/scroll-area'
import { ArrowRight } from 'lucide-react'
import { DraggableChip } from './DraggableChip'
import { ConfigurableChip } from './ConfigurableChip'
import { TEMPLATE_ITEMS } from './templates'
import { resolveStepOutputs, resolveAlias  } from './utils'
import type {StepOutputGroup} from './utils';

export interface FieldsSidebarProps {
  eventFields: [string, Field][]
  eventType?: string
  steps?: Step[]
  quills?: Quill[]
  actions?: ActionMeta[]
}

export function FieldsSidebar({ eventFields, eventType, steps, quills, actions }: FieldsSidebarProps) {
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
