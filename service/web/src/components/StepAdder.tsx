import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Quill, ActionMeta } from '#/lib/api'
import { CATEGORY_LABELS } from '#/lib/constants'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '#/components/ui/popover'
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '#/components/ui/command'

/**
 * Dropdown command-palette for selecting a quill or action to add as a step.
 */
export function StepAdder({
  quills, actionsByCategory, onSelect,
}: {
  quills: Quill[]
  actionsByCategory: Record<string, ActionMeta[]>
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  function pick(id: string) {
    onSelect(id)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Add Step
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search quills & actions..." />
          <CommandList>
            <CommandEmpty>No matching quills or actions</CommandEmpty>

            {quills.length > 0 && (
              <CommandGroup heading="Quills">
                {quills.map((q) => (
                  <CommandItem key={q.id} value={q.id} onSelect={() => pick(q.id)}>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm">{q.name}</span>
                        {q.source === 'installed' && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">installed</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{q.description}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {Object.entries(actionsByCategory).map(([cat, acts]) => (
              <CommandGroup key={cat} heading={CATEGORY_LABELS[cat] ?? cat}>
                {acts.map((a) => (
                  <CommandItem key={a.name} value={a.name} onSelect={() => pick(a.name)}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium font-mono text-xs">{a.name}</span>
                      <span className="text-xs text-muted-foreground">{a.description}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
