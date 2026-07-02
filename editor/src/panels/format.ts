export const FONT_SIZES = [12, 16, 20, 28, 40, 56]

/** 글자색 스와치 — input[type=color]는 포커스를 뺏어 편집이 끝나므로 버튼 팔레트 사용 */
export const TEXT_COLORS = ['#1f2937', '#1a56db', '#dc2626', '#16a34a', '#d97706', '#ffffff']

type FormatCommand = 'bold' | 'italic' | 'underline' | 'justifyLeft' | 'justifyCenter' | 'justifyRight'

export function execFormat(command: FormatCommand): void {
  document.execCommand?.(command)
}

export function execColor(color: string): void {
  document.execCommand?.('styleWithCSS', false, 'true')
  document.execCommand?.('foreColor', false, color)
  document.execCommand?.('styleWithCSS', false, 'false')
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
