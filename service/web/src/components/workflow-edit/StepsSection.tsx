import { StepAdder } from '#/components/StepAdder'
import { StepCard } from '#/components/StepCard'
import type { Step, ActionMeta, Quill } from '#/lib/api'

interface StepsSectionProps {
  steps: Step[]
  quillsList: Quill[]
  actionsList: ActionMeta[]
  actionsByCategory: Record<string, ActionMeta[]>
  dragIdx: number | null
  dragOverIdx: number | null
  getQuill: (id: string) => Quill | undefined
  getAction: (name: string) => ActionMeta | undefined
  onAddStep: (actionId: string) => void
  onUpdateStep: (idx: number, step: Step) => void
  onRemoveStep: (idx: number) => void
  onSelectStepAction: (stepIdx: number, actionId: string) => void
  onDragStart: (idx: number) => void
  onDragOver: (idx: number) => void
  onDragEnd: () => void
}

export function StepsSection({
  steps, quillsList, actionsList, actionsByCategory,
  dragIdx, dragOverIdx, getQuill, getAction,
  onAddStep, onUpdateStep, onRemoveStep, onSelectStepAction,
  onDragStart, onDragOver, onDragEnd,
}: StepsSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Steps</h2>
        <StepAdder
          quills={quillsList}
          actionsByCategory={actionsByCategory}
          onSelect={onAddStep}
        />
      </div>

      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No steps yet. Add a step to define what happens when this workflow triggers.
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((step, i) => (
            <StepCard
              key={i}
              index={i}
              step={step}
              quill={getQuill(step.quill_id)}
              action={getAction(step.quill_id)}
              allActions={actionsList}
              onUpdate={(s) => onUpdateStep(i, s)}
              onRemove={() => onRemoveStep(i)}
              onSelectAction={(aid) => onSelectStepAction(i, aid)}
              quillsList={quillsList}
              actionsByCategory={actionsByCategory}
              isDragging={dragIdx === i}
              isDragOver={dragOverIdx === i}
              onDragStart={() => onDragStart(i)}
              onDragOver={() => onDragOver(i)}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  )
}
