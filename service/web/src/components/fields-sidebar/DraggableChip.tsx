import { GripHorizontal } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { cn } from '#/lib/utils'
import { hasLastFocusedField, insertIntoLastFocusedField } from '#/lib/field-insertion'

interface DraggableChipProps {
  label: string
  value: string
  badge?: string
  icon?: React.ReactNode
  className?: string
  title?: string
}

export function DraggableChip({ label, value, badge, icon, className, title }: DraggableChipProps) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', value)
        e.dataTransfer.setData('application/x-quill-template', value)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => {
        insertIntoLastFocusedField(value)
      }}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1.5',
        'cursor-grab text-xs transition-colors group select-none active:cursor-grabbing',
        'hover:border-primary/40 hover:bg-accent/30',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
      title={title ?? `${hasLastFocusedField() ? 'Click or drag to insert' : 'Drag to insert'}: ${value}`}
    >
      <GripHorizontal className="size-3 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0" />
      {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      <span className="font-mono truncate flex-1">{label}</span>
      {badge && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 max-w-20 truncate">
          {badge}
        </Badge>
      )}
    </button>
  )
}
