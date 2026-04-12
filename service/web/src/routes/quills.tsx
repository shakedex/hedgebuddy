import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchQuills, fetchActions, fetchQuillRepo, installQuill, installQuillManual, uninstallQuill,
} from '#/lib/api'
import type { Quill, ActionMeta, RemoteQuill } from '#/lib/api'
import { Package, Blocks, ChevronRight, Download, Trash2, RefreshCw, Globe, Upload, FileText, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '#/components/ui/dialog'
import { CATEGORY_LABELS } from '#/lib/constants'

type Tab = 'installed' | 'browse' | 'actions'

export function QuillsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('installed')
  const [manualOpen, setManualOpen] = useState(false)

  const { data: quills, isLoading: qLoading } = useQuery({ queryKey: ['quills'], queryFn: fetchQuills })
  const { data: actions, isLoading: aLoading } = useQuery({ queryKey: ['actions'], queryFn: fetchActions })
  const { data: repoQuills, isLoading: rLoading, refetch: refetchRepo } = useQuery({
    queryKey: ['quill-repo'],
    queryFn: () => fetchQuillRepo(),
    enabled: tab === 'browse',
  })

  const installMut = useMutation({
    mutationFn: (quillId: string) => installQuill(quillId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quills'] })
      queryClient.invalidateQueries({ queryKey: ['quill-repo'] })
    },
  })

  const uninstallMut = useMutation({
    mutationFn: (quillId: string) => uninstallQuill(quillId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quills'] })
      queryClient.invalidateQueries({ queryKey: ['quill-repo'] })
    },
  })

  const manualInstallMut = useMutation({
    mutationFn: (files: { quillYaml: File; mainPy?: File; requirementsTxt?: File }) =>
      installQuillManual(files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quills'] })
      queryClient.invalidateQueries({ queryKey: ['quill-repo'] })
      setManualOpen(false)
    },
  })

  const isLoading = qLoading || aLoading

  // Group actions by category
  const actionsByCategory: Record<string, ActionMeta[]> = {}
  for (const a of actions ?? []) {
    ;(actionsByCategory[a.category] ??= []).push(a)
  }

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'installed', label: 'Installed', icon: <Package className="size-4" /> },
    { key: 'browse', label: 'Browse Repo', icon: <Globe className="size-4" /> },
    { key: 'actions', label: 'Actions', icon: <Blocks className="size-4" /> },
  ]

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quills Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pre-built quills and available actions you can use in workflows.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { manualInstallMut.reset(); setManualOpen(true) }}>
          <Upload className="size-3.5" />
          Manual Install
        </Button>
      </div>

      <ManualInstallDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onInstall={(files) => manualInstallMut.mutate(files)}
        isPending={manualInstallMut.isPending}
        error={manualInstallMut.isError ? (manualInstallMut.error as Error).message : undefined}
        reset={() => manualInstallMut.reset()}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
            {t.key === 'installed' && <Badge variant="secondary" className="ml-1">{quills?.length ?? 0}</Badge>}
            {t.key === 'actions' && <Badge variant="secondary" className="ml-1">{actions?.length ?? 0}</Badge>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'installed' && (
        <InstalledTab
          quills={quills ?? []}
          onUninstall={(id) => uninstallMut.mutate(id)}
          uninstalling={uninstallMut.isPending ? uninstallMut.variables : undefined}
        />
      )}

      {tab === 'browse' && (
        <BrowseTab
          repoQuills={repoQuills ?? []}
          isLoading={rLoading}
          onInstall={(id) => installMut.mutate(id)}
          onRefresh={() => refetchRepo()}
          installing={installMut.isPending ? installMut.variables : undefined}
        />
      )}

      {tab === 'actions' && (
        <ActionsTab actionsByCategory={actionsByCategory} />
      )}
    </div>
  )
}

// ──────────── Manual Install Dialog ────────────

