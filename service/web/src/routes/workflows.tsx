import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { fetchWorkflows, deleteWorkflow, updateWorkflow } from '#/lib/api'
import type { Workflow } from '#/lib/api'
import { Plus, Trash2, ToggleLeft, ToggleRight, Pencil } from 'lucide-react'
import { useState } from 'react'
import { WorkflowCreateDialog } from '#/components/WorkflowCreateDialog'
import { Button } from '#/components/ui/button'

export function WorkflowsPage() {
  const queryClient = useQueryClient()
  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
  })

  const [showCreate, setShowCreate] = useState(false)

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteWorkflow(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  })

  const toggleMut = useMutation({
    mutationFn: (wf: Workflow) => updateWorkflow(wf.id, { ...wf, enabled: !wf.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  })

  const all = workflows ?? []

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus />
          New Workflow
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : all.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No workflows yet. Create one to start automating.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {all.map((wf) => (
              <div key={wf.id} className="flex items-center gap-3 px-4 py-3">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => toggleMut.mutate(wf)}
                  title={wf.enabled ? 'Disable' : 'Enable'}
                >
                  {wf.enabled ? (
                    <ToggleRight className="size-5 text-green-500" />
                  ) : (
                    <ToggleLeft className="size-5" />
                  )}
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{wf.name}</p>
                  <p className="text-xs text-muted-foreground">
                    on <span className="font-mono">{wf.trigger.event_type}</span>
                    {wf.trigger.app_id && <> from {wf.trigger.app_id}</>}
                    {' '}&middot; {(wf.steps ?? []).length} step(s)
                  </p>
                </div>
                <Button variant="ghost" size="icon-xs" asChild aria-label="Edit workflow">
                  <Link to="/workflows/$id" params={{ id: wf.id }}>
                    <Pencil className="size-4" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Delete workflow"
                  onClick={() => {
                    if (confirm(`Delete workflow "${wf.name}"?`))
                      deleteMut.mutate(wf.id)
                  }}
                >
                  <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <WorkflowCreateDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  )
}
