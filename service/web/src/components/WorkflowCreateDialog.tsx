import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { createWorkflow, fetchSchemas } from '#/lib/api'
import type { Workflow } from '#/lib/api'
import { useState } from 'react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '#/components/ui/select'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WorkflowCreateDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: schemas } = useQuery({ queryKey: ['schemas'], queryFn: fetchSchemas })

  const [name, setName] = useState('')
  const [eventType, setEventType] = useState('')

  const createMut = useMutation({
    mutationFn: (wf: Omit<Workflow, 'id' | 'created_at' | 'updated_at'>) =>
      createWorkflow(wf),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      onOpenChange(false)
      navigate({ to: '/workflows/$id', params: { id: created.id } })
    },
  })

  // Build grouped event options
  const eventsByApp: Record<string, { value: string; label: string; app: string }[]> = {}
  if (schemas) {
    for (const schema of Object.values(schemas)) {
      for (const [eventName, evt] of Object.entries(schema.events)) {
        if (!evt) continue
        ;(eventsByApp[schema.display_name] ??= []).push({
          value: eventName,
          label: evt.display_name,
          app: schema.app,
        })
      }
    }
  }

  function handleCreate() {
    if (!name.trim() || !eventType) return
    const allOpts = Object.values(eventsByApp).flat()
    const selectedApp = allOpts.find((e) => e.value === eventType)?.app ?? ''
    createMut.mutate({
      name: name.trim(),
      enabled: true,
      trigger: { event_type: eventType, app_id: selectedApp },
      steps: [],
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Workflow</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="wf-name">Name</Label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Slack notify on copy complete"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Trigger Event</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select event..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(eventsByApp).map(([appName, opts]) => (
                  <SelectGroup key={appName}>
                    <SelectLabel>{appName}</SelectLabel>
                    {opts.map((opt) => (
                      <SelectItem key={`${opt.app}/${opt.value}`} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !eventType || createMut.isPending}
          >
            {createMut.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
