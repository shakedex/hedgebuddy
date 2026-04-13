import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { loadQuillOptions } from '#/lib/api'
import { Button } from '#/components/ui/button'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '#/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '#/components/ui/command'
import { ChevronsUpDown, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'

/**
 * Searchable dropdown that fetches options dynamically from the backend
 * via POST /api/quills/{id}/load-options.
 */
export function DynamicSelect({
  quillId, inputName, value, onChange,
}: {
  quillId: string
  inputName: string
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

  const { data: options, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['quill-options', quillId, inputName],
    queryFn: () => loadQuillOptions(quillId, inputName),
    enabled: open, // only fetch when dropdown is opened
    staleTime: 30_000,
  })

  const selectedLabel = options?.find((o) => o.value === value)?.label

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-mono text-xs h-9"
        >
          <span className="truncate">
            {value ? (selectedLabel ?? value) : 'Select...'}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." className="text-xs" />
          <CommandList>
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading options...
              </div>
            )}
            {isError && (
              <div className="flex flex-col items-center gap-2 py-4 text-xs">
                <div className="flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="size-3.5" />
                  <span className="truncate max-w-[200px]" title={(error as Error)?.message}>
                    {(error as Error)?.message?.includes('settings')
                      ? 'Configure quill settings first'
                      : (error as Error)?.message || 'Failed to load options'}
                  </span>
                </div>
                <Button variant="ghost" size="xs" onClick={() => refetch()}>
                  <RefreshCw className="size-3" />
                  Retry
                </Button>
              </div>
            )}
            {!isLoading && !isError && (
              <>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup>
                  {(options ?? []).map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      onSelect={() => {
                        onChange(opt.value)
                        setOpen(false)
                      }}
                      className="text-xs"
                    >
                      <span className="truncate">{opt.label}</span>
                      {opt.value !== opt.label && (
                        <span className="ml-auto text-[10px] text-muted-foreground font-mono truncate max-w-[100px]">
                          {opt.value}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          {!isLoading && !isError && (
            <div className="border-t border-border p-1">
              <Button
                variant="ghost"
                size="xs"
                className="w-full text-[10px]"
                onClick={() => refetch()}
              >
                <RefreshCw className="size-2.5" />
                Refresh
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