function ManualInstallDialog({
  open, onOpenChange, onInstall, isPending, error, reset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInstall: (files: { quillYaml: File; mainPy?: File; requirementsTxt?: File }) => void
  isPending: boolean
  error?: string
  reset: () => void
}) {
  const [quillYaml, setQuillYaml] = useState<File | null>(null)
  const [mainPy, setMainPy] = useState<File | null>(null)
  const [requirementsTxt, setRequirementsTxt] = useState<File | null>(null)
  const yamlInputRef = useRef<HTMLInputElement>(null)
  const pyInputRef = useRef<HTMLInputElement>(null)
  const reqInputRef = useRef<HTMLInputElement>(null)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuillYaml(null)
      setMainPy(null)
      setRequirementsTxt(null)
      reset()
    }
    onOpenChange(next)
  }

  const handleInstall = () => {
    if (!quillYaml) return
    onInstall({
      quillYaml,
      mainPy: mainPy ?? undefined,
      requirementsTxt: requirementsTxt ?? undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manual Install</DialogTitle>
          <DialogDescription>
            Upload quill files to install directly. Only <code className="font-mono text-[11px] bg-muted px-1 rounded">quill.yaml</code> is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* quill.yaml — required */}
          <FilePickerRow
            label="quill.yaml"
            required
            file={quillYaml}
            accept=".yaml,.yml"
            inputRef={yamlInputRef}
            onPick={() => yamlInputRef.current?.click()}
            onChange={(f) => { setQuillYaml(f); reset() }}
            onClear={() => { setQuillYaml(null); reset() }}
          />

          {/* main.py — optional */}
          <FilePickerRow
            label="main.py"
            file={mainPy}
            accept=".py"
            inputRef={pyInputRef}
            onPick={() => pyInputRef.current?.click()}
            onChange={setMainPy}
            onClear={() => setMainPy(null)}
          />

          {/* requirements.txt — optional */}
          <FilePickerRow
            label="requirements.txt"
            file={requirementsTxt}
            accept=".txt"
            inputRef={reqInputRef}
            onPick={() => reqInputRef.current?.click()}
            onChange={setRequirementsTxt}
            onClear={() => setRequirementsTxt(null)}
          />
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button
            onClick={handleInstall}
            disabled={!quillYaml || isPending}
          >
            <Upload className="size-3.5" />
            {isPending ? 'Installing...' : 'Install'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FilePickerRow({
  label, required, file, accept, inputRef, onPick, onChange, onClear,
}: {
  label: string
  required?: boolean
  file: File | null
  accept: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onPick: () => void
  onChange: (file: File) => void
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onChange(f)
          e.target.value = ''
        }}
      />
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-mono truncate">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </span>
      </div>
      {file ? (
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px] font-mono max-w-[180px] truncate">
            {file.name}
          </Badge>
          <button onClick={onClear} className="text-muted-foreground hover:text-foreground">
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={onPick}>
          Choose File
        </Button>
      )}
    </div>
  )
}

// ──────────── Installed Tab ────────────

function InstalledTab({
  quills, onUninstall, uninstalling,
}: {
  quills: Quill[]
  onUninstall: (id: string) => void
  uninstalling?: string
}) {
  if (quills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No quills installed yet. Browse the repo or use Manual Install to add one.
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

// ──────────── Browse Repo Tab ────────────

function BrowseTab({
  repoQuills, isLoading, onInstall, onRefresh, installing,
}: {
  repoQuills: RemoteQuill[]
  isLoading: boolean
  onInstall: (id: string) => void
  onRefresh: () => void
  installing?: string
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
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No quills found in the repository. Check back later!
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {repoQuills.map((rq) => (
            <div key={rq.id} className="flex items-center gap-3 px-4 py-3">
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
                    <Badge variant="secondary">Installed</Badge>
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

// ──────────── Actions Tab ────────────

function ActionsTab({ actionsByCategory }: { actionsByCategory: Record<string, ActionMeta[]> }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Low-level actions that quills and workflow steps can call. Includes Hedge app integrations.
      </p>
      {Object.entries(actionsByCategory).map(([cat, acts]) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {CATEGORY_LABELS[cat] ?? cat}
          </h3>
          <div className="rounded-lg border border-border divide-y divide-border">
            {acts.map((act) => (
              <ActionRow key={act.name} action={act} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ──────────── Quill Card ────────────

function QuillCard({
  quill, onUninstall, isUninstalling,
}: {
  quill: Quill
  onUninstall?: () => void
  isUninstalling?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
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

      {/* Inputs */}
      {quill.inputs && quill.inputs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Inputs</p>
          <div className="flex flex-wrap gap-1">
            {quill.inputs.map((inp) => (
              <TooltipProvider key={inp.name}>
                <Tooltip>
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
              </TooltipProvider>
            ))}
          </div>
        </div>
      )}

      {/* Compatible triggers */}
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

      {/* Steps summary */}
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

// ──────────── Action Row ────────────

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
              <TooltipProvider key={inp.name}>
                <Tooltip>
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
              </TooltipProvider>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
