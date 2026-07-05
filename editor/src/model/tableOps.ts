import { mapKnownElement } from './ops.ts'
import type { DeckDoc, Frame, TableCell, TableElement } from './types.ts'

export const DEFAULT_CELL_BORDER = '1px solid #d1d5db'
export const DEFAULT_CELL_PADDING = '6px 10px'

export function newCell(header = false): TableCell {
  const extraStyle: Record<string, string> = { border: DEFAULT_CELL_BORDER, padding: DEFAULT_CELL_PADDING }
  // background는 1급 필드(bg)에 담는다 — extraStyle에 두면 파서가 왕복 시 이를 bg로 재분류하여
  // (tableMarkup.ts parseCell은 style의 background를 항상 bg로 승격하고 extraStyle에서 제외)
  // 원본과 재파싱 결과가 어긋나 checkRoundTrip이 실패한다.
  return { html: '', colspan: 1, rowspan: 1, header, bg: header ? 'var(--wd-accent)' : null, align: null, extraStyle, extraAttrs: {} }
}

export function createTable(idGen: () => string, rowCount: number, colCount: number, frame: Frame): TableElement {
  const rows: TableCell[][] = Array.from({ length: rowCount }, (_, r) =>
    Array.from({ length: colCount }, () => newCell(r === 0)),
  )
  return {
    type: 'table', id: idGen(), frame: { ...frame }, rotation: 0,
    extraStyle: {}, extraAttrs: {}, extraClasses: [],
    colWidths: normalizeWidths(Array(colCount).fill(1)), rows,
  }
}

/** 그리드 각 칸을 점유한 앵커 좌표 — 정합 모델 전제(파서가 보증) */
export function buildGrid(el: TableElement): ({ r: number; c: number } | null)[][] {
  const cols = el.colWidths.length
  const grid: ({ r: number; c: number } | null)[][] = el.rows.map(() => Array(cols).fill(null))
  for (let r = 0; r < el.rows.length; r++) {
    let c = 0
    for (const cell of el.rows[r]!) {
      while (c < cols && grid[r]![c] !== null) c++
      for (let rr = r; rr < Math.min(r + cell.rowspan, el.rows.length); rr++) {
        for (let cc = c; cc < Math.min(c + cell.colspan, cols); cc++) {
          grid[rr]![cc] = { r, c }
        }
      }
      c += cell.colspan
    }
  }
  return grid
}

export function normalizeWidths(widths: number[]): number[] {
  const sum = widths.reduce((a, b) => a + b, 0)
  if (sum <= 0) return widths.map(() => Math.round(10000 / widths.length) / 100)
  return widths.map((w) => Math.round((w / sum) * 10000) / 100)
}

function mapTable(doc: DeckDoc, slideId: string, elementId: string, fn: (el: TableElement) => TableElement): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) => (el.type === 'table' ? fn(el) : el))
}

export function setCellHtml(doc: DeckDoc, slideId: string, elementId: string, r: number, c: number, html: string): DeckDoc {
  return mapTable(doc, slideId, elementId, (el) => {
    const grid = buildGrid(el)
    const anchor = grid[r]?.[c]
    if (!anchor || anchor.r !== r || anchor.c !== c) return el
    return {
      ...el,
      rows: el.rows.map((row, rr) =>
        rr !== r ? row : row.map((cell) => (cellColOf(el, rr, cell) === c ? { ...cell, html } : cell)),
      ),
    }
  })
}

/** rows[r] 안에서 cell의 그리드 열 좌표 — 평탄화 변환의 공용 헬퍼 */
export function cellColOf(el: TableElement, r: number, target: TableCell): number {
  const grid = buildGrid(el)
  const cols = el.colWidths.length
  let idx = 0
  for (let c = 0; c < cols; c++) {
    const a = grid[r]![c]
    if (a && a.r === r && a.c === c) {
      if (el.rows[r]![idx] === target) return c
      idx++
    }
  }
  return -1
}

/** 평탄화: 앵커 목록 [{cell, r, c}] — 변환 후 rebuildRows로 재조립 */
export function flattenAnchors(el: TableElement): { cell: TableCell; r: number; c: number }[] {
  const grid = buildGrid(el)
  const out: { cell: TableCell; r: number; c: number }[] = []
  for (let r = 0; r < el.rows.length; r++) {
    let idx = 0
    for (let c = 0; c < el.colWidths.length; c++) {
      const a = grid[r]![c]
      if (a && a.r === r && a.c === c) {
        out.push({ cell: el.rows[r]![idx]!, r, c })
        idx++
      }
    }
  }
  return out
}

export function rebuildRows(rowCount: number, anchors: { cell: TableCell; r: number; c: number }[]): TableCell[][] {
  const rows: TableCell[][] = Array.from({ length: rowCount }, () => [])
  for (const a of [...anchors].sort((x, y) => x.r - y.r || x.c - y.c)) rows[a.r]!.push(a.cell)
  return rows
}
