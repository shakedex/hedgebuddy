import { useMemo, useState } from 'react'
import type { ActionMeta, Field, HBVarsResponse } from '#/lib/api'
import type { Step } from '#/lib/generated/storage'
import type { Quill } from '#/lib/generated/quills'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#/components/ui/collapsible'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'
import { cn } from '#/lib/utils'
import { ArrowRight, Braces, ChevronDown, Database, Layers3, Search, Sparkles } from 'lucide-react'
import { DraggableChip } from './DraggableChip'
import { ConfigurableChip } from './ConfigurableChip'
import { TEMPLATE_ITEMS } from './templates'
import { resolveStepOutputs, resolveAlias } from './utils'
import type { StepOutputGroup } from './utils'

type SectionKey = 'event' | 'steps' | 'hb' | 'templates'
type FilterKey = 'all' | SectionKey

interface LibraryItem {
  id: string
  label: string
  value: string
  badge?: string
  title?: string
  icon?: React.ReactNode
  searchText: string
}

const SECTION_LIMITS: Record<'event' | 'hb' | 'templates', number> = {
  event: 8,
  hb: 8,
  templates: 5,
}

export interface FieldsSidebarProps {
  eventFields: [string, Field][]
  eventType?: string
  steps?: Step[]
  quills?: Quill[]
  actions?: ActionMeta[]
  hbVars?: HBVarsResponse
}

