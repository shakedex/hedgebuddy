import { GripHorizontal } from 'lucide-react'
import { Badge } from '#/components/ui/badge'

interface DraggableChipProps {
  label: string
  value: string
  badge?: string
  icon?: React.ReactNode
  className?: string
}

export function DraggableChip({ label, value, badge, icon, className }: DraggableChipProps) {
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
