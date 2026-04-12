import type { Condition, Field } from '#/lib/api'
import { CONDITION_OPS } from '#/lib/schemas/workflow'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '#/components/ui/select'
import { Trash2 } from 'lucide-react'

/**
 * A single condition row: field selector, operator, value input.
 * Renders an enum dropdown for fields that have discrete values.
 */
export function ConditionRow({
  cond, eventFields, eventType, onChange, onRemove,
}: {
  cond: Condition
  eventFields: [string, Field][]
  eventType?: string
  onChange: (c: Condition) => void
  onRemove: () => void
}) {
  const fieldDef = eventFields.find(([n]) => cond.field.endsWith(n))?.[1]
  const showValue = cond.op !== 'empty' && cond.op !== 'not_empty'

  return (
    <div className="flex items-center gap-2">
      {/* Field */}
      <Select
        value={cond.field || undefined}
        onValueChange={(v) => onChange({ ...cond, field: v })}
      >
        <SelectTrigger className="flex-1 text-xs">
          <SelectValue placeholder="Field..." />
        </SelectTrigger>
        <SelectContent>
          {eventFields.map(([name]) => (
            <SelectItem key={name} value={`${eventType}_${name}`}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator */}
      <Select value={cond.op} onValueChange={(v) => onChange({ ...cond, op: v })}>
        <SelectTrigger className="w-40 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONDITION_OPS.map((op) => (
            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value */}
      {showValue && (
        fieldDef?.values && fieldDef.values.length > 0 ? (
          <Select
            value={cond.value || undefined}
            onValueChange={(v) => onChange({ ...cond, value: v })}
          >
            <SelectTrigger className="flex-1 text-xs">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {fieldDef.values.map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            placeholder="Value..."
            className="flex-1 text-xs"
          />
        )
      )}

      <Button variant="ghost" size="icon-xs" onClick={onRemove} aria-label="Remove condition">
        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  )
}
