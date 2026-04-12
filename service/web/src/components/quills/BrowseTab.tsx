import { Globe, Download, RefreshCw, Trash2 } from 'lucide-react'
import type { RemoteQuill } from '#/lib/api'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { CATEGORY_LABELS } from '#/lib/constants'

export function BrowseTab({
  repoQuills, isLoading, onInstall, onUninstall, onRefresh, installing, uninstalling,
}: {
  repoQuills: RemoteQuill[]
  isLoading: boolean
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  onRefresh: () => void
  installing?: string
  uninstalling?: string
}) {
  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Fetching quill repo...</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {repoQuills.length} quill(s) available in the official repository
        </p>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw className="size-3.5" /> Refresh
        </Button>
      </div>

      {repoQuills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Globe className="mx-auto size-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">No quills found in the repository. Check back later!</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
          {repoQuills.map((rq) => (
            <div key={rq.id} className="flex items-center gap-3 px-4 py-3 transition-all duration-150 hover:bg-muted/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{rq.name}</span>
                  <Badge variant="outline" className="text-[10px] font-mono">v{rq.version}</Badge>
                  {rq.category && (
                    <Badge variant="secondary" className="text-[10px]">
                      {CATEGORY_LABELS[rq.category] ?? rq.category}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{rq.description}</p>
                <p className="text-[10px] text-muted-foreground">by {rq.author}</p>
              </div>
              <div className="shrink-0">
                {rq.installed ? (
                  rq.update_available ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onInstall(rq.id)}
                      disabled={installing === rq.id}
                    >
                      <RefreshCw className="size-3.5" />
                      {installing === rq.id ? 'Updating...' : 'Update'}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onUninstall(rq.id)}
                      disabled={uninstalling === rq.id}
                    >
                      <Trash2 className="size-3.5" />
                      {uninstalling === rq.id ? 'Removing...' : 'Uninstall'}
                    </Button>
                  )
                ) : (
                  <Button
                    size="sm"
                    onClick={() => onInstall(rq.id)}
                    disabled={installing === rq.id}
                  >
                    <Download className="size-3.5" />
                    {installing === rq.id ? 'Installing...' : 'Install'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
