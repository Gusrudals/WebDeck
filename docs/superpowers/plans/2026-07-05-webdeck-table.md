# WebDeck Plan 9b — 표 편집기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** colspan/rowspan 병합을 1급으로 포함한 `el-table` 요소 타입과 편집 UI(삽입·셀 편집·행/열·병합/분할·서식·열 너비·opaque 변환)를 추가한다.

**Architecture:** 모델은 앵커 셀만 담는 `rows: TableCell[][]` + `colWidths`(%). 편집 연산은 "그리드 전개(buildGrid) → 평탄화 변환 → 재조립" 패턴의 순수 함수(`model/tableOps.ts`). 마크업 변환은 `model/tableMarkup.ts`가 파서·직렬화·opaque 변환에서 공유(table 태그·colgroup은 정준형, td/th는 보존형). 셀 선택은 App 로컬 상태, 셀 편집 억제는 기존 editingTextId 재사용 — 리듀서 무변경.

**Tech Stack:** React 19 + TypeScript strict + Vite 8, Vitest + happy-dom + RTL, node:test + node-html-parser (tools)

**스펙:** `docs/superpowers/specs/2026-07-05-webdeck-table-design.md`

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess`, 상대 import `.ts`/`.tsx` 확장자. 신규 의존성 금지. 리듀서(`state/store.ts`)·런타임·템플릿 무변경
- `TableCell { html, colspan, rowspan, header, bg, align, extraStyle, extraAttrs }` / `TableElement extends ElementBase { type:'table', colWidths: number[], rows: TableCell[][] }` — rows에는 **앵커 셀만**
- 정준·보존 경계: table 태그(`style="border-collapse:collapse; width:100%;"` 고정)와 colgroup은 직렬화가 재생성, td/th는 보존형. 셀 style 중 `background`→bg, `text-align`(left/center/right만)→align 승격, 그 외 extraStyle 원문 보존
- 승격 조건: `.el.el-table` + frame + table 1개 + 정형(td/th만, 스팬 양의 정수, 그리드 정합 — 빈 칸·겹침 없음). 위반 시 opaque 보존. 일반 `<table>`(el-table 클래스 없음)은 기존대로 opaque
- 기본 셀 외형은 삽입 시 extraStyle 내장: `border: 1px solid #d1d5db`, `padding: 6px 10px`, 헤더는 `background: var(--wd-accent)` 추가
- 모든 연산 후 그리드 정합 유지 + 내용 무손실(병합 = 행 우선 연결, 행/열 삭제 시 스팬>1 앵커는 내용 이전). 마지막 행/열 삭제는 no-op(같은 객체)
- 1 조작 = 1 APPLY_DOC. 셀 선택 상태(App useState)는 undo·문서 무관, 요소 선택/슬라이드 변경 시 초기화
- 문구 verbatim: 툴바 버튼 `표`, 패널 섹션 제목 `표`, 버튼 `행 추가`/`행 삭제`/`열 추가`/`열 삭제`/`병합`/`분할`/`헤더`, 변환 버튼 `편집 불가 표 N개를 표 요소로 변환`
- 테스트: `cd editor && npx vitest run <파일>`, 전체 `npm run test:all`(루트)

---

### Task 1: 모델 타입 + 표 마크업 변환 (`model/tableMarkup.ts`)

**Files:**
- Modify: `editor/src/model/types.ts`
- Create: `editor/src/model/tableMarkup.ts`
- Test: `editor/src/model/tableMarkup.test.ts`

**Interfaces:**
- Produces (Task 2·3·6이 사용):
  - types.ts: `TableCell`, `TableElement`(KnownElement 유니언 포함), `CellAlign = 'left' | 'center' | 'right'`
  - `parseTableMarkup(tableEl: Element): { colWidths: number[]; rows: TableCell[][] } | null` — 정형이 아니면 null (그리드 정합 포함)
  - `serializeTableInner(colWidths: number[], rows: TableCell[][]): string` — `<colgroup>…</colgroup><tbody>…</tbody>` (정준형)
  - `gridIsValid(colWidths: number[], rows: TableCell[][]): boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/tableMarkup.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseTableMarkup, serializeTableInner } from './tableMarkup.ts'

function tableEl(inner: string): Element {
  const doc = new DOMParser().parseFromString(`<table>${inner}</table>`, 'text/html')
  return doc.querySelector('table')!
}

describe('parseTableMarkup', () => {
  test('기본 2×2 표를 파싱한다 (colgroup 없으면 균등)', () => {
    const r = parseTableMarkup(tableEl('<tbody><tr><th>A</th><th>B</th></tr><tr><td><p>1</p></td><td>2</td></tr></tbody>'))!
    expect(r.colWidths).toEqual([50, 50])
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]![0]!.header).toBe(true)
    expect(r.rows[1]![0]!.html).toBe('<p>1</p>')
    expect(r.rows[1]![1]!.colspan).toBe(1)
  })

  test('colgroup의 % 너비를 읽는다', () => {
    const r = parseTableMarkup(tableEl('<colgroup><col style="width:30%"><col style="width:70%"></colgroup><tbody><tr><td>a</td><td>b</td></tr></tbody>'))!
    expect(r.colWidths).toEqual([30, 70])
  })

  test('병합(colspan/rowspan)을 앵커 셀로 파싱하고 그리드 정합을 검증한다', () => {
    const r = parseTableMarkup(tableEl('<tbody><tr><td colspan="2">AB</td></tr><tr><td rowspan="2">C</td><td>D</td></tr><tr><td>E</td></tr></tbody>'))!
    expect(r.rows[0]).toHaveLength(1)
    expect(r.rows[0]![0]!.colspan).toBe(2)
    expect(r.rows[1]![0]!.rowspan).toBe(2)
    expect(r.rows[2]).toHaveLength(1)
  })

  test('셀 style의 background·text-align은 1급으로, 나머지는 extraStyle 보존', () => {
    const r = parseTableMarkup(tableEl('<tbody><tr><td style="background:#eef2ff; text-align:center; border:2px solid red; color:#111;">x</td></tr></tbody>'))!
    const cell = r.rows[0]![0]!
    expect(cell.bg).toBe('#eef2ff')
    expect(cell.align).toBe('center')
    expect(cell.extraStyle['border']).toBe('2px solid red')
    expect(cell.extraStyle['color']).toBe('#111')
    expect(cell.extraStyle['background']).toBeUndefined()
  })

  test('비표준 text-align(justify)은 승격하지 않고 extraStyle 보존', () => {
    const r = parseTableMarkup(tableEl('<tbody><tr><td style="text-align:justify;">x</td></tr></tbody>'))!
    expect(r.rows[0]![0]!.align).toBeNull()
    expect(r.rows[0]![0]!.extraStyle['text-align']).toBe('justify')
  })

  test('그리드 부정합(행별 스팬 합 불일치)은 null', () => {
    expect(parseTableMarkup(tableEl('<tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></tbody>'))).toBeNull()
  })

  test('중첩 표·td/th 외 자식은 null', () => {
    expect(parseTableMarkup(tableEl('<tbody><tr><td><table></table></td></tr></tbody>'))).toBeNull()
    expect(parseTableMarkup(tableEl('<tbody><tr><div>x</div></tr></tbody>'))).toBeNull()
  })

  test('스팬 0·음수는 null', () => {
    expect(parseTableMarkup(tableEl('<tbody><tr><td colspan="0">a</td></tr></tbody>'))).toBeNull()
  })
})

describe('serializeTableInner', () => {
  test('정준형 출력 — colgroup·tbody·스팬·1급 서식·보존 스타일', () => {
    const out = serializeTableInner([30, 70], [
      [{ html: '<p>H</p>', colspan: 2, rowspan: 1, header: true, bg: '#eef2ff', align: 'center', extraStyle: { border: '1px solid #d1d5db' }, extraAttrs: {} }],
      [
        { html: 'a', colspan: 1, rowspan: 1, header: false, bg: null, align: null, extraStyle: {}, extraAttrs: { 'data-k': 'v' } },
        { html: 'b', colspan: 1, rowspan: 1, header: false, bg: null, align: null, extraStyle: {}, extraAttrs: {} },
      ],
    ])
    expect(out).toContain('<colgroup><col style="width:30%"><col style="width:70%"></colgroup>')
    expect(out).toContain('<th colspan="2" style="border: 1px solid #d1d5db; background: #eef2ff; text-align: center;"><p>H</p></th>')
    expect(out).toContain('<td data-k="v">a</td>')
  })

  test('파싱↔직렬화 왕복이 안정적이다 (2회 직렬화 동일)', () => {
    const inner = '<tbody><tr><th colspan="2" style="background: #eef;"><p>H</p></th></tr><tr><td>a</td><td style="text-align: right;">b</td></tr></tbody>'
    const r1 = parseTableMarkup(tableEl(inner))!
    const s1 = serializeTableInner(r1.colWidths, r1.rows)
    const r2 = parseTableMarkup(tableEl(s1))!
    expect(serializeTableInner(r2.colWidths, r2.rows)).toBe(s1)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/model/tableMarkup.test.ts`. Expected: FAIL(모듈 없음)

- [ ] **Step 3: types.ts 확장**

`editor/src/model/types.ts` — ShapeElement 아래에 추가, KnownElement/SlideElement 유니언에 TableElement 포함:

```ts
export type CellAlign = 'left' | 'center' | 'right'

export interface TableCell {
  /** 셀 내부 HTML — el-text와 같은 계약(인라인 서식 보존, trim) */
  html: string
  colspan: number
  rowspan: number
  /** th 여부 */
  header: boolean
  /** 1급 셀 서식 — background/text-align. 그 외 스타일은 extraStyle 보존 */
  bg: string | null
  align: CellAlign | null
  extraStyle: Record<string, string>
  extraAttrs: Record<string, string>
}

export interface TableElement extends ElementBase {
  type: 'table'
  /** 열 너비 % — 길이 = 그리드 열 수 */
  colWidths: number[]
  /** 앵커 셀만 (HTML 마크업과 1:1). 스팬으로 덮인 행은 빈 배열 허용 */
  rows: TableCell[][]
}
```

`export type SlideElement = TextElement | ImageElement | ShapeElement | TableElement | OpaqueElement`
`export type KnownElement = TextElement | ImageElement | ShapeElement | TableElement`

- [ ] **Step 4: tableMarkup.ts 구현**

`editor/src/model/tableMarkup.ts`:

```ts
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
```

주의: `serializeInlineStyle`의 실제 출력 형식(`prop: value; ` 구분)을 먼저 확인하고 테스트 기대 문자열과 일치시킬 것 — 형식이 다르면 **테스트의 기대 문자열을 실제 형식에 맞춰 조정**(검증 대상은 승격/보존 규칙이지 공백 형식이 아님). `:scope` 셀렉터가 happy-dom에서 미지원이면 `Array.from(tableEl.children)`를 순회하는 동등 구현으로 대체하고 보고서에 기록.

- [ ] **Step 5: 통과 확인** — Run: `cd editor && npx vitest run src/model/tableMarkup.test.ts && npm run typecheck`. typecheck에서 KnownElement 유니언 확장으로 깨지는 기존 switch(ElementView·serialize 등)가 있으면 **이 태스크에서는 고치지 말고** exhaustive 오류 목록만 보고서에 기록 — Task 2·8이 처리한다. 오류가 컴파일을 막으면 해당 switch에 임시 `case 'table': throw new Error('Task 2/8에서 구현')` 를 넣지 말고, typecheck 실패를 보고서에 명시하고 테스트 통과만 확인.

