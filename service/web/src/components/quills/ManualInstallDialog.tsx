import { useRef, useState } from 'react'
import { Upload, FileText, X } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '#/components/ui/dialog'

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

export function ManualInstallDialog({
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
          <FilePickerRow
            label="main.py"
            file={mainPy}
            accept=".py"
            inputRef={pyInputRef}
            onPick={() => pyInputRef.current?.click()}
            onChange={setMainPy}
            onClear={() => setMainPy(null)}
          />
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
