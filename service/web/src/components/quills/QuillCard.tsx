import { ChevronRight, Trash2 } from 'lucide-react'
import type { Quill } from '#/lib/api'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { CATEGORY_LABELS } from '#/lib/constants'

export function QuillCard({
  quill, onUninstall, isUninstalling,
}: {
  quill: Quill
  onUninstall?: () => void
  isUninstalling?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2 transition-all duration-150 hover:shadow-sm hover:border-(--lagoon)/30 border-t-2 border-t-(--lagoon)/40">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">{quill.name}</h3>
          <p className="text-xs text-muted-foreground">{quill.description}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="font-mono text-[10px]">v{quill.version}</Badge>
          {onUninstall && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onUninstall}
              disabled={isUninstalling}
              title="Uninstall"
            >
              <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {quill.inputs && quill.inputs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Inputs</p>
          <div className="flex flex-wrap gap-1">
            {quill.inputs.map((inp) => (
              <Tooltip key={inp.name}>
                <TooltipTrigger asChild>
                  <span>
                    <Badge variant="secondary" className="font-mono text-[11px] gap-0.5">
                      {inp.name}
                      {inp.required && <span className="text-destructive">*</span>}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {inp.description} ({inp.type}{inp.required ? ', required' : ''})
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {(quill.compatible_triggers ?? []).length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Triggers</p>
          <div className="flex flex-wrap gap-1">
            {quill.compatible_triggers.map((t) => (
              <Badge key={t} className="font-mono text-[11px]">
                {t === '*' ? 'Any event' : t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {quill.steps && quill.steps.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Steps ({quill.steps?.length ?? 0})
          </p>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {quill.steps.map((s, i) => (
              <span key={i} className="flex items-center gap-0.5">
                {i > 0 && <ChevronRight className="size-3" />}
                <span className="font-mono">{s.action}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
        <Badge variant={quill.source === 'builtin' ? 'secondary' : 'outline'} className="text-[9px]">
          {quill.source ?? 'builtin'}
        </Badge>
        <span>by {quill.author}</span>
        {quill.category && (
          <>
            <span>·</span>
            <span>{CATEGORY_LABELS[quill.category] ?? quill.category}</span>
          </>
        )}
      </div>
    </div>
  )
}