- [ ] **Step 6: 커밋**

```bash
git add editor/src/model/types.ts editor/src/model/tableMarkup.ts editor/src/model/tableMarkup.test.ts
git commit -m "feat(model): TableElement 타입·표 마크업 파싱/정준 직렬화"
```

---

### Task 2: 파서·직렬화 통합 (el-table 왕복)

**Files:**
- Modify: `editor/src/model/parse.ts`, `editor/src/model/serialize.ts`
- Test: `editor/src/model/tableRoundtrip.test.ts` (신규)

**Interfaces:**
- Consumes: Task 1 전부
- Produces: el-table 문서의 parseWebdeck/serializeWebdeck 왕복

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/tableRoundtrip.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'
import { serializeWebdeck } from './serialize.ts'

const WRAP = (inner: string) => `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">${inner}</section>
</main></body></html>`

const TABLE = (inner: string, style = 'left:96px; top:200px; width:720px; height:160px;') =>
  WRAP(`<div class="el el-table" style="${style}"><table>${inner}</table></div>`)

describe('el-table 왕복', () => {
  test('병합 표가 TableElement로 승격되고 왕복한다', () => {
    const doc = parseWebdeck(TABLE('<tbody><tr><th colspan="2"><p>헤더</p></th></tr><tr><td rowspan="2"><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td></tr></tbody>'))
    const el = doc.slides[0]!.elements[0]!
    expect(el.type).toBe('table')
    if (el.type !== 'table') return
    expect(el.colWidths).toEqual([50, 50])
    expect(el.rows[0]![0]!.colspan).toBe(2)
    expect(checkRoundTrip(doc)).toBeNull()
    const html = serializeWebdeck(doc)
    expect(html).toContain('data-webdeck-version')
    expect(html).toContain('<table style="border-collapse:collapse; width:100%;">')
    expect(html).toContain('rowspan="2"')
  })

  test('2회 직렬화가 동일하다 (정준화 1회)', () => {
    const doc = parseWebdeck(TABLE('<tbody><tr><td style="text-align:center; background:#eef;">x</td><td>y</td></tr></tbody>'))
    const once = serializeWebdeck(doc)
    expect(serializeWebdeck(parseWebdeck(once))).toBe(once)
  })

  test('회전·extraStyle과 조합된 표도 왕복한다', () => {
    const doc = parseWebdeck(TABLE('<tbody><tr><td>x</td></tr></tbody>', 'left:96px; top:200px; width:720px; height:160px; transform:rotate(5deg); opacity:0.9;'))
    const el = doc.slides[0]!.elements[0]!
    if (el.type !== 'table') return
    expect(el.rotation).toBe(5)
    expect(el.extraStyle['opacity']).toBe('0.9')
    expect(checkRoundTrip(doc)).toBeNull()
  })

  test('비정형(그리드 부정합·중첩 표)은 opaque 보존', () => {
    for (const bad of [
      '<tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></tbody>',
      '<tbody><tr><td><table></table></td></tr></tbody>',
    ]) {
      const doc = parseWebdeck(TABLE(bad))
      expect(doc.slides[0]!.elements[0]!.type).toBe('opaque')
      expect(checkRoundTrip(doc)).toBeNull()
    }
  })

  test('table이 2개면 opaque', () => {
    const doc = parseWebdeck(WRAP('<div class="el el-table" style="left:0px; top:0px; width:100px; height:50px;"><table><tbody><tr><td>a</td></tr></tbody></table><table><tbody><tr><td>b</td></tr></tbody></table></div>'))
    expect(doc.slides[0]!.elements[0]!.type).toBe('opaque')
  })

  test('일반 table(el-table 클래스 없음)은 기존대로 opaque (회귀)', () => {
    const doc = parseWebdeck(WRAP('<table><tbody><tr><td>x</td></tr></tbody></table>'))
    expect(doc.slides[0]!.elements[0]!.type).toBe('opaque')
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/model/tableRoundtrip.test.ts`. Expected: FAIL

- [ ] **Step 3: parse.ts 수정**

- import에 `parseTableMarkup` 추가
- `extraClassesOf(el, ['el', 'el-text', 'el-image', 'el-shape'])` → `['el', 'el-text', 'el-image', 'el-shape', 'el-table']`
- el-text 분기 **앞**에 추가:

```ts
  if (el.classList.contains('el-table')) {
    const tables = Array.from(el.children).filter((c) => c.tagName === 'TABLE')
    if (tables.length !== 1 || el.children.length !== 1) return opaque()
    const parsed = parseTableMarkup(tables[0]!)
    if (!parsed) return opaque()
    return { type: 'table', id, frame, rotation, extraStyle, extraAttrs, extraClasses, colWidths: parsed.colWidths, rows: parsed.rows }
  }
```

- [ ] **Step 4: serialize.ts 수정**

- import에 `serializeTableInner` 추가
- serializeElement switch에 case 추가:

```ts
    case 'table':
      return `<div class="${escapeAttr(elementClass(el))}" style="${escapeAttr(style)}"${attrs}><table style="border-collapse:collapse; width:100%;">${serializeTableInner(el.colWidths, el.rows)}</table></div>`
```

- `elementClass`의 base 매핑에 `table: 'el el-table'` 추가
- **주의**: KnownElement에 table이 추가되며 exhaustive switch 오류가 나는 다른 파일(ElementView 등)은 이 태스크 범위 밖 — typecheck가 해당 파일에서만 실패하면 보고서에 기록하고 진행(Task 8이 해소). parse/serialize/model 테스트는 전부 통과해야 한다.

- [ ] **Step 5: 통과 확인** — Run: `cd editor && npx vitest run src/model/ && npm run typecheck 2>&1 | head -20`. model 테스트 전부 PASS. typecheck 잔여 오류는 ElementView 계열만 허용(기록)

- [ ] **Step 6: 커밋**

```bash
git add editor/src/model/parse.ts editor/src/model/serialize.ts editor/src/model/tableRoundtrip.test.ts
git commit -m "feat(model): el-table 파서 승격·정준 직렬화 왕복"
```

---

### Task 3: 표 연산 기반 (`model/tableOps.ts` — 그리드·생성·셀)

**Files:**
- Create: `editor/src/model/tableOps.ts`
- Test: `editor/src/model/tableOps.test.ts`

**Interfaces:**
- Consumes: Task 1 타입, 기존 `mapKnownElement`(ops.ts의 헬퍼 — export 안 돼 있으면 export 추가), `Frame`
- Produces (Task 4·5·9·10·11이 사용):
  - `buildGrid(el: TableElement): ({ r: number; c: number } | null)[][]`
  - `newCell(header?: boolean): TableCell` — 기본 외형 내장
  - `createTable(idGen: () => string, rowCount: number, colCount: number, frame: Frame): TableElement`
  - `setCellHtml(doc, slideId, elementId, r, c, html): DeckDoc` — (r,c)는 앵커 좌표
  - `normalizeWidths(widths: number[]): number[]` — 합 100으로 비례 정규화(소수 2자리)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/tableOps.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'
import { addElement } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'
import { buildGrid, createTable, newCell, normalizeWidths, setCellHtml } from './tableOps.ts'
import { gridIsValid } from './tableMarkup.ts'
import type { TableElement } from './types.ts'

export const BASE = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
</main></body></html>`)

export function docWithTable(el: TableElement) {
  const doc = addElement(BASE, BASE.slides[0]!.id, el)
  return { doc, slideId: BASE.slides[0]!.id, id: el.id }
}

/** 병합 픽스처: 3×3, (0,0)에 2×2 병합 앵커 */
export function mergedTable(): TableElement {
  const t = createTable(createIdGen('t'), 3, 3, { left: 0, top: 0, width: 720, height: 120 })
  const anchor = { ...t.rows[0]![0]!, colspan: 2, rowspan: 2, html: '<p>M</p>' }
  return {
    ...t,
    rows: [
      [anchor, t.rows[0]![2]!],
      [t.rows[1]![2]!],
      t.rows[2]!,
    ],
  }
}

describe('createTable·buildGrid', () => {
  test('첫 행은 헤더, 기본 외형 내장, 열 균등', () => {
    const t = createTable(createIdGen('t'), 2, 4, { left: 0, top: 0, width: 720, height: 80 })
    expect(t.rows[0]![0]!.header).toBe(true)
    expect(t.rows[0]![0]!.extraStyle['background']).toBe('var(--wd-accent)')
    expect(t.rows[1]![0]!.header).toBe(false)
    expect(t.rows[1]![0]!.extraStyle['border']).toBe('1px solid #d1d5db')
    expect(t.colWidths).toEqual([25, 25, 25, 25])
    const { doc } = docWithTable(t)
    expect(checkRoundTrip(doc)).toBeNull()
  })

  test('buildGrid는 병합 점유를 앵커 좌표로 전개한다', () => {
    const g = buildGrid(mergedTable())
    expect(g[0]![0]).toEqual({ r: 0, c: 0 })
    expect(g[1]![1]).toEqual({ r: 0, c: 0 })
    expect(g[0]![2]).toEqual({ r: 0, c: 2 })
    expect(g[2]![1]).toEqual({ r: 2, c: 1 })
  })

  test('mergedTable 픽스처는 그리드 정합이다', () => {
    const t = mergedTable()
    expect(gridIsValid(t.colWidths, t.rows)).toBe(true)
  })
})

describe('setCellHtml·normalizeWidths', () => {
  test('앵커 셀 html만 바꾸고 새 문서를 반환한다', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    const out = setCellHtml(doc, slideId, id, 0, 2, '<p>변경</p>')
    expect(out).not.toBe(doc)
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows[0]![1]!.html).toBe('<p>변경</p>')
    expect(el.rows[0]![0]!.html).toBe('<p>M</p>')
  })

  test('normalizeWidths는 합 100으로 비례 정규화한다', () => {
    const w = normalizeWidths([20, 20, 20])
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1)
    expect(w[0]).toBeCloseTo(33.33, 1)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/model/tableOps.test.ts`. Expected: FAIL

- [ ] **Step 3: 구현**

`editor/src/model/tableOps.ts` (mapKnownElement가 ops.ts에서 export 안 돼 있으면 `export`만 추가):

```ts
import { mapKnownElement } from './ops.ts'
import type { DeckDoc, Frame, TableCell, TableElement } from './types.ts'

export const DEFAULT_CELL_BORDER = '1px solid #d1d5db'
export const DEFAULT_CELL_PADDING = '6px 10px'

export function newCell(header = false): TableCell {
  const extraStyle: Record<string, string> = { border: DEFAULT_CELL_BORDER, padding: DEFAULT_CELL_PADDING }
  if (header) extraStyle['background'] = 'var(--wd-accent)'
  return { html: '', colspan: 1, rowspan: 1, header, bg: null, align: null, extraStyle, extraAttrs: {} }
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
```

(`mapTable`·`flattenAnchors`·`rebuildRows`·`cellColOf`는 Task 4·5가 사용하므로 전부 export)

- [ ] **Step 4: 통과 확인** — Run: `cd editor && npx vitest run src/model/tableOps.test.ts src/model/ && npm run typecheck 2>&1 | head -5`

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/tableOps.ts editor/src/model/tableOps.test.ts editor/src/model/ops.ts
git commit -m "feat(model): 표 연산 기반 — 그리드 전개·생성·셀 편집"
```

---

### Task 4: 표 연산 — 행/열 추가·삭제 (스팬 인식)

**Files:**
- Modify: `editor/src/model/tableOps.ts`
- Test: `editor/src/model/tableOps.test.ts` (추가)

**Interfaces:**
- Produces: `insertRow(doc, slideId, elementId, index)`, `removeRow(…, index)`, `insertCol(…, index)`, `removeCol(…, index)` — 전부 DeckDoc 반환, 마지막 행/열 삭제는 같은 doc

- [ ] **Step 1: 실패하는 테스트 작성** (tableOps.test.ts에 추가)

```ts
describe('행/열 추가·삭제 (스팬 인식)', () => {
  test('스팬 내부에 행 삽입 → rowspan 확장, 새 행은 스팬 구간 제외', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    const out = insertRow(doc, slideId, id, 1)  // 2×2 병합(행 0-1) 내부
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows).toHaveLength(4)
    expect(el.rows[0]![0]!.rowspan).toBe(3)
    expect(el.rows[1]).toHaveLength(1)  // 새 행: 병합 구간(열 0-1) 제외, 열 2만
    expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
    expect(checkRoundTrip(out)).toBeNull()
  })

  test('스팬 경계(끝)에 행 삽입 → 확장 없음, 새 행은 전체 열', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    const out = insertRow(doc, slideId, id, 2)
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows[0]![0]!.rowspan).toBe(2)
    expect(el.rows[2]).toHaveLength(3)
    expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
  })

  test('스팬을 가로지르는 행 삭제 → rowspan 축소', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    const out = removeRow(doc, slideId, id, 1)
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows).toHaveLength(2)
    expect(el.rows[0]![0]!.rowspan).toBe(1)
    expect(el.rows[0]![0]!.html).toBe('<p>M</p>')
    expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
  })

  test('스팬 앵커 행 삭제 → 앵커가 다음 행으로 이동(내용 유지)', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    const out = removeRow(doc, slideId, id, 0)
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows).toHaveLength(2)
    const moved = el.rows[0]!.find((c) => c.html === '<p>M</p>')!
    expect(moved.rowspan).toBe(1)
    expect(moved.colspan).toBe(2)
    expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
  })

  test('마지막 행/열 삭제는 no-op (같은 객체)', () => {
    const t = createTable(createIdGen('s'), 1, 1, { left: 0, top: 0, width: 100, height: 40 })
    const { doc, slideId, id } = docWithTable(t)
    expect(removeRow(doc, slideId, id, 0)).toBe(doc)
    expect(removeCol(doc, slideId, id, 0)).toBe(doc)
  })

  test('스팬 내부에 열 삽입 → colspan 확장, colWidths 정규화', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    const out = insertCol(doc, slideId, id, 1)
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.colWidths).toHaveLength(4)
    expect(el.colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1)
    expect(el.rows[0]![0]!.colspan).toBe(3)
    expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
    expect(checkRoundTrip(out)).toBeNull()
  })

  test('스팬 앵커 열 삭제 → 앵커 유지(colspan 축소·내용 유지)', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    const out = removeCol(doc, slideId, id, 0)
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.colWidths).toHaveLength(2)
    const moved = el.rows[0]!.find((c) => c.html === '<p>M</p>')!
    expect(moved.colspan).toBe(1)
    expect(moved.rowspan).toBe(2)
    expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
  })

  test('끝에 행 추가 (index = 행 수)', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    const out = insertRow(doc, slideId, id, 3)
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows).toHaveLength(4)
    expect(el.rows[3]).toHaveLength(3)
    expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
  })
})
```

(import에 `insertCol, insertRow, removeCol, removeRow` 추가)

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/model/tableOps.test.ts`

- [ ] **Step 3: 구현** (tableOps.ts에 추가)

```ts
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
  return mapTable(doc, slideId, elementId, (el) => {
    if (el.rows.length <= 1) return el
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
  return mapTable(doc, slideId, elementId, (el) => {
    if (el.colWidths.length <= 1) return el
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
```

- [ ] **Step 4: 통과 확인** — Run: `cd editor && npx vitest run src/model/tableOps.test.ts && npm test 2>&1 | tail -3`

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/tableOps.ts editor/src/model/tableOps.test.ts
git commit -m "feat(model): 표 행/열 추가·삭제 — 스팬 확장/축소·앵커 이전·무손실"
```

---

### Task 5: 표 연산 — 병합·분할·서식·열 너비

**Files:**
- Modify: `editor/src/model/tableOps.ts`
- Test: `editor/src/model/tableOps.test.ts` (추가)

**Interfaces:**
- Produces: `canMergeCells(el, r1,c1,r2,c2): boolean`, `mergeCells(doc,…,r1,c1,r2,c2)`, `splitCell(doc,…,r,c)`, `setCellsStyle(doc,…,r1,c1,r2,c2, patch: { bg?: string | null; align?: CellAlign | null })`, `toggleHeaderCells(doc,…,r1,c1,r2,c2)`, `setColWidths(doc,…,widths: number[])` — 좌표는 정규화 전 임의 순서 허용(내부 정규화)

- [ ] **Step 1: 실패하는 테스트 작성** (tableOps.test.ts에 추가)

```ts
describe('병합·분할·서식', () => {
  test('canMergeCells — 부분 겹침 거부·단일 셀 거부·완전 포함 허용', () => {
    const t = mergedTable()
    expect(canMergeCells(t, 0, 0, 1, 1)).toBe(false)  // 이미 병합 그 자체(단일 앵커)
    expect(canMergeCells(t, 0, 0, 0, 2)).toBe(false)  // 2×2 병합과 부분 겹침
    expect(canMergeCells(t, 0, 0, 2, 2)).toBe(true)   // 전체 — 완전 포함
    expect(canMergeCells(t, 2, 0, 2, 2)).toBe(true)   // 마지막 행 3칸
    expect(canMergeCells(t, 2, 1, 2, 1)).toBe(false)  // 단일 셀
  })

  test('mergeCells — 내용을 행 우선으로 연결(무손실), 좌표 역순 입력 허용', () => {
    const t = createTable(createIdGen('m'), 2, 2, { left: 0, top: 0, width: 400, height: 80 })
    const withContent: TableElement = {
      ...t,
      rows: t.rows.map((row, r) => row.map((cell, c) => ({ ...cell, html: `<p>${r}${c}</p>` }))),
    }
    const { doc, slideId, id } = docWithTable(withContent)
    const out = mergeCells(doc, slideId, id, 1, 1, 0, 0)
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows[0]).toHaveLength(1)
    expect(el.rows[0]![0]!.html).toBe('<p>00</p><p>01</p><p>10</p><p>11</p>')
    expect(el.rows[0]![0]!.colspan).toBe(2)
    expect(el.rows[0]![0]!.rowspan).toBe(2)
    expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
    expect(checkRoundTrip(out)).toBeNull()
  })

  test('canMerge=false면 mergeCells는 같은 객체를 반환한다', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    expect(mergeCells(doc, slideId, id, 0, 0, 0, 2)).toBe(doc)
  })

  test('splitCell — 스팬 1로 되돌리고 빈 셀 채움(내용은 앵커 잔류)', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    const out = splitCell(doc, slideId, id, 0, 0)
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows[0]).toHaveLength(3)
    expect(el.rows[0]![0]!.html).toBe('<p>M</p>')
    expect(el.rows[0]![0]!.colspan).toBe(1)
    expect(el.rows[1]).toHaveLength(3)
    expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
  })

  test('setCellsStyle — 범위 내 앵커 전부, bg null은 제거', () => {
    const t = createTable(createIdGen('s'), 2, 2, { left: 0, top: 0, width: 400, height: 80 })
    const { doc, slideId, id } = docWithTable(t)
    const out = setCellsStyle(doc, slideId, id, 0, 0, 1, 1, { bg: '#fee2e2', align: 'center' })
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows[1]![1]!.bg).toBe('#fee2e2')
    expect(el.rows[0]![0]!.align).toBe('center')
    const cleared = setCellsStyle(out, slideId, id, 0, 0, 0, 0, { bg: null }).slides[0]!.elements[0]! as TableElement
    expect(cleared.rows[0]![0]!.bg).toBeNull()
  })

  test('toggleHeaderCells — 전부 th면 td로, 아니면 th로', () => {
    const t = createTable(createIdGen('h'), 2, 2, { left: 0, top: 0, width: 400, height: 80 })
    const { doc, slideId, id } = docWithTable(t)
    const on = toggleHeaderCells(doc, slideId, id, 1, 0, 1, 1)
    expect((on.slides[0]!.elements[0]! as TableElement).rows[1]![0]!.header).toBe(true)
    const off = toggleHeaderCells(on, slideId, id, 1, 0, 1, 1)
    expect((off.slides[0]!.elements[0]! as TableElement).rows[1]![0]!.header).toBe(false)
  })

  test('setColWidths는 그대로 반영한다', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    const el = setColWidths(doc, slideId, id, [20, 30, 50]).slides[0]!.elements[0]! as TableElement
    expect(el.colWidths).toEqual([20, 30, 50])
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/model/tableOps.test.ts`

- [ ] **Step 3: 구현** (tableOps.ts에 추가)

```ts
function normRect(r1: number, c1: number, r2: number, c2: number) {
  return { top: Math.min(r1, r2), left: Math.min(c1, c2), bottom: Math.max(r1, r2), right: Math.max(c1, c2) }
}

export function canMergeCells(el: TableElement, r1: number, c1: number, r2: number, c2: number): boolean {
  const { top, left, bottom, right } = normRect(r1, c1, r2, c2)
  if (top === bottom && left === right) return false
  const grid = buildGrid(el)
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
    const cell = flattenAnchors(el).find((a) => a.r === ar && a.c === ac)!.cell
    if (ar < top || ac < left || ar + cell.rowspan - 1 > bottom || ac + cell.colspan - 1 > right) return false
  }
  if (anchorsInRect.size < 2) return false
  return true
}

export function mergeCells(doc: DeckDoc, slideId: string, elementId: string, r1: number, c1: number, r2: number, c2: number): DeckDoc {
  return mapTable(doc, slideId, elementId, (el) => {
    if (!canMergeCells(el, r1, c1, r2, c2)) return el
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
  return mapTable(doc, slideId, elementId, (el) => {
    const anchors = flattenAnchors(el)
    const target = anchors.find((a) => a.r === r && a.c === c)
    if (!target || (target.cell.colspan === 1 && target.cell.rowspan === 1)) return el
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
  patch: { bg?: string | null; align?: import('./types.ts').CellAlign | null },
): DeckDoc {
  return mapTable(doc, slideId, elementId, (el) => {
    const { top, left, bottom, right } = normRect(r1, c1, r2, c2)
    const anchors = flattenAnchors(el).map((a) => {
      if (a.r < top || a.r > bottom || a.c < left || a.c > right) return a
      return { ...a, cell: { ...a.cell, ...(patch.bg !== undefined ? { bg: patch.bg } : {}), ...(patch.align !== undefined ? { align: patch.align } : {}) } }
    })
    return { ...el, rows: rebuildRows(el.rows.length, anchors) }
  })
}

export function toggleHeaderCells(doc: DeckDoc, slideId: string, elementId: string, r1: number, c1: number, r2: number, c2: number): DeckDoc {
  return mapTable(doc, slideId, elementId, (el) => {
    const { top, left, bottom, right } = normRect(r1, c1, r2, c2)
    const inRect = (a: { r: number; c: number }) => a.r >= top && a.r <= bottom && a.c >= left && a.c <= right
    const anchors = flattenAnchors(el)
    const allHeader = anchors.filter(inRect).every((a) => a.cell.header)
    return { ...el, rows: rebuildRows(el.rows.length, anchors.map((a) => (inRect(a) ? { ...a, cell: { ...a.cell, header: !allHeader } } : a))) }
  })
}

export function setColWidths(doc: DeckDoc, slideId: string, elementId: string, widths: number[]): DeckDoc {
  return mapTable(doc, slideId, elementId, (el) => (widths.length === el.colWidths.length ? { ...el, colWidths: widths } : el))
}
```

- [ ] **Step 4: 통과 확인** — Run: `cd editor && npx vitest run src/model/tableOps.test.ts && npm test 2>&1 | tail -3`

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/tableOps.ts editor/src/model/tableOps.test.ts
git commit -m "feat(model): 표 병합/분할/서식/헤더/열 너비 — 무손실·부분 겹침 거부"
```

---

### Task 6: opaque 표 변환

**Files:**
- Modify: `editor/src/model/tableOps.ts`
- Test: `editor/src/model/tableOps.test.ts` (추가)

**Interfaces:**
- Produces: `tableFromOpaqueHtml(idGen, html): TableElement | null`, `convertibleOpaqueTableCount(slide): number`, `convertOpaqueTables(doc, slideId, idGen): DeckDoc`(변환 없으면 같은 doc)

- [ ] **Step 1: 실패하는 테스트 작성** (tableOps.test.ts에 추가)

```ts
describe('opaque 표 변환', () => {
  const OPAQUE_WRAPPED = '<div class="el" style="left:96px; top:200px; width:600px; height:200px;"><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table></div>'
  const OPAQUE_BARE = '<table><tbody><tr><td colspan="2">x</td></tr><tr><td>a</td><td>b</td></tr></tbody></table>'
  const OPAQUE_BAD = '<div class="fancy">위젯</div>'

  test('래퍼 frame이 있으면 사용, 정형 파싱 성공 시 TableElement', () => {
    const t = tableFromOpaqueHtml(createIdGen('v'), OPAQUE_WRAPPED)!
    expect(t.frame).toEqual({ left: 96, top: 200, width: 600, height: 200 })
    expect(t.rows[0]).toHaveLength(2)
  })

  test('맨몸 table은 기본 frame(96,200,1088,320)', () => {
    const t = tableFromOpaqueHtml(createIdGen('v'), OPAQUE_BARE)!
    expect(t.frame).toEqual({ left: 96, top: 200, width: 1088, height: 320 })
    expect(t.rows[0]![0]!.colspan).toBe(2)
  })

  test('표가 아니면 null', () => {
    expect(tableFromOpaqueHtml(createIdGen('v'), OPAQUE_BAD)).toBeNull()
  })

  test('convertOpaqueTables — 변환 가능한 것만 교체(인덱스 유지), 없으면 같은 doc', () => {
    const doc = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">${OPAQUE_BAD}${OPAQUE_WRAPPED}</section>
</main></body></html>`)
    expect(convertibleOpaqueTableCount(doc.slides[0]!)).toBe(1)
    const out = convertOpaqueTables(doc, doc.slides[0]!.id, createIdGen('c'))
    expect(out.slides[0]!.elements[0]!.type).toBe('opaque')
    expect(out.slides[0]!.elements[1]!.type).toBe('table')
    expect(checkRoundTrip(out)).toBeNull()
    expect(convertOpaqueTables(out, out.slides[0]!.id, createIdGen('c'))).toBe(out)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/model/tableOps.test.ts`

- [ ] **Step 3: 구현** (tableOps.ts에 추가 — import에 `parseTableMarkup`(tableMarkup.ts), `parseInlineStyle`(style.ts), `Slide` 타입 추가)

```ts
const FALLBACK_FRAME: Frame = { left: 96, top: 200, width: 1088, height: 320 }

/** opaque 원문에서 표 추출 — 단일 table(±1겹 래퍼)만, 정형이 아니면 null (스펙 §3) */
export function tableFromOpaqueHtml(idGen: () => string, html: string): TableElement | null {
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const roots = Array.from(dom.body.children)
  if (roots.length !== 1) return null
  const root = roots[0]!
  let tableEl: Element | null = null
  let frame = FALLBACK_FRAME
  if (root.tagName === 'TABLE') {
    tableEl = root
  } else if (root.children.length === 1 && root.children[0]!.tagName === 'TABLE') {
    tableEl = root.children[0]!
    const style = parseInlineStyle(root.getAttribute('style') ?? '')
    const nums = ['left', 'top', 'width', 'height'].map((p) => {
      const v = style[p]
      return v !== undefined && /^-?\d+(\.\d+)?px$/.test(v) ? parseFloat(v) : NaN
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

const probeGen = () => 'probe'

export function convertibleOpaqueTableCount(slide: Slide): number {
  return slide.elements.filter((e) => e.type === 'opaque' && tableFromOpaqueHtml(probeGen, e.html) !== null).length
}

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
```

- [ ] **Step 4: 통과 확인** — Run: `cd editor && npx vitest run src/model/tableOps.test.ts && npm run typecheck 2>&1 | head -5`

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/tableOps.ts editor/src/model/tableOps.test.ts
git commit -m "feat(model): opaque 표 → el-table 변환"
```

---

### Task 7: 검증기 + AI 가이드

**Files:**
- Modify: `tools/lib/validate.mjs`, `docs/ai-guide.md`
- Test: `tools/lib/validate.test.mjs` (추가)

- [ ] **Step 1: 실패하는 테스트 작성** (validate.test.mjs에 추가, 기존 관례 재사용)

```js
test('el-table — 정형은 통과, 부정합·중첩·비셀 자식은 오류', () => {
  const wrap = (el) => `<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">${el}</section></main></body></html>`
  const T = (inner) => wrap(`<div class="el el-table" style="left:0px; top:0px; width:400px; height:100px;"><table>${inner}</table></div>`)
  const ok = validateWebdeck(T('<tbody><tr><th colspan="2">H</th></tr><tr><td>a</td><td>b</td></tr></tbody>'))
  assert.deepStrictEqual(ok.errors, [])
  const mismatch = validateWebdeck(T('<tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></tbody>'))
  assert.ok(mismatch.errors.some((e) => e.includes('el-table')))
  const nested = validateWebdeck(T('<tbody><tr><td><table></table></td></tr></tbody>'))
  assert.ok(nested.errors.some((e) => e.includes('el-table')))
  const noTable = validateWebdeck(wrap('<div class="el el-table" style="left:0px; top:0px; width:400px; height:100px;"></div>'))
  assert.ok(noTable.errors.some((e) => e.includes('el-table')))
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` (루트). Expected: 신규 FAIL — el-table은 현재 타입 클래스 미인식(`타입 클래스가 없습니다` 오류가 나며 신규 단언과 불일치)

- [ ] **Step 3: 구현**

`tools/lib/validate.mjs`:

- `ELEMENT_TYPES`에 `'el-table'` 추가
- validateSlide의 요소 루프에 el-table 분기 추가 (el-shape 분기와 나란히):

```js
    if (type === 'el-table') {
      const tables = el.childNodes.filter((n) => n.nodeType === 1)
      if (tables.length !== 1 || tables[0].rawTagName.toLowerCase() !== 'table') {
        errors.push(`${label}: el-table에는 <table>이 정확히 1개 있어야 합니다`)
      } else if (!isWellFormedTable(tables[0])) {
        errors.push(`${label}: el-table의 표 구조가 정형이 아닙니다 (td/th만, 스팬 양의 정수, 행별 그리드 정합)`)
      }
    }
```

- 파일 하단에 헬퍼 추가 (에디터 gridIsValid와 동일 알고리즘의 mjs 판):

```js
function isWellFormedTable(table) {
  const trs = []
  const collect = (node) => {
    for (const child of node.childNodes.filter((n) => n.nodeType === 1)) {
      const tag = child.rawTagName.toLowerCase()
      if (tag === 'tr') trs.push(child)
      else if (tag === 'thead' || tag === 'tbody') collect(child)
      else if (tag !== 'colgroup') return false
    }
    return true
  }
  if (!collect(table) || trs.length === 0) return false
  const rows = []
  for (const tr of trs) {
    const cells = []
    for (const cellEl of tr.childNodes.filter((n) => n.nodeType === 1)) {
      const tag = cellEl.rawTagName.toLowerCase()
      if (tag !== 'td' && tag !== 'th') return false
      if (cellEl.querySelector('table')) return false
      const colspan = Number(cellEl.getAttribute('colspan') ?? '1')
      const rowspan = Number(cellEl.getAttribute('rowspan') ?? '1')
      if (!Number.isInteger(colspan) || !Number.isInteger(rowspan) || colspan < 1 || rowspan < 1) return false
      cells.push({ colspan, rowspan })
    }
    rows.push(cells)
  }
  const cols = rows[0].reduce((n, c) => n + c.colspan, 0)
  const occupied = rows.map(() => Array(cols).fill(false))
  for (let r = 0; r < rows.length; r++) {
    let c = 0
    for (const cell of rows[r]) {
      while (c < cols && occupied[r][c]) c++
      if (c >= cols || c + cell.colspan > cols || r + cell.rowspan > rows.length) return false
      for (let rr = r; rr < r + cell.rowspan; rr++) {
        for (let cc = c; cc < c + cell.colspan; cc++) {
          if (occupied[rr][cc]) return false
          occupied[rr][cc] = true
        }
      }
      c += cell.colspan
    }
  }
  return occupied.every((row) => row.every(Boolean))
}
```

- 주의: 기존 좌표(REQUIRED_STYLE_PROPS) 검사는 el-table에도 그대로 적용됨(el 공통) — 변경 불필요. `el-shape는 data-shape…` 검사에 el-table이 걸리지 않는지 확인

- [ ] **Step 4: ai-guide 갱신**

`docs/ai-guide.md` "요소 레시피"의 도형 변형·회전 블록 뒤에 추가:

```markdown
**표 (v1.1)** — `el-table` 안에 `<table>` 1개. 셀은 td/th만, 병합은 colspan/rowspan. **정형(행별 스팬 합 = 열 수)이 아니면 편집 불가(opaque)로 보존만 된다.** 열 너비는 colgroup의 %:

```html
<div class="el el-table" style="left:96px; top:200px; width:720px; height:160px;">
  <table>
    <colgroup><col style="width:40%"><col style="width:30%"><col style="width:30%"></colgroup>
    <tbody>
      <tr><th colspan="3" style="border:1px solid #d1d5db; padding:6px 10px; background:var(--wd-accent);"><p>분기 실적</p></th></tr>
      <tr><td style="border:1px solid #d1d5db; padding:6px 10px;"><p>항목</p></td><td style="border:1px solid #d1d5db; padding:6px 10px;"><p>1Q</p></td><td style="border:1px solid #d1d5db; padding:6px 10px;"><p>2Q</p></td></tr>
    </tbody>
  </table>
</div>
```
```

그리고 "필수 규칙" 목록 끝에 추가:

```markdown
15. `el-table`에는 `<table>` 정확히 1개, 셀은 td/th만, 스팬은 양의 정수, 행별 그리드 정합 (오류)
```

- [ ] **Step 5: 통과 확인** — Run: `npm test`. Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add tools/lib/validate.mjs tools/lib/validate.test.mjs docs/ai-guide.md
git commit -m "feat(tools): el-table 정형 검증·AI 가이드 표 레시피"
```

---

### Task 8: 표 렌더 (`canvas/TableView.tsx` + ElementView 통합)

**Files:**
- Create: `editor/src/canvas/TableView.tsx`
- Modify: `editor/src/canvas/ElementView.tsx` (case 'table')
- Modify: `editor/src/app.css`
- Test: `editor/src/canvas/TableView.test.tsx`

**Interfaces:**
- Consumes: Task 1~3 모델, `styleFromModel`, `cssTextToReact`(styleFromModel.ts), `TextEditable`
- Produces (Task 10이 사용):

```ts
export interface TableInteraction {
  selectedRange: { r1: number; c1: number; r2: number; c2: number } | null
  editingCell: { r: number; c: number } | null
  onCellPointerDown: (e: ReactPointerEvent, r: number, c: number) => void
  onCellPointerEnter: (r: number, c: number) => void
  onCellDoubleClick: (r: number, c: number) => void
  onCellCommit: (r: number, c: number, html: string) => void
  onCellTab: (r: number, c: number, backward: boolean) => void
  onColBorderPointerDown: (e: ReactPointerEvent, leftCol: number) => void
}
```

`TableView({ element, interaction, table }: { element: TableElement; interaction?: …기존 핸들러; table?: TableInteraction })`. ElementInteraction에 `table?: TableInteraction` 필드 추가, SlideInteraction에 `tableFor?: (id: string) => TableInteraction | undefined` 추가(SlideView가 각 요소에 전달).

**동작 계약:** ① 앵커 좌표는 그리드 좌표 — td에 `data-r`/`data-c` ② 셀은 table 인터랙션이 있을 때만 셀 핸들러(없으면 요소 수준 핸들러만 — 미선택 표 클릭은 요소 선택/이동) ③ editingCell의 셀은 TextEditable로 교체, Tab/Shift+Tab keydown에서 `e.preventDefault()` 후 blur→`onCellTab` ④ selectedRange 안 셀에 `cell-selected` 클래스 ⑤ 열 경계 핸들은 table 인터랙션이 있을 때 colWidths 누적 위치에 렌더

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/TableView.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createIdGen } from '../model/id.ts'
import { createTable, setCellHtml } from '../model/tableOps.ts'
import { addElement } from '../model/ops.ts'
import { parseWebdeck } from '../model/parse.ts'
import { ElementView } from './ElementView.tsx'
import type { TableInteraction } from './TableView.tsx'

function makeTable() {
  return createTable(createIdGen('t'), 2, 2, { left: 0, top: 0, width: 400, height: 80 })
}

function tableInteraction(over: Partial<TableInteraction> = {}): TableInteraction {
  return {
    selectedRange: null, editingCell: null,
    onCellPointerDown: vi.fn(), onCellPointerEnter: vi.fn(), onCellDoubleClick: vi.fn(),
    onCellCommit: vi.fn(), onCellTab: vi.fn(), onColBorderPointerDown: vi.fn(),
    ...over,
  }
}

test('표를 colgroup·th/td로 렌더한다', () => {
  const { container } = render(<ElementView element={makeTable()} />)
  expect(container.querySelectorAll('col')).toHaveLength(2)
  expect(container.querySelectorAll('th')).toHaveLength(2)
  expect(container.querySelectorAll('td')).toHaveLength(2)
})

test('셀 더블클릭·범위 하이라이트·data 좌표', () => {
  const t = makeTable()
  const ti = tableInteraction({ selectedRange: { r1: 0, c1: 0, r2: 1, c2: 0 } })
  const { container } = render(
    <ElementView element={t} interaction={{ selected: true, editing: false, onPointerDown: vi.fn(), onDoubleClick: vi.fn(), onTextCommit: vi.fn(), table: ti }} />,
  )
  const cell = container.querySelector('[data-r="1"][data-c="0"]')!
  fireEvent.doubleClick(cell)
  expect(ti.onCellDoubleClick).toHaveBeenCalledWith(1, 0)
  expect(cell.classList.contains('cell-selected')).toBe(true)
  expect(container.querySelector('[data-r="1"][data-c="1"]')!.classList.contains('cell-selected')).toBe(false)
})

test('editingCell은 TextEditable로 렌더되고 Tab이 onCellTab을 부른다', () => {
  const t = makeTable()
  const ti = tableInteraction({ editingCell: { r: 0, c: 0 } })
  const { container } = render(
    <ElementView element={t} interaction={{ selected: true, editing: false, onPointerDown: vi.fn(), onDoubleClick: vi.fn(), onTextCommit: vi.fn(), table: ti }} />,
  )
  const editable = container.querySelector('[contenteditable]')!
  fireEvent.keyDown(editable, { key: 'Tab' })
  expect(ti.onCellTab).toHaveBeenCalledWith(0, 0, false)
})

test('열 경계 핸들이 열 수-1개 렌더된다 (table 인터랙션 존재 시)', () => {
  const t = makeTable()
  const { container } = render(
    <ElementView element={t} interaction={{ selected: true, editing: false, onPointerDown: vi.fn(), onDoubleClick: vi.fn(), onTextCommit: vi.fn(), table: tableInteraction() }} />,
  )
  expect(container.querySelectorAll('.col-resize-handle')).toHaveLength(1)
})

test('table 인터랙션이 없으면 셀 핸들러 없이 렌더 (읽기 전용·썸네일)', () => {
  const { container } = render(<ElementView element={makeTable()} />)
  expect(container.querySelector('.col-resize-handle')).toBeNull()
})

test('셀 html이 렌더된다', () => {
  const base = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720"><section class="slide"></section></main></body></html>`)
  const t = makeTable()
  const doc = setCellHtml(addElement(base, base.slides[0]!.id, t), base.slides[0]!.id, t.id, 1, 1, '<p>내용</p>')
  const el = doc.slides[0]!.elements[0]!
  const { getByText } = render(<ElementView element={el} />)
  expect(getByText('내용')).toBeTruthy()
})
```

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/canvas/TableView.test.tsx`

- [ ] **Step 3: 구현**

`editor/src/canvas/TableView.tsx`:

```tsx
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { buildGrid } from '../model/tableOps.ts'
import type { TableCell, TableElement } from '../model/types.ts'
import { styleFromModel, cssTextToReact } from './styleFromModel.ts'
import { TextEditable } from './TextEditable.tsx'
import { serializeInlineStyle } from '../model/style.ts'

export interface TableInteraction {
  selectedRange: { r1: number; c1: number; r2: number; c2: number } | null
  editingCell: { r: number; c: number } | null
  onCellPointerDown: (e: ReactPointerEvent, r: number, c: number) => void
  onCellPointerEnter: (r: number, c: number) => void
  onCellDoubleClick: (r: number, c: number) => void
  onCellCommit: (r: number, c: number, html: string) => void
  onCellTab: (r: number, c: number, backward: boolean) => void
  onColBorderPointerDown: (e: ReactPointerEvent, leftCol: number) => void
}

function cellStyle(cell: TableCell) {
  return cssTextToReact(
    serializeInlineStyle({
      ...cell.extraStyle,
      ...(cell.bg !== null ? { background: cell.bg } : {}),
      ...(cell.align !== null ? { 'text-align': cell.align } : {}),
    }),
  )
}

function inRange(range: TableInteraction['selectedRange'], r: number, c: number, span: { rowspan: number; colspan: number }): boolean {
  if (!range) return false
  const top = Math.min(range.r1, range.r2)
  const bottom = Math.max(range.r1, range.r2)
  const left = Math.min(range.c1, range.c2)
  const right = Math.max(range.c1, range.c2)
  return r <= bottom && r + span.rowspan - 1 >= top && c <= right && c + span.colspan - 1 >= left
}

export function TableView({
  element,
  elementHandlers,
  table,
}: {
  element: TableElement
  elementHandlers?: { onPointerDown?: (e: ReactPointerEvent) => void; onDoubleClick?: () => void }
  table?: TableInteraction
}) {
  const grid = buildGrid(element)
  const anchorCols: number[][] = element.rows.map((row, r) => {
    const cols: number[] = []
    for (let c = 0; c < element.colWidths.length; c++) {
      const a = grid[r]?.[c]
      if (a && a.r === r && a.c === c) cols.push(c)
    }
    return cols
  })
  // 열 경계 누적 % (마지막 경계 제외)
  const boundaries: number[] = []
  let acc = 0
  for (let i = 0; i < element.colWidths.length - 1; i++) {
    acc += element.colWidths[i]!
    boundaries.push(acc)
  }
  return (
    <div className="el el-table" style={styleFromModel(element.frame, element.extraStyle, element.rotation)} {...(elementHandlers ?? {})}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <colgroup>
          {element.colWidths.map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <tbody>
          {element.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => {
                const c = anchorCols[r]![i]!
                const Tag = cell.header ? 'th' : 'td'
                const editing = table?.editingCell?.r === r && table.editingCell.c === c
                const selected = table ? inRange(table.selectedRange, r, c, cell) : false
                return (
                  <Tag
                    key={`${r}-${c}`}
                    data-r={r}
                    data-c={c}
                    colSpan={cell.colspan > 1 ? cell.colspan : undefined}
                    rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined}
                    className={selected ? 'cell-selected' : undefined}
                    style={cellStyle(cell)}
                    onPointerDown={table ? (e) => table.onCellPointerDown(e, r, c) : undefined}
                    onPointerEnter={table ? () => table.onCellPointerEnter(r, c) : undefined}
                    onDoubleClick={table ? (e) => { e.stopPropagation(); table.onCellDoubleClick(r, c) } : undefined}
                    onKeyDown={
                      editing
                        ? (e: ReactKeyboardEvent) => {
                            if (e.key === 'Tab') {
                              e.preventDefault()
                              ;(e.target as HTMLElement).blur()
                              table!.onCellTab(r, c, e.shiftKey)
                            }
                          }
                        : undefined
                    }
                  >
                    {editing ? (
                      <TextEditable html={cell.html} onCommit={(html) => table!.onCellCommit(r, c, html)} />
                    ) : (
                      <div dangerouslySetInnerHTML={{ __html: cell.html }} />
                    )}
                  </Tag>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {table &&
        boundaries.map((pct, i) => (
          <div
            key={i}
            className="col-resize-handle"
            style={{ left: `${pct}%` }}
            onPointerDown={(e) => table.onColBorderPointerDown(e, i)}
          />
        ))}
    </div>
  )
}
```

`editor/src/canvas/ElementView.tsx`:

- `ElementInteraction`에 `table?: TableInteraction` 추가 (import type from './TableView.tsx')
- switch에 case 추가 (shape 앞):

```tsx
    case 'table':
      return <TableView element={element} elementHandlers={handlers} table={interaction?.table} />
```

`editor/src/canvas/SlideView.tsx` — `SlideInteraction`에 `tableFor?: (id: string) => TableInteraction | undefined` 추가, ElementView interaction 객체에 `table: interaction.tableFor?.(el.id)` 추가.

`editor/src/app.css` 끝에 추가:

```css
/* 표 편집 */
.el-table table { table-layout: fixed; }
.el-table th, .el-table td { overflow-wrap: break-word; vertical-align: top; }
.cell-selected { outline: 2px solid var(--wd-primary, #1a56db); outline-offset: -2px; }
.col-resize-handle { position: absolute; top: 0; bottom: 0; width: 7px; margin-left: -3px; cursor: col-resize; z-index: 5; }
.col-resize-handle:hover { background: rgba(26, 86, 219, 0.25); }
```

- [ ] **Step 4: 통과 확인** — Run: `cd editor && npm test && npm run typecheck`. Task 1~2에서 기록된 exhaustive switch 오류가 이 시점에 전부 해소돼야 한다(ElementView·기타). 남은 오류가 있으면 해당 switch에 table case를 최소로 보강(로직 발명 금지 — 기존 known 처리와 동일 취급)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/canvas/ editor/src/app.css
git commit -m "feat(editor): 표 렌더 — TableView·셀 인터랙션 표면·열 경계 핸들"
```

---

### Task 9: 툴바 표 삽입 (8×8 그리드 피커)

**Files:**
- Modify: `editor/src/panels/Toolbar.tsx`, `editor/src/app.css`
- Test: `editor/src/panels/Toolbar.test.tsx` (추가)

**Interfaces:**
- Consumes: `createTable`(tableOps)

- [ ] **Step 1: 실패하는 테스트 작성** (Toolbar.test.tsx에 추가, 기존 렌더 헬퍼 재사용)

```tsx
test('표 버튼은 8×8 그리드 피커를 열고 hover 라벨을 보여준다', () => {
  const { getByRole, container } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '표' }))
  const cells = container.querySelectorAll('.table-picker-cell')
  expect(cells).toHaveLength(64)
  fireEvent.pointerEnter(cells[10]!)  // r=1, c=2 → 2×3
  expect(getByRole('dialog', { name: '표 크기 선택' }).textContent).toContain('2 × 3')
})

test('그리드 클릭은 해당 크기 표를 1 APPLY_DOC으로 삽입한다', () => {
  const { dispatch, getByRole, container } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '표' }))
  fireEvent.click(container.querySelectorAll('.table-picker-cell')[9]!)  // r=1,c=1 → 2×2
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const doc = applies[0]![0].doc as DeckDoc
  const added = doc.slides[0]!.elements.at(-1)!
  expect(added.type).toBe('table')
  if (added.type !== 'table') return
  expect(added.rows).toHaveLength(2)
  expect(added.colWidths).toHaveLength(2)
  expect(added.frame.height).toBe(80)
})
```

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/panels/Toolbar.test.tsx`

- [ ] **Step 3: 구현** (Toolbar.tsx — 도형 팝오버와 같은 관례)

상태·핸들러:

```tsx
  const [tableOpen, setTableOpen] = useState(false)
  const [tableHover, setTableHover] = useState<[number, number] | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  // 외부 클릭 닫힘 useEffect — shapeOpen 패턴과 동일 (tableOpen/tableRef)

  const insertTable = (rows: number, cols: number) => {
    if (!doc || !slide) return
    const el = createTable(idGen, rows, cols, { left: 280, top: 200, width: 720, height: 40 * rows })
    dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
  }
```

마크업 (도형 팝오버 다음):

```tsx
        <div className="layout-popover-root" ref={tableRef}>
          <button type="button" disabled={!hasDoc} onClick={() => setTableOpen((o) => !o)}>표</button>
          {tableOpen && (
            <div className="layout-popover table-picker" role="dialog" aria-label="표 크기 선택">
              <div className="table-picker-grid" onPointerLeave={() => setTableHover(null)}>
                {Array.from({ length: 64 }, (_, i) => {
                  const r = Math.floor(i / 8)
                  const c = i % 8
                  const active = tableHover !== null && r <= tableHover[0] && c <= tableHover[1]
                  return (
                    <button
                      key={i}
                      type="button"
                      className={active ? 'table-picker-cell active' : 'table-picker-cell'}
                      aria-label={`${r + 1} × ${c + 1} 표`}
                      onPointerEnter={() => setTableHover([r, c])}
                      onClick={() => {
                        setTableOpen(false)
                        setTableHover(null)
                        insertTable(r + 1, c + 1)
                      }}
                    />
                  )
                })}
              </div>
              <div className="table-picker-label">
                {tableHover ? `${tableHover[0] + 1} × ${tableHover[1] + 1}` : '크기 선택'}
              </div>
            </div>
          )}
        </div>
```

(`insertTable`의 doc/slide 접근은 파일의 기존 관례를 따를 것)

`editor/src/app.css`:

```css
.table-picker { width: 184px; }
.table-picker-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; }
.table-picker-cell { width: 18px; height: 18px; padding: 0; border: 1px solid #d1d5db; border-radius: 2px; background: #fff; cursor: pointer; }
.table-picker-cell.active { background: var(--wd-accent, #e8f0fe); border-color: var(--wd-primary, #1a56db); }
.table-picker-label { margin-top: 6px; font-size: 12px; color: #6b7280; text-align: center; }
```

- [ ] **Step 4: 통과 확인** — Run: `cd editor && npm test && npm run typecheck`

- [ ] **Step 5: 커밋**

```bash
git add editor/src/panels/Toolbar.tsx editor/src/panels/Toolbar.test.tsx editor/src/app.css
git commit -m "feat(editor): 표 삽입 8×8 그리드 피커"
```

---

### Task 10: 셀 선택·편집 인터랙션 (App·CanvasArea)

**Files:**
- Modify: `editor/src/App.tsx` (tableSel 상태), `editor/src/canvas/CanvasArea.tsx` (표 인터랙션·열 너비 제스처)
- Test: `editor/src/canvas/CanvasArea.test.tsx` (추가)

**Interfaces:**
- Consumes: Task 5 `setColWidths`·`insertRow`, Task 3 `setCellHtml`·`buildGrid`·`flattenAnchors`, Task 8 `TableInteraction`
- Produces (Task 11이 사용): `export interface TableSel { elementId: string; anchor: [number, number]; extent: [number, number] }` (App.tsx에서 export), `CanvasAreaProps`에 `tableSel: TableSel | null`, `setTableSel: (s: TableSel | null) => void` 추가, `PropertiesPanel`에 `tableSel` prop 추가(Task 11에서 소비 — 이 태스크에서는 전달만)

**동작 계약:** ① 선택된 표 요소에만 tableFor가 TableInteraction 반환 ② 셀 pointerdown = stopPropagation + anchor/extent 설정 + 드래그 중 pointerenter로 extent 갱신(pointerup 종료) ③ Shift+pointerdown = anchor 유지 extent만 ④ 더블클릭 = editingCell(App 로컬 아님 — CanvasArea 로컬) + `START_TEXT_EDIT`(요소 id — 단축키 억제) ⑤ 커밋: html 변경 시 1 APPLY_DOC + `END_TEXT_EDIT` ⑥ Tab: 커밋 후 그리드 순서 다음/이전 앵커로 편집 이동, 마지막 앵커 Tab = insertRow(끝) 1 APPLY_DOC 후 새 행 첫 앵커 편집 ⑦ 열 경계 드래그: 이웃 두 열 % 재배분(각 최소 5%), 미리보기 gesture, pointerup 1 APPLY_DOC ⑧ 요소 선택 변경·슬라이드 변경 시 tableSel/editingCell 초기화(App useEffect + CanvasArea useEffect)

- [ ] **Step 1: 실패하는 테스트 작성** (CanvasArea.test.tsx에 추가 — 기존 렌더 헬퍼 관례로 표 1개 문서 픽스처 구성. 표 요소가 선택된 상태 렌더 헬퍼 `renderCanvasWithTable()`을 만들 것: 2×2 createTable 문서 + selectedIds=[표 id] + tableSel/setTableSel mock)

```tsx
test('선택된 표의 셀 클릭은 tableSel을 설정한다', () => {
  const { setTableSel, container } = renderCanvasWithTable()
  fireEvent.pointerDown(container.querySelector('[data-r="1"][data-c="0"]')!)
  expect(setTableSel).toHaveBeenCalledWith(expect.objectContaining({ anchor: [1, 0], extent: [1, 0] }))
})

test('셀 더블클릭 → 편집 → blur 커밋이 1 APPLY_DOC + END_TEXT_EDIT', () => {
  const { dispatch, container } = renderCanvasWithTable()
  const cell = container.querySelector('[data-r="0"][data-c="0"]')!
  fireEvent.doubleClick(cell)
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'START_TEXT_EDIT' }))
  const editable = container.querySelector('[contenteditable]')!
  editable.innerHTML = '<p>새 내용</p>'
  fireEvent.blur(editable)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const el = (applies[0]![0].doc as DeckDoc).slides[0]!.elements[0]!
  if (el.type !== 'table') return
  expect(el.rows[0]![0]!.html).toBe('<p>새 내용</p>')
})

test('마지막 셀 Tab은 행을 추가한다', () => {
  const { dispatch, container } = renderCanvasWithTable()
  fireEvent.doubleClick(container.querySelector('[data-r="1"][data-c="1"]')!)
  const editable = container.querySelector('[contenteditable]')!
  fireEvent.keyDown(editable, { key: 'Tab' })
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies.length).toBeGreaterThanOrEqual(1)
  const el = (applies.at(-1)![0].doc as DeckDoc).slides[0]!.elements[0]!
  if (el.type !== 'table') return
  expect(el.rows).toHaveLength(3)
})

test('열 경계 드래그는 pointerup에 1 APPLY_DOC으로 colWidths를 갱신한다', () => {
  const { dispatch, container } = renderCanvasWithTable()
  const handle = container.querySelector('.col-resize-handle')!
  fireEvent.pointerDown(handle, { clientX: 200, clientY: 40 })
  fireEvent.pointerMove(window, { clientX: 240, clientY: 40 })
  fireEvent.pointerUp(window)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const el = (applies[0]![0].doc as DeckDoc).slides[0]!.elements[0]!
  if (el.type !== 'table') return
  expect(el.colWidths[0]).not.toBeCloseTo(50, 1)
  expect(el.colWidths[0]! + el.colWidths[1]!).toBeCloseTo(100, 1)
})
```

주의: 헬퍼·좌표는 기존 리사이즈/회전 테스트 관례를 따르고, happy-dom 제약으로 조정 시 검증 약화 없이 보고서에 기록.

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/canvas/CanvasArea.test.tsx`

- [ ] **Step 3: App.tsx 수정**

```tsx
export interface TableSel {
  elementId: string
  anchor: [number, number]
  extent: [number, number]
}
```

- `const [tableSel, setTableSel] = useState<TableSel | null>(null)`
- 초기화 useEffect: `useEffect(() => { setTableSel(null) }, [state.selectedIds, state.currentSlideIndex, state.doc === null])` — 선택된 요소가 바뀌면 해제(같은 표 유지 조건: `tableSel && state.selectedIds.length === 1 && state.selectedIds[0] === tableSel.elementId`면 유지하도록 effect 내에서 가드)
- CanvasArea에 `tableSel={tableSel} setTableSel={setTableSel}` 전달, PropertiesPanel에 `tableSel={tableSel}` 전달(다음 태스크에서 소비 — prop만 미리 추가하면 미사용 경고가 나므로 **이 태스크에서는 CanvasArea만 연결**하고 PropertiesPanel prop은 Task 11에서 추가)

- [ ] **Step 4: CanvasArea.tsx 수정** (핵심 코드)

```tsx
  // props에 tableSel/setTableSel 추가
  const [editingCell, setEditingCell] = useState<{ elementId: string; r: number; c: number } | null>(null)
  const cellDragRef = useRef(false)
  useEffect(() => {
    setEditingCell(null)
  }, [slideIndex])

  const selectedTable =
    selectedIds.length === 1
      ? slide.elements.filter(isKnownElement).find((el): el is TableElement => el.id === selectedIds[0] && el.type === 'table')
      : undefined

  const commitCell = (el: TableElement, r: number, c: number, html: string) => {
    const anchors = flattenAnchors(el)
    const target = anchors.find((a) => a.r === r && a.c === c)
    if (target && target.cell.html !== html) {
      dispatch({ type: 'APPLY_DOC', doc: setCellHtml(doc, slide.id, el.id, r, c, html) })
    }
    dispatch({ type: 'END_TEXT_EDIT' })
    setEditingCell(null)
  }

  const tableFor = (id: string): TableInteraction | undefined => {
    if (!selectedTable || selectedTable.id !== id) return undefined
    const el = selectedTable
    return {
      selectedRange:
        tableSel && tableSel.elementId === id
          ? { r1: tableSel.anchor[0], c1: tableSel.anchor[1], r2: tableSel.extent[0], c2: tableSel.extent[1] }
          : null,
      editingCell: editingCell && editingCell.elementId === id ? { r: editingCell.r, c: editingCell.c } : null,
      onCellPointerDown: (e, r, c) => {
        if (editingCell) return  // 편집 중엔 셀 클릭이 캐럿 이동
        e.stopPropagation()
        if (e.shiftKey && tableSel && tableSel.elementId === id) {
          setTableSel({ ...tableSel, extent: [r, c] })
          return
        }
        setTableSel({ elementId: id, anchor: [r, c], extent: [r, c] })
        cellDragRef.current = true
        const stop = () => {
          cellDragRef.current = false
          window.removeEventListener('pointerup', stop)
        }
        window.addEventListener('pointerup', stop)
      },
      onCellPointerEnter: (r, c) => {
        if (cellDragRef.current && tableSel && tableSel.elementId === id) {
          setTableSel({ ...tableSel, extent: [r, c] })
        }
      },
      onCellDoubleClick: (r, c) => {
        setEditingCell({ elementId: id, r, c })
        dispatch({ type: 'START_TEXT_EDIT', id })
      },
      onCellCommit: (r, c, html) => commitCell(el, r, c, html),
      onCellTab: (r, c, backward) => {
        const anchors = flattenAnchors(el)
        const idx = anchors.findIndex((a) => a.r === r && a.c === c)
        const nextIdx = backward ? idx - 1 : idx + 1
        if (nextIdx < 0) return
        if (nextIdx >= anchors.length) {
          // 마지막 셀 Tab = 행 추가 후 새 행 첫 앵커 편집
          const grown = insertRow(doc, slide.id, el.id, el.rows.length)
          dispatch({ type: 'APPLY_DOC', doc: grown })
          setEditingCell({ elementId: id, r: el.rows.length, c: 0 })
          return
        }
        const next = anchors[nextIdx]!
        setEditingCell({ elementId: id, r: next.r, c: next.c })
      },
      onColBorderPointerDown: (e, leftCol) => beginColResize(e, el, leftCol),
    }
  }

  const beginColResize = (e: ReactPointerEvent, el: TableElement, leftCol: number) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const orig = el.colWidths
    const pairPct = orig[leftCol]! + orig[leftCol + 1]!
    const docAtStart = doc
    const g: ColResizeGesture = { kind: 'colresize', slideId: slide.id, id: el.id, widths: orig, resized: false }
    const onMove = (ev: PointerEvent) => {
      const dxPct = (((ev.clientX - startX) / scaleRef.current) / el.frame.width) * 100
      const left = Math.max(5, Math.min(pairPct - 5, orig[leftCol]! + dxPct))
      const widths = [...orig]
      widths[leftCol] = Math.round(left * 100) / 100
      widths[leftCol + 1] = Math.round((pairPct - left) * 100) / 100
      g.widths = widths
      g.resized = true
      setGesture({ ...g })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (g.resized) dispatch({ type: 'APPLY_DOC', doc: setColWidths(docAtStart, g.slideId, g.id, g.widths) })
      setGesture(null)
    }
    const onCancel = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      setGesture(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }
```

- Gesture 유니언에 `ColResizeGesture { kind:'colresize', slideId, id, widths: number[], resized: boolean }` 추가, previewDoc에 `setColWidths` 분기 추가 (rotate 분기 패턴)
- SlideView interaction에 `tableFor` 전달
- 표 셀 편집 중 표 더블클릭이 START_TEXT_EDIT를 중복 발화하지 않게 onElementDoubleClick의 text 전용 분기는 유지(표는 셀 더블클릭 경로만)

- [ ] **Step 5: 통과 확인** — Run: `cd editor && npm test && npm run typecheck`

- [ ] **Step 6: 커밋**

```bash
git add editor/src/App.tsx editor/src/canvas/CanvasArea.tsx editor/src/canvas/CanvasArea.test.tsx
git commit -m "feat(editor): 표 셀 선택/범위/편집/Tab·열 너비 드래그"
```

---

### Task 11: 속성 패널 표 섹션

**Files:**
- Create: `editor/src/panels/TableSection.tsx`
- Modify: `editor/src/panels/PropertiesPanel.tsx` (tableSel prop + 표 단일 선택 시 섹션), `editor/src/App.tsx` (PropertiesPanel에 tableSel 전달), `editor/src/app.css`
- Test: `editor/src/panels/TableSection.test.tsx`

**Interfaces:**
- Consumes: Task 5 연산 전부, Task 10 `TableSel`(App.tsx), ColorPopover
- Produces: `TableSection({ doc, slide, el, sel, dispatch })` — el: TableElement, sel: TableSel | null

**동작 계약:** 셀 선택 없으면 행/열 조작은 끝에 추가·마지막 삭제 기준(행 삭제·열 삭제는 sel 없으면 비활성). sel 있으면 anchor 기준: `행 추가`=anchor 행 아래 삽입, `행 삭제`=anchor 행, 열 동일. `병합`은 canMergeCells일 때만 활성, `분할`은 anchor 앵커 스팬>1일 때만. `헤더`·셀 배경(ColorPopover)·정렬 3버튼은 sel 범위 대상(없으면 비활성). 전부 1 클릭 = 1 APPLY_DOC.

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/TableSection.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createIdGen } from '../model/id.ts'
import { addElement } from '../model/ops.ts'
import { parseWebdeck } from '../model/parse.ts'
import { createTable } from '../model/tableOps.ts'
import type { DeckDoc, TableElement } from '../model/types.ts'
import { TableSection } from './TableSection.tsx'

const BASE = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section></main></body></html>`)

function setup(sel: { elementId: string; anchor: [number, number]; extent: [number, number] } | null = null, table?: TableElement) {
  const el = table ?? createTable(createIdGen('t'), 2, 2, { left: 0, top: 0, width: 400, height: 80 })
  const doc = addElement(BASE, BASE.slides[0]!.id, el)
  const dispatch = vi.fn()
  const utils = render(
    <TableSection doc={doc} slide={doc.slides[0]!} el={el} sel={sel ? { ...sel, elementId: el.id } : null} dispatch={dispatch} />,
  )
  return { el, doc, dispatch, ...utils }
}

function appliedTable(dispatch: ReturnType<typeof vi.fn>): TableElement {
  const call = dispatch.mock.calls.find(([a]) => a?.type === 'APPLY_DOC')!
  return (call[0].doc as DeckDoc).slides[0]!.elements[0]! as TableElement
}

test('행 추가 — 선택 없으면 끝에, 1 APPLY_DOC', () => {
  const { dispatch, getByRole } = setup()
  fireEvent.click(getByRole('button', { name: '행 추가' }))
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')).toHaveLength(1)
  expect(appliedTable(dispatch).rows).toHaveLength(3)
})

test('선택이 있으면 anchor 행 아래에 추가하고, 행 삭제는 anchor 행', () => {
  const { dispatch, getByRole } = setup({ elementId: '', anchor: [0, 0], extent: [0, 0] })
  fireEvent.click(getByRole('button', { name: '행 삭제' }))
  expect(appliedTable(dispatch).rows).toHaveLength(1)
})

test('셀 선택 없으면 행 삭제·병합·분할·서식 비활성', () => {
  const { getByRole } = setup()
  expect((getByRole('button', { name: '행 삭제' }) as HTMLButtonElement).disabled).toBe(true)
  expect((getByRole('button', { name: '병합' }) as HTMLButtonElement).disabled).toBe(true)
  expect((getByRole('button', { name: '분할' }) as HTMLButtonElement).disabled).toBe(true)
})

test('2×1 범위 선택 시 병합 활성 → 클릭 1 APPLY_DOC', () => {
  const { dispatch, getByRole } = setup({ elementId: '', anchor: [0, 0], extent: [1, 0] })
  const merge = getByRole('button', { name: '병합' }) as HTMLButtonElement
  expect(merge.disabled).toBe(false)
  fireEvent.click(merge)
  const el = appliedTable(dispatch)
  expect(el.rows[0]![0]!.rowspan).toBe(2)
})

test('헤더 토글은 범위 대상 1 APPLY_DOC', () => {
  const { dispatch, getByRole } = setup({ elementId: '', anchor: [1, 0], extent: [1, 1] })
  fireEvent.click(getByRole('button', { name: '헤더' }))
  const el = appliedTable(dispatch)
  expect(el.rows[1]![0]!.header).toBe(true)
  expect(el.rows[1]![1]!.header).toBe(true)
})
```

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/panels/TableSection.test.tsx`

- [ ] **Step 3: 구현**

`editor/src/panels/TableSection.tsx`:

```tsx
import type { Dispatch } from 'react'
import type { TableSel } from '../App.tsx'
import {
  canMergeCells, flattenAnchors, insertCol, insertRow, mergeCells,
  removeCol, removeRow, setCellsStyle, splitCell, toggleHeaderCells,
} from '../model/tableOps.ts'
import type { CellAlign, DeckDoc, Slide, TableElement } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'
import { ColorPopover } from './ColorPopover.tsx'

const HEX = /^#[0-9a-fA-F]{6}$/

export function TableSection({
  doc, slide, el, sel, dispatch,
}: {
  doc: DeckDoc
  slide: Slide
  el: TableElement
  sel: TableSel | null
  dispatch: Dispatch<EditorAction>
}) {
  const active = sel && sel.elementId === el.id ? sel : null
  const rect = active
    ? {
        r1: Math.min(active.anchor[0], active.extent[0]),
        c1: Math.min(active.anchor[1], active.extent[1]),
        r2: Math.max(active.anchor[0], active.extent[0]),
        c2: Math.max(active.anchor[1], active.extent[1]),
      }
    : null
  const apply = (next: DeckDoc) => {
    if (next !== doc) dispatch({ type: 'APPLY_DOC', doc: next })
  }
  const anchorCell = rect ? flattenAnchors(el).find((a) => a.r === rect.r1 && a.c === rect.c1) : undefined
  const canSplit = !!anchorCell && (anchorCell.cell.colspan > 1 || anchorCell.cell.rowspan > 1)
  const canMerge = rect !== null && canMergeCells(el, rect.r1, rect.c1, rect.r2, rect.c2)
  const bgValue = anchorCell && anchorCell.cell.bg !== null && HEX.test(anchorCell.cell.bg) ? anchorCell.cell.bg : undefined

  return (
    <section className="theme-section">
      <h2>표</h2>
      <div className="btn-row">
        <button type="button" onClick={() => apply(insertRow(doc, slide.id, el.id, rect ? rect.r1 + 1 : el.rows.length))}>행 추가</button>
        <button type="button" disabled={!rect} onClick={() => rect && apply(removeRow(doc, slide.id, el.id, rect.r1))}>행 삭제</button>
        <button type="button" onClick={() => apply(insertCol(doc, slide.id, el.id, rect ? rect.c1 + 1 : el.colWidths.length))}>열 추가</button>
        <button type="button" disabled={!rect} onClick={() => rect && apply(removeCol(doc, slide.id, el.id, rect.c1))}>열 삭제</button>
      </div>
      <div className="btn-row">
        <button type="button" disabled={!canMerge} onClick={() => rect && apply(mergeCells(doc, slide.id, el.id, rect.r1, rect.c1, rect.r2, rect.c2))}>병합</button>
        <button type="button" disabled={!canSplit} onClick={() => rect && apply(splitCell(doc, slide.id, el.id, rect.r1, rect.c1))}>분할</button>
        <button type="button" disabled={!rect} onClick={() => rect && apply(toggleHeaderCells(doc, slide.id, el.id, rect.r1, rect.c1, rect.r2, rect.c2))}>헤더</button>
      </div>
      <div className="prop-row">
        <ColorPopover
          label="셀 배경"
          value={bgValue}
          disabled={!rect}
          onPick={(c) => rect && apply(setCellsStyle(doc, slide.id, el.id, rect.r1, rect.c1, rect.r2, rect.c2, { bg: c }))}
          clearLabel="배경 없음"
          onClear={() => rect && apply(setCellsStyle(doc, slide.id, el.id, rect.r1, rect.c1, rect.r2, rect.c2, { bg: null }))}
        />
      </div>
      <div className="btn-row">
        {(['left', 'center', 'right'] as CellAlign[]).map((a) => (
          <button
            key={a}
            type="button"
            disabled={!rect}
            aria-label={`셀 ${a === 'left' ? '왼쪽' : a === 'center' ? '가운데' : '오른쪽'} 정렬`}
            onClick={() => rect && apply(setCellsStyle(doc, slide.id, el.id, rect.r1, rect.c1, rect.r2, rect.c2, { align: a }))}
          >
            {a === 'left' ? '⟸' : a === 'center' ? '⟺' : '⟹'}
          </button>
        ))}
      </div>
    </section>
  )
}
```

`editor/src/panels/PropertiesPanel.tsx`:

- props에 `tableSel?: TableSel | null` 추가 (`import type { TableSel } from '../App.tsx'`)
- 단일 선택이 table이면 위치·크기 섹션 아래에:

```tsx
      {selectedKnown.length === 1 && selectedKnown[0]!.type === 'table' && (
        <TableSection doc={doc} slide={slide} el={selectedKnown[0]! as TableElement} sel={tableSel ?? null} dispatch={dispatch} />
      )}
```

- 표 선택 시 요소 공통 채우기/테두리/그림자 섹션은 유지(상자 스타일로 동작 — extraStyle)
- `editor/src/App.tsx`: PropertiesPanel에 `tableSel={tableSel}` 전달

주의: TableSection의 ColorPopover props(clearLabel/onClear/disabled)는 실제 ColorPopover 시그니처를 확인해 맞출 것.

- [ ] **Step 4: 통과 확인** — Run: `cd editor && npm test && npm run typecheck`

- [ ] **Step 5: 커밋**

```bash
git add editor/src/panels/TableSection.tsx editor/src/panels/TableSection.test.tsx editor/src/panels/PropertiesPanel.tsx editor/src/App.tsx editor/src/app.css
git commit -m "feat(editor): 속성 패널 표 섹션 — 행/열/병합/분할/헤더/셀 서식"
```

---

### Task 12: opaque 변환 버튼 (슬라이드 모드)

**Files:**
- Modify: `editor/src/panels/PropertiesPanel.tsx` (슬라이드 모드), `editor/src/App.tsx` 무변경 확인
- Test: `editor/src/panels/PropertiesPanel.test.tsx` (추가)

- [ ] **Step 1: 실패하는 테스트 작성** (PropertiesPanel.test.tsx — 기존 renderPanel 헬퍼로 opaque 표 포함 문서 주입)

```tsx
test('슬라이드 모드 — 변환 가능한 opaque 표가 있으면 변환 버튼이 보이고 1 APPLY_DOC', () => {
  const withOpaque = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el" style="left:96px; top:200px; width:600px; height:200px;"><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table></div></section>
</main></body></html>`)
  const { dispatch, getByRole } = renderPanel({ doc: withOpaque })
  const btn = getByRole('button', { name: '편집 불가 표 1개를 표 요소로 변환' })
  fireEvent.click(btn)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.elements[0]!.type).toBe('table')
})

test('변환 가능한 표가 없으면 버튼 미표시', () => {
  const { queryByRole } = renderPanel()
  expect(queryByRole('button', { name: /표 요소로 변환/ })).toBeNull()
})
```

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/panels/PropertiesPanel.test.tsx`

- [ ] **Step 3: 구현** (PropertiesPanel 슬라이드 모드 — 노트 label 아래에 추가; import `convertOpaqueTables, convertibleOpaqueTableCount`(tableOps), `createIdGen`은 App의 idGen을 안 쓰므로 컴포넌트 지역 `useRef(createIdGen('tc'))` 사용)

```tsx
        {(() => {
          const n = convertibleOpaqueTableCount(slide)
          if (n === 0) return null
          return (
            <div className="btn-row">
              <button
                type="button"
                onClick={() => {
                  const next = convertOpaqueTables(doc, slide.id, convertIdGen.current)
                  if (next !== doc) dispatch({ type: 'APPLY_DOC', doc: next })
                }}
              >
                편집 불가 표 {n}개를 표 요소로 변환
              </button>
            </div>
          )
        })()}
```

(`const convertIdGen = useRef(createIdGen('tc'))` 를 컴포넌트 상단에)

- [ ] **Step 4: 통과 확인** — Run: `cd editor && npm test && npm run typecheck`

- [ ] **Step 5: 커밋**

```bash
git add editor/src/panels/PropertiesPanel.tsx editor/src/panels/PropertiesPanel.test.tsx
git commit -m "feat(editor): opaque 표 → 표 요소 변환 버튼"
```

---

### Task 13: 문서 갱신과 최종 검증

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-webdeck-design.md` (§12), `README.md`, `docs/roadmap.md`

- [ ] **Step 1: 마스터 스펙 §12 목록 끝(Plan 9 항목 다음)에 추가**

```markdown
- **Plan 9b — 표 편집기 (2026-07-05)**: `el-table` 요소 타입(v1.1) — colspan/rowspan 병합 1급 그리드 모델(rows는 앵커 셀만, table/colgroup은 정준·td/th는 보존), 표 삽입(8×8 피커), 셀 편집(더블클릭·Tab·마지막 셀 Tab=행 추가), 행/열 추가·삭제(스팬 확장/축소·앵커 이전 무손실), 병합(내용 행 우선 연결)/분할, 셀 배경·정렬·헤더 토글, 열 너비 드래그, opaque 표 변환 버튼. 검증기 정형 규칙·ai-guide 표 레시피. 셀 선택은 App 로컬 상태(리듀서 무변경). 상세: `2026-07-05-webdeck-table-design.md`
```

- [ ] **Step 2: README 갱신**

"현재 제공"의 "도형·회전" 항목 다음에 추가:

```markdown
- **표 편집** — 표 삽입(크기 피커), 셀 텍스트 편집(Tab 이동), 행/열 추가·삭제, 셀 병합/분할, 셀 배경·정렬·헤더, 열 너비 드래그. AI가 만든 편집 불가(opaque) 표도 버튼 한 번으로 편집 가능한 표로 변환
```

"## 로드맵" 완료 줄의 `~~Plan 9: 도형·회전~~ (완료)` 를 `~~Plan 9: 도형·회전~~ · ~~Plan 9b: 표 편집기~~ (완료)` 로 교체하고, "이후 계획" 줄을 `- 이후 계획: \`docs/roadmap.md\` (배포, AI 연동 — Plan 8은 맨 마지막)` 로 교체.

- [ ] **Step 3: roadmap.md 갱신**

`### Plan 9 — 큰 요소 타입 ✅ (도형·회전 완료, 표는 9b)` 제목을 `### Plan 9 — 큰 요소 타입 ✅ (완료 — 9: 도형·회전, 9b: 표 편집기)` 로 바꾸고, 해당 문단의 완료 줄을 다음으로 교체:

```markdown
— 2026-07-04 도형 5종·회전 완료, 2026-07-05 표 편집기(el-table, 병합 포함) 완료. 회전 요소의 드래그 리사이즈는 제한(패널 수치로).
```

또한 §2 D 문단("표 — PPT 핵심이지만...") 끝에 한 줄 추가:

```markdown
→ 2026-07-05 Plan 9b로 `el-table` 편집기 구현 완료 (병합 포함, opaque 표 변환 버튼 제공).
```

- [ ] **Step 4: 전체 검증** — Run (루트): `npm run test:all && cd editor && npm run typecheck && npm run build`. Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add docs/superpowers/specs/2026-07-02-webdeck-design.md README.md docs/roadmap.md
git commit -m "docs: Plan 9b 이력·README·로드맵 갱신"
```

---

## 알려진 한계 (스펙 §6)

- 마지막 행/열 삭제 no-op, 부분 겹침 병합 비활성
- 회전된 표의 셀 편집 UI 시각적 어색 — 수용
- 셀별 테두리·비1급 스타일은 보존만
- 표 내용이 frame보다 크면 자연 확장 (frame.height는 최소 높이)
- 변환은 정형 표만 — 비정형은 카운트 제외

## 수동 확인 (사람 확인 — 머지 후)

1. 표 버튼 → 3×4 피커 삽입 → 셀 더블클릭 편집·Tab 순회·마지막 셀 Tab 행 추가
2. 셀 드래그 범위 → 병합 → 분할 → Ctrl+Z 단계 복원
3. 행/열 추가·삭제가 병합 셀을 가로지를 때 내용이 사라지지 않는지
4. 열 경계 드래그 → 저장 → validate 통과 → 브라우저·발표 모드에서 병합 표 렌더
5. AI 생성 opaque 표가 있는 문서 → 슬라이드 패널 변환 버튼 → 편집 → 저장 → 재열기
