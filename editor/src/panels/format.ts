export const FONT_SIZES = [12, 16, 20, 28, 40, 56]
export const LINE_HEIGHTS = [1, 1.15, 1.5, 2]

type FormatCommand = 'bold' | 'italic' | 'underline' | 'justifyLeft' | 'justifyCenter' | 'justifyRight'

export function execFormat(command: FormatCommand): void {
  document.execCommand?.(command)
}

export function execColor(color: string): void {
  document.execCommand?.('styleWithCSS', false, 'true')
  document.execCommand?.('foreColor', false, color)
  document.execCommand?.('styleWithCSS', false, 'false')
}

export function execList(kind: 'ul' | 'ol'): void {
  document.execCommand?.(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList')
}

/** execCommand('fontSize')는 <font size>만 만든다 — 즉시 px span으로 치환하는 표준 우회 */
export function execFontSize(px: number): void {
  document.execCommand?.('fontSize', false, '7')
  for (const font of Array.from(document.querySelectorAll('font[size="7"]'))) {
    const span = document.createElement('span')
    span.style.fontSize = `${px}px`
    while (font.firstChild) span.appendChild(font.firstChild)
    font.replaceWith(span)
  }
}

export interface FontOption {
  label: string
  stack: string
}

/** 시스템 폰트 스택 큐레이션 — self-contained 제약상 웹폰트 임베딩 없이 폴백 체인으로 */
export const FONT_FAMILIES: FontOption[] = [
  { label: '기본 고딕', stack: '"Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif' },
  { label: '나눔고딕', stack: '"NanumGothic", "나눔고딕", "Malgun Gothic", sans-serif' },
  { label: '명조', stack: '"NanumMyeongjo", "나눔명조", "Batang", "바탕", serif' },
  { label: '돋움', stack: '"Dotum", "돋움", "Gulim", "굴림", sans-serif' },
  { label: '고정폭', stack: '"D2Coding", "Consolas", "Courier New", monospace' },
]

export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 120

export function clampFontSize(n: number): number {
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(n)))
}

export function execFontName(stack: string): void {
  document.execCommand?.('styleWithCSS', false, 'true')
  document.execCommand?.('fontName', false, stack)
  document.execCommand?.('styleWithCSS', false, 'false')
}

// ---------- 텍스트 도구 포커스 인프라 ----------
// 포커스를 받는 텍스트 도구(input/select)는 contentEditable의 셀렉션을 잃는다.
// 도구 포커스 직전에 저장(saveSelection)하고, execCommand 직전에 복원(restoreSelection)한다.

let savedRange: Range | null = null

export function saveSelection(): void {
  const sel = window.getSelection?.()
  savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
}

export function restoreSelection(): void {
  if (!savedRange) return
  const sel = window.getSelection?.()
  if (!sel) return
  sel.removeAllRanges()
  sel.addRange(savedRange)
}

/** 편집 중인 텍스트 상자로 포커스를 되돌린다 — 편집 요소는 동시에 1개뿐 */
export function focusEditable(): void {
  document.querySelector<HTMLElement>('.text-editable')?.focus()
}

/** 셀렉션이 걸친 문단(p/li)에 line-height 지정 — execCommand에 없는 기능이라 직접 처리 */
export function setLineHeight(value: number): void {
  const sel = window.getSelection?.()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  const anchor = range.commonAncestorContainer
  const anchorEl = anchor instanceof Element ? anchor : anchor.parentElement
  const editable = anchorEl?.closest('.text-editable')
  if (!editable) return
  const blocks = Array.from(editable.querySelectorAll<HTMLElement>('p, li'))
  for (const b of blocks.filter((blk) => range.intersectsNode(blk))) b.style.lineHeight = String(value)
}
