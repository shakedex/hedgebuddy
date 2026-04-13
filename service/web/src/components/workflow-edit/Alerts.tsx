import { AlertTriangle } from 'lucide-react'

interface AlertsProps {
  errors: string[]
  saveError: string | null
  testResult: { ok: boolean; msg: string } | null
}

export function Alerts({ errors, saveError, testResult }: AlertsProps) {
  return (
    <>
      {errors.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" />Please fix before saving:
          </div>
          <ul className="list-disc list-inside text-xs text-destructive space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {saveError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive">
          Save failed: {saveError}
        </div>
      )}
      {testResult && (
        <div className={`rounded-lg border p-3 text-xs ${
          testResult.ok
            ? 'border-green-500/30 bg-green-500/5 text-green-400'
            : 'border-destructive/50 bg-destructive/5 text-destructive'
        }`}>
          {testResult.ok ? 'Test run started successfully.' : `Test run failed: ${testResult.msg}`}
        </div>
      )}
    </>
  )
}
