import type { ActionMeta } from '#/lib/api'
import { Badge } from '#/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { CATEGORY_LABELS } from '#/lib/constants'

function ActionRow({ action }: { action: ActionMeta }) {
  return (
    <div className="px-3 py-2.5 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold font-mono">{action.name}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">{action.description}</p>
        {(action.inputs ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {(action.inputs ?? []).map((inp) => (
              <Tooltip key={inp.name}>
                <TooltipTrigger asChild>
                  <span>
                    <Badge variant="secondary" className="font-mono text-[10px] gap-0.5">
                      {inp.name}
                      {inp.required && <span className="text-destructive ml-0.5">*</span>}
                      {inp.values && inp.values.length > 0 && (
                        <span className="text-muted-foreground ml-0.5">
                          [{inp.values.join('|')}]
                        </span>
                      )}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {inp.description} ({inp.type}{inp.required ? ', required' : ''})
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ActionsTab({ actionsByCategory }: { actionsByCategory: Record<string, ActionMeta[]> }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Low-level actions that quills and workflow steps can call. Includes Hedge app integrations.
      </p>
      {Object.entries(actionsByCategory).map(([cat, acts]) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-sm font-semibold text-(--lagoon-deep)">
            {CATEGORY_LABELS[cat] ?? cat}
          </h3>
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {acts.map((act) => (
              <ActionRow key={act.name} action={act} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
