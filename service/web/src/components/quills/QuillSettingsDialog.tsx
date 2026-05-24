import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchHBVars, fetchQuillSettings, saveQuillSettings, testQuillConnection } from '#/lib/api'
import type { Quill } from '#/lib/api'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Badge } from '#/components/ui/badge'
import { CheckCircle2, XCircle, Loader2, Plug } from 'lucide-react'
import { InputWithFieldPicker } from '#/components/InputWithFieldPicker'
import { DraggableChip } from '#/components/fields-sidebar'

export function QuillSettingsDialog({
  quill, open, onOpenChange,
}: {
  quill: Quill
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<string, string>>({})
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const { data: saved, isLoading } = useQuery({
    queryKey: ['quill-settings', quill.id],
    queryFn: () => fetchQuillSettings(quill.id),
    enabled: open,
  })

  const { data: hbVars } = useQuery({
    queryKey: ['hedgebuddy-vars'],
    queryFn: fetchHBVars,
    enabled: open,
  })

  const hbEntries = useMemo(
    () => Object.entries(hbVars?.variables ?? {}).sort((a, b) => a[0].localeCompare(b[0])),
    [hbVars],
  )

  // Sync saved values into local state when loaded.
  useEffect(() => {
    if (!saved) return
    const initial: Record<string, string> = {}
    for (const s of quill.settings ?? []) {
      initial[s.name] = saved[s.name] ?? s.default ?? ''
    }
    setValues(initial)
    setTestResult(null)
  }, [saved, quill.settings])

  const saveMut = useMutation({
    mutationFn: () => saveQuillSettings(quill.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quill-settings', quill.id] })
    },
  })

  const testMut = useMutation({
    mutationFn: () => testQuillConnection(quill.id),
    onSuccess: (data) => setTestResult(data),
    onError: (err) => setTestResult({ ok: false, error: (err as Error).message }),
  })

  const hasTestConnection = !!quill.test_connection || quill.implementation === 'python'

  const missingRequired = (quill.settings ?? []).some(
    (s) => s.required && !values[s.name]?.trim(),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Settings
            <Badge variant="outline" className="font-mono text-[10px]">{quill.name}</Badge>
          </DialogTitle>
          <DialogDescription>
            Configure connection settings for this quill. These are saved globally
            and shared across all workflows using it.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-4 py-2">
            {hbVars && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    HedgeBuddy Variables
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {hbEntries.length > 0
                      ? `Drag these into settings to use values from the active ${hbVars.profile ?? 'HedgeBuddy'} profile.`
                      : 'No HedgeBuddy variables found for the active profile.'}
                  </p>
                </div>
                {hbEntries.length > 0 && (
                  <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                    {hbEntries.map(([name, variable]) => (
                      <DraggableChip
                        key={name}
                        label={name}
                        value={`{{hb.${name}}}`}
                        badge={variable.type}
                        title={[
                          `Drag to insert: {{hb.${name}}}`,
                          variable.description,
                          variable.type === 'secret' ? 'Value hidden in UI (secret type)' : '',
                        ].filter(Boolean).join('\n')}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {(quill.settings ?? []).map((def) => (
              <div key={def.name} className="space-y-1.5">
                <Label className="text-xs">
                  {def.label || def.name}
                  {def.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                {def.description && (
                  <p className="text-[11px] text-muted-foreground">{def.description}</p>
                )}
                <InputWithFieldPicker
                  value={values[def.name] ?? ''}
                  onChange={(v) => setValues({ ...values, [def.name]: v })}
                  inputDef={{ name: def.name, type: def.type, required: def.required }}
                  inputType={def.type === 'secure' ? 'password' : 'text'}
                  placeholder={def.default || undefined}
                  alwaysRaw={def.type === 'secure'}
                />
              </div>
            ))}

            {/* Test Connection */}
            {hasTestConnection && (
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testMut.mutate()}
                  disabled={testMut.isPending || missingRequired}
                >
                  {testMut.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plug className="size-3.5" />
                  )}
                  Test Connection
                </Button>
                {testResult && (
                  <span className="flex items-center gap-1 text-xs">
                    {testResult.ok ? (
                      <>
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                        <span className="text-emerald-500">Connected</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="size-3.5 text-destructive" />
                        <span className="text-destructive truncate max-w-50" title={testResult.error}>
                          {testResult.error || 'Failed'}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </div>
            )}

            {/* Save */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || missingRequired}
              >
                {saveMut.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                {saveMut.isSuccess ? 'Saved!' : 'Save Settings'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
