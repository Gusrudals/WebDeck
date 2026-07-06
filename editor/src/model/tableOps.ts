import { mapKnownElement } from './ops.ts'
import { parseInlineStyle } from './style.ts'
import { parseTableMarkup } from './tableMarkup.ts'
import type { CellAlign, DeckDoc, Frame, Slide, TableCell, TableElement } from './types.ts'

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
  const clamped = widths.map((w) => Math.max(0, w))
  const sum = clamped.reduce((a, b) => a + b, 0)
  if (sum <= 0) return clamped.map(() => Math.round(10000 / widths.length) / 100)
  return clamped.map((w) => Math.round((w / sum) * 10000) / 100)
}

export function mapTable(doc: DeckDoc, slideId: string, elementId: string, fn: (el: TableElement) => TableElement): DeckDoc {
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

/**
 * no-op 단축 경로 전용: mapTable(→mapKnownElement→mapSlide) 호출 전에 현재 표를 들여다본다.
 * mapSlide는 slides/elements 배열을 항상 `.slice()`로 새로 만들어 반환하므로, fn이 el을 그대로
 * 반환해도(참조 동일) 최종 DeckDoc은 원본과 다른 객체가 된다 — "마지막 행/열 삭제는 같은 doc"
 * 계약을 지키려면 mapTable에 들어가기 전에 걸러 doc 자체를 그대로 돌려줘야 한다.
 * 슬라이드/요소를 못 찾거나 표가 아니면 null — 그 경우의 에러 처리는 mapTable에 위임한다.
 */
function peekTable(doc: DeckDoc, slideId: string, elementId: string): TableElement | null {
  const slide = doc.slides.find((s) => s.id === slideId)
  const el = slide?.elements.find((e) => e.id === elementId)
  return el && el.type === 'table' ? el : null
}

export function insertRow(doc: DeckDoc, slideId: string, elementId: string, index: number): DeckDoc {
  return mapTable(doc, slideId, elementId, (el) => {
    const cols = el.colWidths.length
    const anchors = flattenAnchors(el).map((a) => {
      // 삽입선(index-1행과 index행 사이)을 가로지르는 스팬은 확장
      if (a.r < index && a.r + a.cell.rowspan > index) {
        return { ...a, cell: { ...a.cell, rowspan: a.cell.rowspan + 1 } }
      }
      return a.r >= index ? { ...a, r: a.r + 1 } : a
    })
    // 새 행: 확장된 스팬이 덮지 않는 열에만 빈 셀
    const covered = new Set<number>()
    for (const a of anchors) {
      if (a.r < index && a.r + a.cell.rowspan > index) {
        for (let cc = a.c; cc < a.c + a.cell.colspan; cc++) covered.add(cc)
      }
    }
    for (let c = 0; c < cols; c++) {
      if (!covered.has(c)) anchors.push({ cell: newCell(), r: index, c })
    }
    return { ...el, rows: rebuildRows(el.rows.length + 1, anchors) }
  })
}

export function removeRow(doc: DeckDoc, slideId: string, elementId: string, index: number): DeckDoc {
  // 마지막 남은 행은 삭제 불가 — mapTable 진입 전에 걸러 doc을 그대로 반환(참조 동일성 보장)
  const current = peekTable(doc, slideId, elementId)
  if (current && current.rows.length <= 1) return doc
  return mapTable(doc, slideId, elementId, (el) => {
    const anchors: { cell: TableCell; r: number; c: number }[] = []
    for (const a of flattenAnchors(el)) {
      if (a.r === index) {
        // 앵커가 삭제선에 있음 — 스팬>1이면 다음 행으로 이전(내용 유지)
        if (a.cell.rowspan > 1) anchors.push({ cell: { ...a.cell, rowspan: a.cell.rowspan - 1 }, r: index, c: a.c })
        continue
      }
      if (a.r < index && a.r + a.cell.rowspan > index) {
        anchors.push({ ...a, cell: { ...a.cell, rowspan: a.cell.rowspan - 1 } })
        continue
      }
      anchors.push(a.r > index ? { ...a, r: a.r - 1 } : a)
    }
    return { ...el, rows: rebuildRows(el.rows.length - 1, anchors) }
  })
}

export function insertCol(doc: DeckDoc, slideId: string, elementId: string, index: number): DeckDoc {
  return mapTable(doc, slideId, elementId, (el) => {
    const anchors = flattenAnchors(el).map((a) => {
      if (a.c < index && a.c + a.cell.colspan > index) {
        return { ...a, cell: { ...a.cell, colspan: a.cell.colspan + 1 } }
      }
      return a.c >= index ? { ...a, c: a.c + 1 } : a
    })
    const covered = new Set<number>()
    for (const a of anchors) {
      if (a.c < index && a.c + a.cell.colspan > index) {
        for (let rr = a.r; rr < a.r + a.cell.rowspan; rr++) covered.add(rr)
      }
    }
    for (let r = 0; r < el.rows.length; r++) {
      if (!covered.has(r)) anchors.push({ cell: newCell(), r, c: index })
    }
    const widths = [...el.colWidths]
    widths.splice(index, 0, 100 / (el.colWidths.length + 1))
    return { ...el, colWidths: normalizeWidths(widths), rows: rebuildRows(el.rows.length, anchors) }
  })
}

export function removeCol(doc: DeckDoc, slideId: string, elementId: string, index: number): DeckDoc {
  // 마지막 남은 열은 삭제 불가 — mapTable 진입 전에 걸러 doc을 그대로 반환(참조 동일성 보장)
  const current = peekTable(doc, slideId, elementId)
  if (current && current.colWidths.length <= 1) return doc
  return mapTable(doc, slideId, elementId, (el) => {
    const anchors: { cell: TableCell; r: number; c: number }[] = []
    for (const a of flattenAnchors(el)) {
      if (a.c === index) {
        if (a.cell.colspan > 1) anchors.push({ cell: { ...a.cell, colspan: a.cell.colspan - 1 }, r: a.r, c: index })
        continue
      }
      if (a.c < index && a.c + a.cell.colspan > index) {
        anchors.push({ ...a, cell: { ...a.cell, colspan: a.cell.colspan - 1 } })
        continue
      }
      anchors.push(a.c > index ? { ...a, c: a.c - 1 } : a)
    }
    const widths = el.colWidths.filter((_, i) => i !== index)
    return { ...el, colWidths: normalizeWidths(widths), rows: rebuildRows(el.rows.length, anchors) }
  })
}

function normRect(r1: number, c1: number, r2: number, c2: number) {
  return { top: Math.min(r1, r2), left: Math.min(c1, c2), bottom: Math.max(r1, r2), right: Math.max(c1, c2) }
}

/** 범위 내 모든 점유 셀의 앵커+스팬이 범위에 완전히 포함될 때만 병합 가능(부분 겹침·단일 셀 거부) */
export function canMergeCells(el: TableElement, r1: number, c1: number, r2: number, c2: number): boolean {
  const { top, left, bottom, right } = normRect(r1, c1, r2, c2)
  if (top === bottom && left === right) return false
  const grid = buildGrid(el)
  const anchors = flattenAnchors(el)
  const anchorsInRect = new Set<string>()
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const a = grid[r]?.[c]
      if (!a) return false
      anchorsInRect.add(`${a.r},${a.c}`)
    }
  }
  // 범위 내 모든 앵커의 전체 스팬이 범위 안에 완전히 포함돼야 한다
  for (const key of anchorsInRect) {
    const [ar, ac] = key.split(',').map(Number) as [number, number]
    const cell = anchors.find((a) => a.r === ar && a.c === ac)!.cell
    if (ar < top || ac < left || ar + cell.rowspan - 1 > bottom || ac + cell.colspan - 1 > right) return false
  }
  if (anchorsInRect.size < 2) return false
  return true
}

