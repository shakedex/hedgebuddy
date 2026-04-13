import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '#/components/ui/popover'
import { DraggableChip } from './DraggableChip'
import type { TemplateItem } from './templates'

interface ConfigurableChipProps {
  item: TemplateItem
}

export function ConfigurableChip({ item }: ConfigurableChipProps) {
  const [open, setOpen] = useState(false)
  const [customFmt, setCustomFmt] = useState('')

  const customValue = customFmt.trim() ? `{{date:${customFmt.trim()}}}` : ''

  return (
    <div className="flex items-center gap-1">
      <DraggableChip
        label={item.label}
        value={item.value}
        icon={<item.icon className="size-3" />}
        className="flex-1"
      />

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
