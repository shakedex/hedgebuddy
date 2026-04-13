import { Plus, Zap } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '#/components/ui/select'
import { ConditionRow } from '#/components/ConditionRow'
import type { Workflow, Condition, Field } from '#/lib/api'

interface TriggerSectionProps {
  form: Partial<Workflow>
  eventsByApp: Record<string, { value: string; label: string; app: string; appDisplay: string }[]>
  eventOptions: { value: string; label: string; app: string; appDisplay: string }[]
  eventFieldEntries: [string, Field][]
  selectedEvent?: { value: string; label: string; app: string; appDisplay: string }
  onUpdate: <K extends keyof Workflow>(key: K, val: Workflow[K]) => void
  onAddCondition: () => void
  onUpdateCondition: (i: number, c: Condition) => void
  onRemoveCondition: (i: number) => void
}

export function TriggerSection({
  form, eventsByApp, eventOptions, eventFieldEntries, selectedEvent,
  onUpdate, onAddCondition, onUpdateCondition, onRemoveCondition,
}: TriggerSectionProps) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="size-4 text-amber-500" />
        <h2 className="text-sm font-semibold">Trigger</h2>
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
