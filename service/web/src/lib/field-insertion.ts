export interface FieldInsertionTarget {
  id: string
  insertToken: (token: string) => void
}

let lastFocusedTarget: FieldInsertionTarget | null = null

export function rememberFieldInsertionTarget(target: FieldInsertionTarget) {
  lastFocusedTarget = target
}

export function releaseFieldInsertionTarget(id: string) {
  if (lastFocusedTarget?.id === id) {
    lastFocusedTarget = null
  }
}

export function insertIntoLastFocusedField(token: string): boolean {
  if (!lastFocusedTarget) return false
  lastFocusedTarget.insertToken(token)
  return true
}

export function hasLastFocusedField(): boolean {
  return lastFocusedTarget != null
}