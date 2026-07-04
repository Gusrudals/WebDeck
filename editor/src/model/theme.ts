import type { DeckDoc } from './types.ts'

export const THEME_COLOR_VARS = ['--wd-primary', '--wd-accent', '--wd-text', '--wd-muted'] as const
export const THEME_FONT_VARS = ['--wd-font-heading', '--wd-font-body'] as const
export type ThemeColorVar = (typeof THEME_COLOR_VARS)[number]
export type ThemeVarName = ThemeColorVar | (typeof THEME_FONT_VARS)[number]

export interface ThemePreset {
  key: string
  label: string
  colors: Record<ThemeColorVar, string>
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: 'blue', label: '파랑 기본', colors: { '--wd-primary': '#1a56db', '--wd-accent': '#e8f0fe', '--wd-text': '#1f2937', '--wd-muted': '#6b7280' } },
  { key: 'green', label: '그린', colors: { '--wd-primary': '#047857', '--wd-accent': '#ecfdf5', '--wd-text': '#1f2937', '--wd-muted': '#6b7280' } },
  { key: 'burgundy', label: '버건디', colors: { '--wd-primary': '#9f1239', '--wd-accent': '#fff1f2', '--wd-text': '#1f2937', '--wd-muted': '#6b7280' } },
  { key: 'navy', label: '다크 네이비', colors: { '--wd-primary': '#1e3a5f', '--wd-accent': '#e8eef5', '--wd-text': '#111827', '--wd-muted': '#4b5563' } },
]

/** CSS 주석을 같은 길이의 공백으로 치환 — 인덱스가 원본과 1:1 정렬된 탐색용 사본 */
function maskComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
}

/** headExtra의 첫 :root 블록 내부 범위 — 없으면 null. 주석 안의 텍스트는 블록으로 오인하지 않는다 */
function rootBlockRange(headExtra: string): { start: number; end: number } | null {
  const masked = maskComments(headExtra)
  const m = /:root\s*\{/.exec(masked)
  if (!m) return null
  const start = m.index + m[0].length
  const end = masked.indexOf('}', start)
  return end === -1 ? null : { start, end }
}

export function readTheme(doc: DeckDoc): Partial<Record<ThemeVarName, string>> | null {
  const range = rootBlockRange(doc.headExtra)
  if (!range) return null
  const block = doc.headExtra.slice(range.start, range.end)
  const masked = maskComments(block)
  const out: Partial<Record<ThemeVarName, string>> = {}
  for (const name of [...THEME_COLOR_VARS, ...THEME_FONT_VARS]) {
    const m = new RegExp(`${name}\\s*:\\s*([^;]*?)(?=\\s*(?:;|$))`).exec(masked)
    if (m && m[1] !== undefined) {
      const valueStart = m.index + m[0].length - m[1].length
      out[name] = block.slice(valueStart, valueStart + m[1].length).trim()
    }
  }
  return out
}

/**
 * :root 블록 안 해당 변수 선언의 값 부분만 교체한다 — 주변 CSS 바이트 무손상 (headExtra 왕복 보존 계약).
 * 블록에 없는 변수는 무시하고, 변경이 없으면 같은 객체를 반환한다.
 * 값은 UI가 생성한 hex/폰트 스택만 온다 — 치환 문자열에 특수문자($) 없음 전제.
 * 탐색은 주석을 공백으로 마스킹한 사본에서 하고, 교체는 원본 블록에 인덱스 스플라이스로 적용한다.
 */
export function setThemeVars(doc: DeckDoc, patch: Partial<Record<ThemeVarName, string>>): DeckDoc {
  const range = rootBlockRange(doc.headExtra)
  if (!range) return doc
  let block = doc.headExtra.slice(range.start, range.end)
  for (const [name, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const m = new RegExp(`${name}\\s*:\\s*([^;]*?)(?=\\s*(?:;|$))`).exec(maskComments(block))
    if (!m || m[1] === undefined) continue
    const valueStart = m.index + m[0].length - m[1].length
    block = block.slice(0, valueStart) + value + block.slice(valueStart + m[1].length)
  }
  const headExtra = doc.headExtra.slice(0, range.start) + block + doc.headExtra.slice(range.end)
  return headExtra === doc.headExtra ? doc : { ...doc, headExtra }
}
