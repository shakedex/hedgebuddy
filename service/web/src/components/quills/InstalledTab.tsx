import { Package } from 'lucide-react'
import type { Quill } from '#/lib/api'
import { QuillCard } from './QuillCard'

export function InstalledTab({
  quills, onUninstall, uninstalling,
}: {
  quills: Quill[]
  onUninstall: (id: string) => void
  uninstalling?: string
}) {
  if (quills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <Package className="mx-auto size-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">No quills installed yet.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Browse the repo or use Manual Install to add one.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {quills.map((q) => (
        <QuillCard
          key={q.id}
          quill={q}
          onUninstall={q.source === 'installed' ? () => onUninstall(q.id) : undefined}
          isUninstalling={uninstalling === q.id}
        />
      ))}
    </div>
  )
}
