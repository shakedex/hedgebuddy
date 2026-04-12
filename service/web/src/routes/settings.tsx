import { useQuery } from '@tanstack/react-query'
import { fetchHealth, fetchSchemas } from '#/lib/api'
import { CheckCircle, XCircle, Copy, Check, Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Badge } from '#/components/ui/badge'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '#/components/ui/tooltip'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <TooltipProvider>
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
    </TooltipProvider>
  )
}

export function SettingsPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 10_000 })
  const schemas = useQuery({ queryKey: ['schemas'], queryFn: fetchSchemas })

  const injectCmd = 'python inject.py \'{"FileCopyCompleted_state":"Success"}\''

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {/* Service status */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Service Status</h2>
        <div className="flex items-center gap-2">
          {health.data?.status === 'ok' ? (
            <>
              <CheckCircle className="size-4 text-green-500" />
              <span className="text-sm">Running on port 12345</span>
            </>
          ) : (
            <>
              <XCircle className="size-4 text-destructive" />
              <span className="text-sm text-destructive">Not connected</span>
            </>
          )}
        </div>
      </div>

      {/* inject.py setup */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">inject.py Setup</h2>
        <p className="text-sm text-muted-foreground">
          Point your Hedge app script events to <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">inject.py</code>.
          It's included in the <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">hedgebuddy</code> Python package,
          or download the standalone file below.
        </p>
        <Button asChild>
          <a href="/api/download/inject.py" download="inject.py">
            <Download />
            Download inject.py
          </a>
        </Button>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Setup steps</Label>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
            <li>Download <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">inject.py</code> or install <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">pip install hedgebuddy</code></li>
            <li>In your Hedge app (OffShoot / FoolCat / EditReady), go to Preferences → Scripting</li>
            <li>For each event, set the script path to <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">inject.py</code></li>
            <li>Events will flow into Quills automatically</li>
          </ol>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Test command</Label>
          <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
            <code className="flex-1 text-xs font-mono break-all">{injectCmd}</code>
            <CopyButton text={injectCmd} />
          </div>
        </div>
      </div>

      {/* Event schemas */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
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
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {app.display_name}
                </h3>
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(app.events).map(([name, evt]) => {
                    if (!evt) return null
                    return (
                      <TooltipProvider key={name}>
                        <Tooltip>
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
                      </TooltipProvider>
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
