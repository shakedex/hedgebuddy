import { useQuery } from '@tanstack/react-query'
import { fetchHealth, fetchSchemas, fetchInjectScripts } from '#/lib/api'
import { Copy, Check, Download, FileCode } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Badge } from '#/components/ui/badge'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '#/components/ui/tooltip'
import { APP_COLORS } from '#/lib/constants'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Copy to clipboard</TooltipContent>
    </Tooltip>
  )
}

export function SettingsPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 10_000 })
  const schemas = useQuery({ queryKey: ['schemas'], queryFn: fetchSchemas })
  const scripts = useQuery({ queryKey: ['inject-scripts'], queryFn: fetchInjectScripts })

  const injectCmd = 'python inject.py \'{"FileCopyCompleted_state":"Success"}\''

  return (
    <div className="p-6 space-y-6 max-w-3xl animate-page-in">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {/* Service status */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3 accent-stripe-left" style={{ '--stripe-color': health.data?.status === 'ok' ? 'var(--status-success)' : 'var(--status-error)' } as React.CSSProperties}>
        <h2 className="text-sm font-semibold">Service Status</h2>
        <div className="flex items-center gap-2">
          {health.data?.status === 'ok' ? (
            <>
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full rounded-full bg-green-400 opacity-75 animate-ping" />
                <span className="relative inline-flex size-2.5 rounded-full bg-green-500" />
              </span>
              <span className="text-sm">Running on port 12345</span>
            </>
          ) : (
            <>
              <span className="inline-flex size-2.5 rounded-full bg-destructive" />
              <span className="text-sm text-destructive">Not connected</span>
            </>
          )}
        </div>
      </div>

      {/* Event Scripts Setup */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3 accent-stripe-left" style={{ '--stripe-color': 'var(--lagoon)' } as React.CSSProperties}>
        <h2 className="text-sm font-semibold">Event Scripts</h2>
        <p className="text-sm text-muted-foreground">
          Download per-event scripts and point each event in your Hedge app (Preferences → Scripting) to the matching file.
          Each script identifies itself to Quills, so empty-payload events (like App Started) are handled correctly.
        </p>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Setup steps</Label>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
            <li>Download the scripts for your app below</li>
            <li>Save them to a permanent location on your machine</li>
            <li>In your Hedge app, go to Preferences → Scripting</li>
            <li>For each event, set the script path to the matching <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">.py</code> file</li>
          </ol>
        </div>

        {scripts.data && (() => {
          const grouped: Record<string, typeof scripts.data> = {}
          for (const s of scripts.data) {
            ;(grouped[s.app] ??= []).push(s)
          }
          return (
            <div className="space-y-3 pt-1">
              {Object.entries(grouped).map(([app, items]) => (
                <div key={app}>
                  <h3 className="mb-1.5">
                    <Badge variant="secondary" className={`${APP_COLORS[app] ?? ''} text-xs`}>
                      {app === 'offshoot' ? 'OffShoot' : app === 'foolcat' ? 'FoolCat' : app === 'editready' ? 'EditReady' : app}
                    </Badge>
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((s) => (
                      <Button key={s.filename} variant="outline" size="sm" className="h-7 text-xs gap-1.5" asChild>
                        <a href={`/api/download/scripts/${s.filename}`} download={s.filename}>
                          <FileCode className="size-3" />
                          {s.event}
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        <details className="pt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Legacy: universal inject.py (all events in one file)
          </summary>
          <div className="mt-2 space-y-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/api/download/inject.py" download="inject.py">
                <Download className="size-3" />
                Download inject.py
              </a>
            </Button>
            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
              <code className="flex-1 text-xs font-mono break-all">{injectCmd}</code>
              <CopyButton text={injectCmd} />
            </div>
          </div>
        </details>
      </div>

      {/* Event schemas */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3 accent-stripe-left" style={{ '--stripe-color': 'var(--palm)' } as React.CSSProperties}>
        <h2 className="text-sm font-semibold">Event Schema Registry</h2>
        <p className="text-sm text-muted-foreground">
          {schemas.data ? Object.keys(schemas.data).length : '...'} app(s) loaded
          with{' '}
          {schemas.data
            ? Object.values(schemas.data).reduce(
                (n, app) => n + Object.keys(app.events).length,
                0,
              )
            : '...'}{' '}
          event types.
        </p>
        {schemas.data && (
          <div className="space-y-2">
            {Object.values(schemas.data).map((app) => (
              <div key={app.app}>
                <h3 className="text-xs font-semibold uppercase tracking-wider">
                  <Badge variant="secondary" className={`${APP_COLORS[app.app] ?? ''} text-xs`}>
                    {app.display_name}
                  </Badge>
                </h3>
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(app.events).map(([name, evt]) => {
                    if (!evt) return null
                    return (
                      <Tooltip key={name}>
                        <TooltipTrigger asChild>
                          <span>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {name}
                              {Object.keys(evt.fields).length > 0 && (
                                <span className="ml-1 text-muted-foreground">
                                  ({Object.keys(evt.fields).length})
                                </span>
                              )}
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{evt.description}</TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
