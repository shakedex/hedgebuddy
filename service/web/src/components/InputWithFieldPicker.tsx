import { useRef, useState, useMemo, useId, useEffect, useCallback } from 'react'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '#/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { FolderOpen, X } from 'lucide-react'
import { FileBrowserDialog } from './FileBrowserDialog'
import { DynamicSelect } from './DynamicSelect'
import { previewTemplate } from '#/lib/format'
import { rememberFieldInsertionTarget, releaseFieldInsertionTarget } from '#/lib/field-insertion'
import { parseSegments, templateLabel } from '#/lib/templates'

/**
 * Smart input that renders {{...}} tokens as inline badges.
 * Supports drag-drop from sidebar, file browsing, live preview,
 * and dynamic API-loaded dropdowns.
 */
export function InputWithFieldPicker({
  value, onChange, inputDef, quillId, inputType = 'text', placeholder, alwaysRaw = false,
}: {
  value: string
  onChange: (v: string) => void
  inputDef: { name: string; type: string; required?: boolean; values?: string[] }
  quillId?: string
  inputType?: string
  placeholder?: string
  alwaysRaw?: boolean
}) {
  const fieldId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  const selectionRef = useRef<{ start: number; end: number }>({ start: value.length, end: value.length })
  const [browserOpen, setBrowserOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [editing, setEditing] = useState(false)
  const isPath = inputDef.type === 'path'
  const preview = previewTemplate(value)
  const segments = useMemo(() => parseSegments(value), [value])
  const hasTemplates = segments.some((s) => s.type === 'template')

  useEffect(() => {
    valueRef.current = value
    const end = value.length
    selectionRef.current = {
      start: Math.min(selectionRef.current.start, end),
      end: Math.min(selectionRef.current.end, end),
    }
  }, [value])

  useEffect(() => () => releaseFieldInsertionTarget(fieldId), [fieldId])

  const syncSelection = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    selectionRef.current = {
      start: el.selectionStart ?? valueRef.current.length,
      end: el.selectionEnd ?? valueRef.current.length,
    }
  }, [])

  const insertToken = useCallback((token: string) => {
    const el = inputRef.current
    const currentValue = valueRef.current
    const activeSelection = el && document.activeElement === el
      ? {
          start: el.selectionStart ?? currentValue.length,
          end: el.selectionEnd ?? currentValue.length,
        }
      : selectionRef.current

    const start = Math.min(activeSelection.start, currentValue.length)
    const end = Math.min(activeSelection.end, currentValue.length)
    const next = currentValue.slice(0, start) + token + currentValue.slice(end)
    onChange(next)
    const nextPos = start + token.length
    selectionRef.current = { start: nextPos, end: nextPos }
    setEditing(true)

    requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      input.selectionStart = input.selectionEnd = nextPos
    })
  }, [onChange])

  const registerAsLastFocused = useCallback(() => {
    rememberFieldInsertionTarget({ id: fieldId, insertToken })
  }, [fieldId, insertToken])

  // Dynamic → API-powered searchable select
  if (inputDef.type === 'dynamic' && quillId) {
    return (
      <DynamicSelect
        quillId={quillId}
        inputName={inputDef.name}
        value={value}
        onChange={onChange}
      />
    )
  }

  // Enum → Select
  if (inputDef.values && inputDef.values.length > 0) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full font-mono text-xs">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {inputDef.values.map((v) => (
            <SelectItem key={v} value={v}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  function isTemplateDrag(e: React.DragEvent): boolean {
    return e.dataTransfer.types.includes('application/x-quill-template')
  }

  function handleDragOver(e: React.DragEvent) {
    if (!isTemplateDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const text = e.dataTransfer.getData('text/plain')
    if (!text) return

    insertToken(text)
  }

  function removeTemplate(token: string) {
    // Remove the first occurrence of this exact token
    const idx = value.indexOf(token)
    if (idx >= 0) {
      onChange(value.slice(0, idx) + value.slice(idx + token.length))
    }
  }

  return (
    <div className="space-y-1">
      <div
        className={`relative transition-all ${dragOver ? 'ring-2 ring-primary/50 rounded-md' : ''}`}
        onDragOver={handleDragOver}
        onDragEnter={(e) => { if (isTemplateDrag(e)) { e.preventDefault(); setDragOver(true) } }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
        }}
        onDrop={handleDrop}
      >
        {/* Badge view (shown when not editing and has templates) */}
        {!alwaysRaw && !editing && hasTemplates ? (
          <div className="flex gap-1.5">
            <button
              onClick={() => { registerAsLastFocused(); setEditing(true) }}
              className="flex-1 min-h-9 flex items-center gap-1 flex-wrap px-3 py-1.5
                rounded-md border border-input bg-background text-xs font-mono
                hover:border-primary/40 transition-colors cursor-text text-left"
            >
              {segments.map((seg, i) =>
                seg.type === 'template' ? (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="text-[10px] gap-0.5 px-1.5 py-0 shrink-0 cursor-default"
                  >
                    {templateLabel(seg.value)}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTemplate(seg.value) }}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                ) : (
                  <span key={i} className="text-foreground">{seg.value}</span>
                ),
              )}
            </button>
            {isPath && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0 px-2" onClick={() => setBrowserOpen(true)}>
                    <FolderOpen className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Browse filesystem</TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : (
          /* Raw input (always shown when no templates, or when editing) */
          <div className="flex gap-1.5">
            <Input
              ref={inputRef}
              type={inputType}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => setEditing(false)}
              onFocus={() => { setEditing(true); registerAsLastFocused(); syncSelection() }}
              onClick={syncSelection}
              onKeyUp={syncSelection}
              onSelect={syncSelection}
              autoFocus={editing}
              className="font-mono text-xs"
              placeholder={placeholder ?? (isPath ? 'C:\\path\\to\\folder or click browse...' : 'Type or drag a field here...')}
            />
            {isPath && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0 px-2" onClick={() => setBrowserOpen(true)}>
                    <FolderOpen className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Browse filesystem</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Drop overlay */}
        {dragOver && (
          <div className="absolute inset-0 rounded-md bg-primary/5 border-2 border-dashed border-primary/30 flex items-center justify-center pointer-events-none z-10">
            <span className="text-[10px] text-primary font-medium">Drop to insert</span>
          </div>
        )}
      </div>

      {isPath && (
        <FileBrowserDialog open={browserOpen} onOpenChange={setBrowserOpen} onSelect={onChange} selectFolder />
      )}

      {/* Live preview */}
      {preview && (
        <p className="text-[10px] text-muted-foreground font-mono truncate pl-0.5" title={preview}>
          <span className="text-muted-foreground/60">→ </span>{preview}
        </p>
      )}
    </div>
  )
}
