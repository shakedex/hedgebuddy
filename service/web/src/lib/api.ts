import type {
  EventRecord, EventsPage,
  Condition, StepInput, Step, Workflow, Trigger,
} from '#/lib/generated/storage'
import type { Field, Event, AppSchema } from '#/lib/generated/schema'
import type { ActionMeta, InputMeta, OutputMeta } from '#/lib/generated/actions'
import type { Quill as GeneratedQuill, Input as QuillInput } from '#/lib/generated/quills'

// Extend Quill with runtime-only fields not captured by tygo.
export type Quill = GeneratedQuill & { source?: 'builtin' | 'installed' }

// Re-export generated types so consumers import from one place.
export type {
  EventRecord, EventsPage, Condition, StepInput, Step, Workflow, Trigger,
  Field, Event, AppSchema,
  ActionMeta, InputMeta, OutputMeta,
  QuillInput,
}

const API_BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

// --- Events ---

export interface EventsQuery {
  limit?: number
  offset?: number
  app?: string
  event?: string
}

export function fetchEventsPage(query: EventsQuery = {}): Promise<EventsPage> {
  const params = new URLSearchParams()
  if (query.limit) params.set('limit', String(query.limit))
  if (query.offset) params.set('offset', String(query.offset))
  if (query.app) params.set('app', query.app)
  if (query.event) params.set('event', query.event)
  const qs = params.toString()
  return request<EventsPage>(`/events${qs ? '?' + qs : ''}`)
}

export const clearEvents = () =>
  request<{ status: string; deleted: number }>('/events', { method: 'DELETE' })

export async function fetchEvents(limit = 50): Promise<EventRecord[]> {
  const page = await fetchEventsPage({ limit })
  return page.events ?? []
}

// --- Workflows ---

export const fetchWorkflows = () =>
  request<Workflow[]>('/workflows')

export const fetchWorkflow = (id: string) =>
  request<Workflow>(`/workflows/${id}`)

export const createWorkflow = (wf: Omit<Workflow, 'id' | 'created_at' | 'updated_at'>) =>
  request<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(wf) })

export const updateWorkflow = (id: string, wf: Partial<Workflow>) =>
  request<Workflow>(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(wf) })

export const deleteWorkflow = (id: string) =>
  request<{ status: string }>(`/workflows/${id}`, { method: 'DELETE' })

// --- Schemas ---

export const fetchSchemas = () =>
  request<Record<string, AppSchema>>('/schemas')

// --- Quills ---

export const fetchQuills = () =>
  request<Quill[]>('/quills')

export interface RemoteQuill {
  id: string
  name: string
  version: string
  description: string
  author: string
  category: string
  installed: boolean
  update_available?: boolean
}

export const fetchQuillRepo = (repoURL?: string) => {
  const params = repoURL ? `?repo=${encodeURIComponent(repoURL)}` : ''
  return request<RemoteQuill[]>(`/quills/repo${params}`)
}

export const installQuill = (quillId: string, repoURL?: string) =>
  request<Quill>('/quills/install', {
    method: 'POST',
    body: JSON.stringify({ quill_id: quillId, repo_url: repoURL }),
  })

export const installQuillManual = (files: { quillYaml: File; mainPy?: File; requirementsTxt?: File }) => {
  const form = new FormData()
  form.append('quill_yaml', files.quillYaml)
  if (files.mainPy) form.append('main_py', files.mainPy)
  if (files.requirementsTxt) form.append('requirements_txt', files.requirementsTxt)
  return fetch(`${API_BASE}/quills/install-manual`, {
    method: 'POST',
    body: form,
    // No Content-Type header — browser sets multipart boundary automatically.
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error || `Request failed: ${res.status}`)
    }
    return res.json() as Promise<Quill>
  })
}

export const uninstallQuill = (quillId: string) =>
  request<{ status: string }>(`/quills/${quillId}`, { method: 'DELETE' })

// --- Quill Settings ---

export const fetchQuillSettings = (quillId: string) =>
  request<Record<string, string>>(`/quills/${quillId}/settings`)

export const saveQuillSettings = (quillId: string, settings: Record<string, string>) =>
  request<{ status: string }>(`/quills/${quillId}/settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  })

export const testQuillConnection = (quillId: string) =>
  request<{ ok: boolean; error?: string }>(`/quills/${quillId}/test-connection`, { method: 'POST' })

export interface DynamicOption {
  value: string
  label: string
}

export const loadQuillOptions = (quillId: string, inputName: string) =>
  request<DynamicOption[]>(`/quills/${quillId}/load-options`, {
    method: 'POST',
    body: JSON.stringify({ input_name: inputName }),
  })

// --- Actions ---

export const fetchActions = () =>
  request<ActionMeta[]>('/actions')

// --- Health ---

export const fetchHealth = () =>
  request<{ status: string; engaged: boolean }>('/health')

// --- Engaged toggle ---

export const fetchEngaged = () =>
  request<{ engaged: boolean }>('/engaged')

export const setEngaged = (engaged: boolean) =>
  request<{ engaged: boolean }>('/engaged', {
    method: 'PUT',
    body: JSON.stringify({ engaged }),
  })

// --- Inject Scripts ---

export interface InjectScript {
  filename: string
  app: string
  event: string
}

export const fetchInjectScripts = () =>
  request<InjectScript[]>('/download/scripts')

// --- Workflow Run ---

export const runWorkflow = (id: string) =>
  request<{ status: string }>(`/workflows/${id}/run`, { method: 'POST' })

// --- Run History ---

export interface WorkflowRun {
  id: number
  workflow_id: string
  workflow_name: string
  status: 'running' | 'success' | 'error'
  error?: string
  started_at: string
  finished_at?: string
  steps_log?: string
}

export interface RunsPage {
  runs: WorkflowRun[]
  total: number
  limit: number
  offset: number
}

export interface RunsQuery {
  limit?: number
  offset?: number
}

export function fetchRunsPage(query: RunsQuery = {}): Promise<RunsPage> {
  const params = new URLSearchParams()
  if (query.limit) params.set('limit', String(query.limit))
  if (query.offset) params.set('offset', String(query.offset))
  const qs = params.toString()
  return request<RunsPage>(`/runs${qs ? '?' + qs : ''}`)
}

export const fetchRuns = async (limit = 50): Promise<WorkflowRun[]> => {
  const page = await fetchRunsPage({ limit })
  return page.runs ?? []
}

export const clearRuns = () =>
  request<{ status: string; deleted: number }>('/runs', { method: 'DELETE' })

export const fetchWorkflowRuns = (workflowId: string) =>
  request<WorkflowRun[]>(`/workflows/${workflowId}/runs`)

// --- File Browser ---

export interface BrowseEntry {
  name: string
  path: string
  is_dir: boolean
}

export const fetchBrowse = (path?: string) => {
  const params = path ? `?path=${encodeURIComponent(path)}` : ''
  return request<{ entries: BrowseEntry[] }>(`/browse${params}`)
}