export function mergeCells(
  doc: DeckDoc, slideId: string, elementId: string,
  r1: number, c1: number, r2: number, c2: number,
): DeckDoc {
  // 브리프 보정: canMerge=false일 때 mapTable 내부에서 `return el`로 no-op하면 mapSlide가
  // 항상 새 배열/객체 wrapper를 재조립하므로 `toBe(doc)` 참조 계약이 깨진다(Task 4에서 실증된 결함).
  // mapTable 진입 전에 peekTable로 걸러 doc 자체를 그대로 반환한다.
  const current = peekTable(doc, slideId, elementId)
  if (current && !canMergeCells(current, r1, c1, r2, c2)) return doc
  return mapTable(doc, slideId, elementId, (el) => {
    const { top, left, bottom, right } = normRect(r1, c1, r2, c2)
    const inRect = (a: { r: number; c: number }) => a.r >= top && a.r <= bottom && a.c >= left && a.c <= right
    const anchors = flattenAnchors(el)
    const merged = anchors.filter(inRect).sort((x, y) => x.r - y.r || x.c - y.c)
    const html = merged.map((a) => a.cell.html).filter((h) => h !== '').join('')
    const target = merged[0]!
    const keep = anchors.filter((a) => !inRect(a))
    keep.push({ r: top, c: left, cell: { ...target.cell, html, colspan: right - left + 1, rowspan: bottom - top + 1 } })
    return { ...el, rows: rebuildRows(el.rows.length, keep) }
  })
}

