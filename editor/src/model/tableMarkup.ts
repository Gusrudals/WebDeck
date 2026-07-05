import { parseInlineStyle, serializeInlineStyle } from './style.ts'
import type { CellAlign, TableCell } from './types.ts'

const ALIGNS: CellAlign[] = ['left', 'center', 'right']

/** 그리드 정합 — 앵커·스팬을 전개했을 때 겹침/빈 칸/경계 초과가 없어야 한다 */
export function gridIsValid(colWidths: number[], rows: TableCell[][]): boolean {
  const cols = colWidths.length
  if (cols === 0 || rows.length === 0) return false
  const occupied: boolean[][] = rows.map(() => Array<boolean>(cols).fill(false))
  for (let r = 0; r < rows.length; r++) {
    let c = 0
    for (const cell of rows[r]!) {
      while (c < cols && occupied[r]![c]) c++
      if (c >= cols) return false
      if (cell.colspan < 1 || cell.rowspan < 1) return false
      if (c + cell.colspan > cols || r + cell.rowspan > rows.length) return false
      for (let rr = r; rr < r + cell.rowspan; rr++) {
        for (let cc = c; cc < c + cell.colspan; cc++) {
          if (occupied[rr]![cc]) return false
          occupied[rr]![cc] = true
        }
      }
      c += cell.colspan
    }
  }
  return occupied.every((row) => row.every(Boolean))
}

function parseCell(el: Element): TableCell | null {
  const tag = el.tagName.toLowerCase()
  if (tag !== 'td' && tag !== 'th') return null
  if (el.querySelector('table')) return null
  const colspan = Number(el.getAttribute('colspan') ?? '1')
  const rowspan = Number(el.getAttribute('rowspan') ?? '1')
  if (!Number.isInteger(colspan) || !Number.isInteger(rowspan) || colspan < 1 || rowspan < 1) return null
  const style = parseInlineStyle(el.getAttribute('style') ?? '')
  const bg = style['background'] ?? null
  const rawAlign = style['text-align']
  const align = rawAlign !== undefined && (ALIGNS as string[]).includes(rawAlign) ? (rawAlign as CellAlign) : null
  const extraStyle: Record<string, string> = {}
  for (const [prop, value] of Object.entries(style)) {
    if (prop === 'background') continue
    if (prop === 'text-align' && align !== null) continue
    extraStyle[prop] = value
  }
  const extraAttrs: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    if (['colspan', 'rowspan', 'style'].includes(attr.name)) continue
    extraAttrs[attr.name] = attr.value
  }
  return { html: el.innerHTML.trim(), colspan, rowspan, header: tag === 'th', bg, align, extraStyle, extraAttrs }
}

/** table 요소에서 모델을 추출한다 — 정형이 아니면 null (스펙 §2.3) */
export function parseTableMarkup(tableEl: Element): { colWidths: number[]; rows: TableCell[][] } | null {
  const trs = Array.from(tableEl.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr'))
  if (trs.length === 0) return null
  const rows: TableCell[][] = []
  for (const tr of trs) {
    const cells: TableCell[] = []
    for (const child of Array.from(tr.children)) {
      const cell = parseCell(child)
      if (!cell) return null
      cells.push(cell)
    }
    rows.push(cells)
  }
  // 열 수 = 첫 행 스팬 합 (그리드 정합 검사가 나머지를 보증)
  const cols = rows[0]!.reduce((n, c) => n + c.colspan, 0)
  let colWidths: number[]
  const colEls = Array.from(tableEl.querySelectorAll(':scope > colgroup > col'))
  if (colEls.length === cols) {
    const parsed = colEls.map((col) => {
      const w = parseInlineStyle(col.getAttribute('style') ?? '')['width']
      return w !== undefined && /^\d+(\.\d+)?%$/.test(w) ? parseFloat(w) : NaN
    })
    colWidths = parsed.every((w) => Number.isFinite(w)) ? parsed : Array(cols).fill(round2(100 / cols))
  } else {
    colWidths = Array(cols).fill(round2(100 / cols))
  }
  if (!gridIsValid(colWidths, rows)) return null
  return { colWidths, rows }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function cellHtml(cell: TableCell): string {
  const tag = cell.header ? 'th' : 'td'
  const colspan = cell.colspan > 1 ? ` colspan="${cell.colspan}"` : ''
  const rowspan = cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ''
  const style = serializeInlineStyle({
    ...cell.extraStyle,
    ...(cell.bg !== null ? { background: cell.bg } : {}),
    ...(cell.align !== null ? { 'text-align': cell.align } : {}),
  })
  const styleAttr = style ? ` style="${style.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"` : ''
  const attrs = Object.entries(cell.extraAttrs)
    .map(([name, value]) => ` ${name}="${value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`)
    .join('')
  return `<${tag}${colspan}${rowspan}${styleAttr}${attrs}>${cell.html}</${tag}>`
}

/** 정준형 내부 마크업 — colgroup·tbody는 항상 재생성 (스펙 §2.2) */
export function serializeTableInner(colWidths: number[], rows: TableCell[][]): string {
  const colgroup = `<colgroup>${colWidths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>`
  const body = rows.map((row) => `<tr>${row.map(cellHtml).join('')}</tr>`).join('')
  return `${colgroup}<tbody>${body}</tbody>`
}
