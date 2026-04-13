import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchQuills, fetchActions, fetchQuillRepo, installQuill, installQuillManual, uninstallQuill,
} from '#/lib/api'
import type { ActionMeta } from '#/lib/api'
import { Package, Blocks, Globe, Upload } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ManualInstallDialog } from '#/components/quills/ManualInstallDialog'
import { InstalledTab } from '#/components/quills/InstalledTab'
import { BrowseTab } from '#/components/quills/BrowseTab'
import { ActionsTab } from '#/components/quills/ActionsTab'

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
    <div className="p-6 space-y-6 animate-page-in">
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
      <div className="relative flex items-center gap-1 border-b border-border">
        {tabs.map((t) => {
          const isActive = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.icon}
              {t.label}
              {t.key === 'installed' && <Badge variant="secondary" className="ml-1">{quills?.length ?? 0}</Badge>}
              {t.key === 'actions' && <Badge variant="secondary" className="ml-1">{actions?.length ?? 0}</Badge>}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-(--lagoon) rounded-full motion-safe:transition-all motion-safe:duration-200" />
              )}
            </button>
          )
        })}
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
          onUninstall={(id) => uninstallMut.mutate(id)}
          onRefresh={() => refetchRepo()}
          installing={installMut.isPending ? installMut.variables : undefined}
          uninstalling={uninstallMut.isPending ? uninstallMut.variables : undefined}
        />
      )}

      {tab === 'actions' && (
        <ActionsTab actionsByCategory={actionsByCategory} />
      )}
    </div>
  )
}