export function splitCell(doc: DeckDoc, slideId: string, elementId: string, r: number, c: number): DeckDoc {
  // 브리프 보정: 대상 앵커가 없거나 스팬이 이미 1이면 mapTable 진입 전에 doc을 그대로 반환한다
  // (mergeCells와 동일한 참조 동일성 사유).
  const current = peekTable(doc, slideId, elementId)
  if (current) {
    const target = flattenAnchors(current).find((a) => a.r === r && a.c === c)
    if (!target || (target.cell.colspan === 1 && target.cell.rowspan === 1)) return doc
  }
  return mapTable(doc, slideId, elementId, (el) => {
    const anchors = flattenAnchors(el)
    const target = anchors.find((a) => a.r === r && a.c === c)!
    const out = anchors.filter((a) => a !== target)
    out.push({ r, c, cell: { ...target.cell, colspan: 1, rowspan: 1 } })
    for (let rr = r; rr < r + target.cell.rowspan; rr++) {
      for (let cc = c; cc < c + target.cell.colspan; cc++) {
        if (rr === r && cc === c) continue
        out.push({ r: rr, c: cc, cell: newCell(target.cell.header) })
      }
    }
    return { ...el, rows: rebuildRows(el.rows.length, out) }
  })
}

export function setCellsStyle(
  doc: DeckDoc, slideId: string, elementId: string,
  r1: number, c1: number, r2: number, c2: number,
  patch: { bg?: string | null; align?: CellAlign | null },
): DeckDoc {
  return mapTable(doc, slideId, elementId, (el) => {
    const { top, left, bottom, right } = normRect(r1, c1, r2, c2)
    const anchors = flattenAnchors(el).map((a) => {
      if (a.r < top || a.r > bottom || a.c < left || a.c > right) return a
      return {
        ...a,
        cell: {
          ...a.cell,
          ...(patch.bg !== undefined ? { bg: patch.bg } : {}),
          ...(patch.align !== undefined ? { align: patch.align } : {}),
        },
      }
    })
    return { ...el, rows: rebuildRows(el.rows.length, anchors) }
  })
}

export function toggleHeaderCells(
  doc: DeckDoc, slideId: string, elementId: string,
  r1: number, c1: number, r2: number, c2: number,
): DeckDoc {
  return mapTable(doc, slideId, elementId, (el) => {
    const { top, left, bottom, right } = normRect(r1, c1, r2, c2)
    const inRect = (a: { r: number; c: number }) => a.r >= top && a.r <= bottom && a.c >= left && a.c <= right
    const anchors = flattenAnchors(el)
    const allHeader = anchors.filter(inRect).every((a) => a.cell.header)
    return {
      ...el,
      rows: rebuildRows(el.rows.length, anchors.map((a) => (inRect(a) ? { ...a, cell: { ...a.cell, header: !allHeader } } : a))),
    }
  })
}

export function setColWidths(doc: DeckDoc, slideId: string, elementId: string, widths: number[]): DeckDoc {
  // 브리프 보정: 길이 불일치 시 mapTable 진입 전에 doc을 그대로 반환한다(참조 동일성 보장).
  const current = peekTable(doc, slideId, elementId)
  if (current && widths.length !== current.colWidths.length) return doc
  return mapTable(doc, slideId, elementId, (el) => ({ ...el, colWidths: widths }))
}

const FALLBACK_FRAME: Frame = { left: 96, top: 200, width: 1088, height: 320 }