export function FieldsSidebar({ eventFields, eventType, steps, quills, actions, hbVars }: FieldsSidebarProps) {
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    event: true,
    steps: true,
    hb: false,
    templates: false,
  })
  const [expandedLists, setExpandedLists] = useState<Record<'event' | 'hb' | 'templates', boolean>>({
    event: false,
    hb: false,
    templates: false,
  })

  const stepOutputGroups = useMemo((): StepOutputGroup[] => {
    if (!steps?.length || !quills?.length || !actions?.length) return []
    const groups: StepOutputGroup[] = []
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      if (!step.quill_id) continue
      const outputs = resolveStepOutputs(step, quills, actions)
      if (outputs.length === 0) continue
      const quill = quills.find((q) => q.id === step.quill_id)
      const label = quill?.name ?? step.quill_id
      const alias = resolveAlias(step, i, quills)
      groups.push({ stepIndex: i, label, outputAlias: alias, outputs })
    }
    return groups
  }, [steps, quills, actions])

  const eventItems = useMemo<LibraryItem[]>(() =>
    eventFields.map(([name, field]) => ({
      id: `event:${name}`,
      label: name,
      value: `{{event.${eventType}_${name}}}`,
      badge: field.type,
      title: `Drag to insert: {{event.${eventType}_${name}}}`,
      searchText: [name, field.type, eventType ?? '', 'event field'].join(' ').toLowerCase(),
    })),
  [eventFields, eventType])

  const hbItems = useMemo<LibraryItem[]>(() =>
    Object.entries(hbVars?.variables ?? {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, variable]) => ({
        id: `hb:${name}`,
        label: name,
        value: `{{hb.${name}}}`,
        badge: variable.type,
        title: [
          `Drag to insert: {{hb.${name}}}`,
          variable.description,
          variable.type === 'secret' ? 'Value hidden in UI (secret type)' : '',
        ].filter(Boolean).join('\n'),
        searchText: [name, variable.type, variable.description, hbVars?.profile ?? '', 'hedgebuddy variable'].join(' ').toLowerCase(),
      })),
  [hbVars])

  const templateItems = useMemo<LibraryItem[]>(() =>
    TEMPLATE_ITEMS.map((item) => ({
      id: `template:${item.value}`,
      label: item.label,
      value: item.value,
      icon: item.configurable ? undefined : <item.icon className="size-3" />,
      searchText: [item.label, item.value, 'template'].join(' ').toLowerCase(),
    })),
  [])

  const normalizedQuery = query.trim().toLowerCase()
  const matchesSearch = (item: LibraryItem) => !normalizedQuery || item.searchText.includes(normalizedQuery)

  const filteredEventItems = useMemo(() => eventItems.filter(matchesSearch), [eventItems, normalizedQuery])
  const filteredHBItems = useMemo(() => hbItems.filter(matchesSearch), [hbItems, normalizedQuery])
  const filteredTemplateItems = useMemo(() => templateItems.filter(matchesSearch), [templateItems, normalizedQuery])

  const filteredStepOutputGroups = useMemo((): StepOutputGroup[] => {
    if (!normalizedQuery) return stepOutputGroups
    return stepOutputGroups
      .map((group) => {
        const groupSearchText = [group.label, group.outputAlias, `step ${group.stepIndex + 1}`, 'step output']
          .join(' ')
          .toLowerCase()

        if (groupSearchText.includes(normalizedQuery)) return group

        const outputs = group.outputs.filter((out) =>
          [group.label, group.outputAlias, out.name, out.type].join(' ').toLowerCase().includes(normalizedQuery),
        )

        return outputs.length > 0 ? { ...group, outputs } : null
      })
      .filter((group): group is StepOutputGroup => group != null)
  }, [stepOutputGroups, normalizedQuery])

  const stepOutputCount = stepOutputGroups.reduce((total, group) => total + group.outputs.length, 0)
  const filteredStepOutputCount = filteredStepOutputGroups.reduce((total, group) => total + group.outputs.length, 0)
  const totalCount = eventItems.length + hbItems.length + templateItems.length + stepOutputCount
  const totalMatches = filteredEventItems.length + filteredHBItems.length + filteredTemplateItems.length + filteredStepOutputCount

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'event', label: 'Event', count: eventItems.length },
    { key: 'hb', label: 'Vars', count: hbItems.length },
    { key: 'steps', label: 'Outputs', count: stepOutputCount },
    { key: 'templates', label: 'Templates', count: templateItems.length },
  ]

  function handleFilterChange(next: FilterKey) {
    setActiveFilter(next)
    if (next !== 'all') {
      setOpenSections((prev) => ({ ...prev, [next]: true }))
    }
  }

  function shouldShowSection(section: SectionKey) {
    return activeFilter === 'all' || activeFilter === section
  }

  function renderLibraryItems(section: 'event' | 'hb' | 'templates', items: LibraryItem[]) {
    const limit = SECTION_LIMITS[section]
    const showAll = expandedLists[section] || normalizedQuery.length > 0
    const visibleItems = showAll ? items : items.slice(0, limit)
    const hiddenCount = items.length - visibleItems.length

    return (
      <div className="space-y-1.5">
        {visibleItems.map((item) => (
          <DraggableChip
            key={item.id}
            label={item.label}
            value={item.value}
            badge={item.badge}
            title={item.title}
            icon={item.icon}
            className="bg-background/70"
          />
        ))}

        {!normalizedQuery && hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="xs"
            className="w-full justify-center text-[11px] text-muted-foreground"
            onClick={() => setExpandedLists((prev) => ({ ...prev, [section]: !prev[section] }))}
          >
            {expandedLists[section] ? 'Show less' : `Show ${hiddenCount} more`}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="sticky top-6 flex max-h-[calc(100dvh-3rem)] w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card/70 self-start backdrop-blur-sm xl:w-80">
      <div className="border-b border-border bg-card/90 px-3 py-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Field Library
            </h3>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Search, filter, and drag tokens into workflow inputs.
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 rounded-full px-2 py-0.5 text-[10px]">
            {totalCount}
          </Badge>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search fields, vars, templates..."
            className="h-8 rounded-lg bg-background/80 pl-8 text-xs"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {filters.map((filter) => {
            const isActive = activeFilter === filter.key
            return (
              <Button
                key={filter.key}
                variant={isActive ? 'secondary' : 'ghost'}
                size="xs"
                className={cn(
                  'rounded-full px-2.5',
                  !isActive && 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => handleFilterChange(filter.key)}
              >
                {filter.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0 text-[10px] font-semibold',
                    isActive ? 'bg-background/70 text-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {filter.count}
                </span>
              </Button>
            )
          })}
        </div>

        {normalizedQuery && (
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <span>{totalMatches} matching token{totalMatches === 1 ? '' : 's'}</span>
            <Button variant="ghost" size="xs" className="h-auto px-1.5 py-0.5 text-[11px]" onClick={() => setQuery('')}>
              Clear
            </Button>
          </div>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3 space-y-3">
          {shouldShowSection('event') && (
            <SidebarSection
              icon={Layers3}
              title="Event Fields"
              description={eventType ? 'Pulled from the current trigger event.' : 'Choose a trigger to populate event fields.'}
              count={eventItems.length}
              open={openSections.event}
              onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, event: open }))}
            >
              {filteredEventItems.length > 0 ? (
                renderLibraryItems('event', filteredEventItems)
              ) : (
                <EmptySectionMessage>
                  {eventItems.length === 0
                    ? 'Select a trigger event to see available fields.'
                    : 'No event fields match your search.'}
                </EmptySectionMessage>
              )}
            </SidebarSection>
          )}

          {shouldShowSection('hb') && (
            <SidebarSection
              icon={Database}
              title="HedgeBuddy Variables"
              description={hbVars?.profile ? `Active profile: ${hbVars.profile}` : 'From the active HedgeBuddy profile.'}
              count={hbItems.length}
              open={openSections.hb}
              onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, hb: open }))}
            >
              {filteredHBItems.length > 0 ? (
                renderLibraryItems('hb', filteredHBItems)
              ) : (
                <EmptySectionMessage>
                  {hbItems.length === 0
                    ? 'No HedgeBuddy variables found for the active profile.'
                    : 'No HedgeBuddy variables match your search.'}
                </EmptySectionMessage>
              )}
            </SidebarSection>
          )}

          {shouldShowSection('steps') && (
            <SidebarSection
              icon={ArrowRight}
              title="Step Outputs"
              description="Use output aliases from earlier steps in this workflow."
              count={stepOutputCount}
              open={openSections.steps}
              onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, steps: open }))}
            >
              {filteredStepOutputGroups.length > 0 ? (
                <div className="space-y-2">
                  {filteredStepOutputGroups.map((group) => (
                    <div key={group.stepIndex} className="rounded-lg border border-border/60 bg-background/40 p-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 px-0.5">
                        <ArrowRight className="size-3 text-muted-foreground/70" />
                        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground" title={`Step ${group.stepIndex + 1}: ${group.label} → ${group.outputAlias}`}>
                          Step {group.stepIndex + 1}: {group.label}
                        </p>
                        <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[9px] font-mono">
                          {group.outputAlias}
                        </Badge>
                      </div>
                      {group.outputs.map((out) => (
                        <DraggableChip
                          key={`${group.outputAlias}.${out.name}`}
                          label={`${group.outputAlias}.${out.name}`}
                          value={`{{steps.${group.outputAlias}.${out.name}}}`}
                          badge={out.type}
                          className="bg-background/70"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptySectionMessage>
                  {stepOutputCount === 0
                    ? 'Add a step with outputs to expose reusable results here.'
                    : 'No step outputs match your search.'}
                </EmptySectionMessage>
              )}
            </SidebarSection>
          )}

          {shouldShowSection('templates') && (
            <SidebarSection
              icon={Sparkles}
              title="Templates"
              description="Reusable tokens for dates, app identity, and summaries."
              count={templateItems.length}
              open={openSections.templates}
              onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, templates: open }))}
            >
              {filteredTemplateItems.length > 0 ? (
                <div className="space-y-1.5">
                  {renderLibraryItems('templates', filteredTemplateItems.filter((item) => !TEMPLATE_ITEMS.find((template) => template.value === item.value)?.configurable))}
                  {filteredTemplateItems.some((item) => TEMPLATE_ITEMS.find((template) => template.value === item.value)?.configurable) && (
                    <div className="space-y-1.5">
                      {TEMPLATE_ITEMS
                        .filter((item) => item.configurable && matchesSearch({
                          id: `template:${item.value}`,
                          label: item.label,
                          value: item.value,
                          searchText: [item.label, item.value, 'template'].join(' ').toLowerCase(),
                        }))
                        .map((item) => (
                          <ConfigurableChip key={item.label} item={item} />
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <EmptySectionMessage>No templates match your search.</EmptySectionMessage>
              )}
            </SidebarSection>
          )}

          {normalizedQuery && totalMatches === 0 && (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
              <Braces className="mx-auto size-4 text-muted-foreground/60" />
              <p className="mt-2 text-xs font-medium">No matching tokens</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Try a variable name, output alias, or field type.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function SidebarSection({
  icon: Icon,
  title,
  description,
  count,
  open,
  onOpenChange,
  children,
}: {
  icon: typeof Layers3
  title: string
  description: string
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="rounded-xl border border-border/70 bg-card/60 px-2.5 py-2">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-start gap-2.5 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-accent/30">
            <div className="mt-0.5 rounded-md bg-background/80 p-1.5 text-muted-foreground shadow-xs">
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium leading-none">{title}</p>
                <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[9px] font-semibold">
                  {count}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {description}
              </p>
            </div>
            <ChevronDown className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-2 pt-2">
          {children}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function EmptySectionMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-3 text-[11px] leading-4 text-muted-foreground">
      {children}
    </p>
  )
}
