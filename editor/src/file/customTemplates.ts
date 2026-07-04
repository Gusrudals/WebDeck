export interface CustomTemplate {
  id: string
  label: string
  html: string
  savedAt: string
}

const KEY = 'webdeck.templates'

function isCustomTemplate(t: unknown): t is CustomTemplate {
  if (typeof t !== 'object' || t === null) return false
  const o = t as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.label === 'string' && typeof o.html === 'string' && typeof o.savedAt === 'string'
}

export function listCustomTemplates(): CustomTemplate[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isCustomTemplate) : []
  } catch {
    return []
  }
}

export function saveCustomTemplate(label: string, html: string): CustomTemplate {
  const template: CustomTemplate = {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    label,
    html,
    savedAt: new Date().toISOString(),
  }
  const list = [...listCustomTemplates(), template]
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    throw new Error('저장 공간이 부족합니다 — 사용하지 않는 템플릿을 삭제해 주세요')
  }
  return template
}

export function removeCustomTemplate(id: string): void {
  const list = listCustomTemplates().filter((t) => t.id !== id)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // 목록 축소 저장의 실패는 실질적으로 발생하지 않는다 — 무시
  }
}