/**
 * 노드 바로 아래에 공백 아닌 텍스트 노드 또는 주석 노드가 있는지 — stray 텍스트/주석 소실 가드
 * (브리프 Critical 보정). 플랜 스니펫은 `dom.body.children`/`root.children`(요소만) 검사라
 * `<table>…</table>trailing텍스트`·`<div>캡션<table>…</table></div>` 꼴에서 표 밖 텍스트·주석이
 * 조용히 소실된다 — Task 2에서 Critical로 잡힌 hasStrayText 결함과 동일 패턴이다(parse.ts의
 * el-table 승격 가드 참고). 주석은 모델에 보존할 자리가 없으므로 있으면 무조건 변환을 거부한다
 * (무손실 우선 — opaque로 남겨 원문 그대로 보존).
 */
function hasStrayContent(node: Element): boolean {
  return Array.from(node.childNodes).some((n) => {
    if (n.nodeType === 8) return true // Comment
    if (n.nodeType === 3) return (n.textContent ?? '').trim() !== '' // Text
    return false
  })
}

/** opaque 원문에서 표를 추출한다 — 단일 table(±1겹 래퍼)만, 정형 파싱 실패 시 null (플랜 Task 6 스펙 §3) */
export function tableFromOpaqueHtml(idGen: () => string, html: string): TableElement | null {
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  if (hasStrayContent(dom.body)) return null
  const roots = Array.from(dom.body.children)
  if (roots.length !== 1) return null
  const root = roots[0]!
  let tableEl: Element
  let frame = FALLBACK_FRAME
  if (root.tagName === 'TABLE') {
    tableEl = root
  } else if (root.children.length === 1 && root.children[0]!.tagName === 'TABLE') {
    if (hasStrayContent(root)) return null
    tableEl = root.children[0]!
    const style = parseInlineStyle(root.getAttribute('style') ?? '')
    // 브리프 주의(이탈): 플랜 스니펫 정규식 `/^-?\d+(\.\d+)?px$/`은 음수 width/height도 통과시킨다.
    // width/height는 양수만 frame으로 인정(0 이하는 FALLBACK_FRAME) — left/top은 음수를 허용한다.
    const nums = (['left', 'top', 'width', 'height'] as const).map((prop) => {
      const v = style[prop]
      if (v === undefined || !/^-?\d+(\.\d+)?px$/.test(v)) return NaN
      const n = parseFloat(v)
      return (prop === 'width' || prop === 'height') && !(n > 0) ? NaN : n
    })
    if (nums.every((n) => Number.isFinite(n))) {
      frame = { left: nums[0]!, top: nums[1]!, width: nums[2]!, height: nums[3]! }
    }
  } else {
    return null
  }
  const parsed = parseTableMarkup(tableEl)
  if (!parsed) return null
  return {
    type: 'table', id: idGen(), frame: { ...frame }, rotation: 0,
    extraStyle: {}, extraAttrs: {}, extraClasses: [],
    colWidths: parsed.colWidths, rows: parsed.rows,
  }
}

const probeIdGen = () => 'probe'

/** 슬라이드 내 opaque 중 표로 변환 가능한 개수(UI 안내용) — probeIdGen으로 id를 소모하지 않는다 */
export function convertibleOpaqueTableCount(slide: Slide): number {
  return slide.elements.filter((e) => e.type === 'opaque' && tableFromOpaqueHtml(probeIdGen, e.html) !== null).length
}

/**
 * 슬라이드의 opaque 요소 중 변환 가능한 것만 표(el-table)로 교체한다(요소 인덱스 유지).
 * 하나도 변환하지 못하면 changed 플래그로 걸러 같은 doc 객체를 그대로 반환한다(toBe 계약 —
 * mergeCells/splitCell/setColWidths와 동일한 참조 동일성 사유, no-op 경로는 mapTable을 거치지
 * 않으므로 peekTable 단락이 불필요하다).
 */
export function convertOpaqueTables(doc: DeckDoc, slideId: string, idGen: () => string): DeckDoc {
  let changed = false
  const slides = doc.slides.map((s) => {
    if (s.id !== slideId) return s
    const elements = s.elements.map((e) => {
      if (e.type !== 'opaque') return e
      const t = tableFromOpaqueHtml(idGen, e.html)
      if (!t) return e
      changed = true
      return t
    })
    return changed ? { ...s, elements } : s
  })
  return changed ? { ...doc, slides } : doc
}
