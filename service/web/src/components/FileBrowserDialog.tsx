import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchBrowse } from '#/lib/api'
import type { BrowseEntry } from '#/lib/api'
import { Folder, File, ChevronRight, Home, ArrowUp } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'

interface FileBrowserDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSelect: (path: string) => void
  title?: string
  selectFolder?: boolean
}

export function FileBrowserDialog({
  open, onOpenChange, onSelect, title, selectFolder,
}: FileBrowserDialogProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [manualPath, setManualPath] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['browse', currentPath],
    queryFn: () => fetchBrowse(currentPath || undefined),
    enabled: open,
  })

  const entries = data?.entries ?? []
  const folders = entries.filter((e) => e.is_dir)
  const files = selectFolder ? [] : entries.filter((e) => !e.is_dir)

  function navigate(entry: BrowseEntry) {
    if (entry.is_dir) {
      setCurrentPath(entry.path)
      setManualPath(entry.path)
    } else {
      onSelect(entry.path)
      onOpenChange(false)
    }
  }

  function goUp() {
    const parts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length <= 1) {
      setCurrentPath('')
      setManualPath('')
    } else {
      parts.pop()
      const parent = parts.join('/')
      setCurrentPath(parent)
      setManualPath(parent)
    }
  }

  function selectCurrent() {
    onSelect(currentPath || manualPath)
    onOpenChange(false)
  }

  function handleManualSubmit() {
    if (manualPath) {
      setCurrentPath(manualPath)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? (selectFolder ? 'Select Folder' : 'Select File')}</DialogTitle>
        </DialogHeader>

        {/* Path bar */}
        <div className="flex gap-1.5">
          <Button variant="outline" size="icon-sm" onClick={() => { setCurrentPath(''); setManualPath('') }} aria-label="Go to root">
            <Home className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={goUp} disabled={!currentPath} aria-label="Go up">
            <ArrowUp className="size-3.5" />
          </Button>
          <Input
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            placeholder="Enter path..."
            className="font-mono text-xs flex-1"
          />
        </div>

        {/* File list */}
        <ScrollArea className="h-64 rounded-md border border-border">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Empty directory</div>
          ) : (
            <div className="divide-y divide-border">
              {folders.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => navigate(entry)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Folder className="size-4 text-blue-400 shrink-0" />
                  <span className="truncate">{entry.name}</span>
                  <ChevronRight className="size-3 text-muted-foreground ml-auto shrink-0" />
                </button>
              ))}
              {files.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => navigate(entry)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <File className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{entry.name}</span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {selectFolder && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={selectCurrent} disabled={!currentPath && !manualPath}>
              Select This Folder
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
