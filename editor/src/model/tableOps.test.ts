import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'
import { addElement } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'
import {
  buildGrid,
  canMergeCells,
  createTable,
  insertCol,
  insertRow,
  mergeCells,
  newCell,
  normalizeWidths,
  removeCol,
  removeRow,
  setCellHtml,
  setCellsStyle,
  setColWidths,
  splitCell,
  toggleHeaderCells,
} from './tableOps.ts'
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
    // background는 1급 필드(bg)에 담긴다 — extraStyle에 두면 파서 왕복 시 bg로 재분류되어(tableMarkup.ts
    // parseCell 계약) checkRoundTrip이 깨진다(브리프 결함 교정, 실측 확인·아래 사유 기록 참고)
    expect(t.rows[0]![0]!.bg).toBe('var(--wd-accent)')
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

  test('normalizeWidths — 개별 음수는 0으로 클램프 후 정규화 (리뷰 회귀)', () => {
    const w = normalizeWidths([-10, 20, 30])
    expect(w.every((x) => x >= 0)).toBe(true)
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1)
    expect(w[0]).toBe(0)
  })
})

describe('행/열 추가·삭제 (스팬 인식)', () => {
  test('스팬 내부에 행 삽입 → rowspan 확장, 새 행은 스팬 구간 제외', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    const out = insertRow(doc, slideId, id, 1) // 2×2 병합(행 0-1) 내부
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows).toHaveLength(4)
    expect(el.rows[0]![0]!.rowspan).toBe(3)
    expect(el.rows[1]).toHaveLength(1) // 새 행: 병합 구간(열 0-1) 제외, 열 2만
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

  // 불변식 스윕(브리프 요구, 자체 추가): mergedTable에 대해 모든 유효 index에서
  // 행/열 삽입·삭제가 항상 그리드 정합(gridIsValid)과 무손실 왕복(checkRoundTrip)을 유지하는지 전수 검증.
  // 개별 케이스 테스트는 특정 스팬 경계만 짚으므로, 앵커 좌표 재계산(covered 집합·removeRow의 r 좌표계)에
  // 남을 수 있는 경계 버그를 넓게 잡기 위한 루프.
  test('불변식 스윕: 모든 유효 index의 삽입·삭제가 그리드 정합·왕복 보존을 유지한다', () => {
    const rowCount = mergedTable().rows.length
    const colCount = mergedTable().colWidths.length

    for (let index = 0; index <= rowCount; index++) {
      const { doc, slideId, id } = docWithTable(mergedTable())
      const out = insertRow(doc, slideId, id, index)
      const el = out.slides[0]!.elements[0]! as TableElement
      expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
      expect(checkRoundTrip(out)).toBeNull()
    }

    for (let index = 0; index < rowCount; index++) {
      const { doc, slideId, id } = docWithTable(mergedTable())
      const out = removeRow(doc, slideId, id, index)
      const el = out.slides[0]!.elements[0]! as TableElement
      expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
      expect(checkRoundTrip(out)).toBeNull()
    }

    for (let index = 0; index <= colCount; index++) {
      const { doc, slideId, id } = docWithTable(mergedTable())
      const out = insertCol(doc, slideId, id, index)
      const el = out.slides[0]!.elements[0]! as TableElement
      expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
      expect(checkRoundTrip(out)).toBeNull()
    }

    for (let index = 0; index < colCount; index++) {
      const { doc, slideId, id } = docWithTable(mergedTable())
      const out = removeCol(doc, slideId, id, index)
      const el = out.slides[0]!.elements[0]! as TableElement
      expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
      expect(checkRoundTrip(out)).toBeNull()
    }
  })
})

describe('병합·분할·서식', () => {
  test('canMergeCells — 부분 겹침 거부·단일 셀 거부·완전 포함 허용', () => {
    const t = mergedTable()
    expect(canMergeCells(t, 0, 0, 1, 1)).toBe(false) // 이미 병합 그 자체(단일 앵커)
    expect(canMergeCells(t, 0, 0, 0, 2)).toBe(false) // 2×2 병합과 부분 겹침
    expect(canMergeCells(t, 0, 0, 2, 2)).toBe(true) // 전체 — 완전 포함
    expect(canMergeCells(t, 2, 0, 2, 2)).toBe(true) // 마지막 행 3칸
    expect(canMergeCells(t, 2, 1, 2, 1)).toBe(false) // 단일 셀
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

  // 브리프 보정: 대상이 없거나(범위 밖 좌표) 이미 스팬 1인 셀에 splitCell을 호출하면
  // peekTable 단락으로 doc을 그대로 반환해야 한다(플랜 스니펫의 `return el` 방식은
  // mapTable 경유 시 항상 새 wrapper를 만들어 참조 동일성이 깨진다 — Task 4에서 실증된 결함).
  test('splitCell — 대상 없음/스팬 1이면 같은 객체를 반환한다', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    expect(splitCell(doc, slideId, id, 2, 1)).toBe(doc) // 스팬 1인 일반 셀
    expect(splitCell(doc, slideId, id, 0, 1)).toBe(doc) // (0,1)은 앵커가 아님(병합에 덮인 칸 아님, 그저 존재하지 않는 좌표 조합)
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

  test('setCellsStyle — patch에 없는 키는 건드리지 않는다(undefined 구분)', () => {
    const t = createTable(createIdGen('s2'), 2, 2, { left: 0, top: 0, width: 400, height: 80 })
    const { doc, slideId, id } = docWithTable(t)
    const withBg = setCellsStyle(doc, slideId, id, 0, 0, 0, 0, { bg: '#111827' })
    const el = withBg.slides[0]!.elements[0]! as TableElement
    expect(el.rows[0]![0]!.align).toBeNull()
    const withAlignOnly = setCellsStyle(withBg, slideId, id, 0, 0, 0, 0, { align: 'right' })
    const el2 = withAlignOnly.slides[0]!.elements[0]! as TableElement
    expect(el2.rows[0]![0]!.bg).toBe('#111827') // align만 patch — bg는 유지
    expect(el2.rows[0]![0]!.align).toBe('right')
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

  // 브리프 보정: 길이 불일치면 doc 그대로(참조 동일) 반환한다.
  test('setColWidths — 길이 불일치면 같은 객체를 반환한다', () => {
    const { doc, slideId, id } = docWithTable(mergedTable())
    expect(setColWidths(doc, slideId, id, [20, 80])).toBe(doc)
  })
})

// Task 4 리뷰 이월: mergeCells가 만드는 "완전 피복 빈 행"(covered-but-anchorless <tr></tr>) 경로는
// 지금까지 insertRow/removeRow/insertCol/removeCol에 대해 실측된 적이 없었다(Task 4 당시엔
// mergeCells가 없어 이런 표를 만들 수 없었음). buildGrid/gridIsValid는 스팬이 완전히 덮은 빈 행을
// 유효하다고 보므로(occupied가 다른 행의 스팬으로 채워짐), 이후 연산들이 빈 rows[r]=[] 배열을
// 정상적으로 다루는지 연쇄 적용으로 확인한다.
describe('완전 피복 빈 행 — Task 4 함수와의 상호작용', () => {
  test('2×2 전체 병합은 rows[1]을 빈 배열로 남기고 그리드는 여전히 정합이다', () => {
    const t = createTable(createIdGen('f'), 2, 2, { left: 0, top: 0, width: 400, height: 80 })
    const { doc, slideId, id } = docWithTable(t)
    const out = mergeCells(doc, slideId, id, 0, 0, 1, 1)
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows[0]).toHaveLength(1)
    expect(el.rows[1]).toEqual([])
    expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
    expect(checkRoundTrip(out)).toBeNull()
  })

  test('완전 피복 빈 행이 있는 표에 insertRow/removeRow/insertCol/removeCol을 이어 적용해도 정합이 유지된다', () => {
    const t = createTable(createIdGen('g'), 2, 2, { left: 0, top: 0, width: 400, height: 80 })
    const { doc, slideId, id } = docWithTable(t)
    const merged = mergeCells(doc, slideId, id, 0, 0, 1, 1)

    const afterInsertRow = insertRow(merged, slideId, id, 1)
    const elAfterInsertRow = afterInsertRow.slides[0]!.elements[0]! as TableElement
    expect(elAfterInsertRow.rows).toHaveLength(3)
    expect(elAfterInsertRow.rows[0]![0]!.rowspan).toBe(3)
    expect(gridIsValid(elAfterInsertRow.colWidths, elAfterInsertRow.rows)).toBe(true)
    expect(checkRoundTrip(afterInsertRow)).toBeNull()

    const afterRemoveRow = removeRow(afterInsertRow, slideId, id, 1)
    const elAfterRemoveRow = afterRemoveRow.slides[0]!.elements[0]! as TableElement
    expect(elAfterRemoveRow.rows).toHaveLength(2)
    expect(elAfterRemoveRow.rows[0]![0]!.rowspan).toBe(2)
    expect(elAfterRemoveRow.rows[1]).toEqual([])
    expect(gridIsValid(elAfterRemoveRow.colWidths, elAfterRemoveRow.rows)).toBe(true)
    expect(checkRoundTrip(afterRemoveRow)).toBeNull()

    const afterInsertCol = insertCol(afterRemoveRow, slideId, id, 1)
    const elAfterInsertCol = afterInsertCol.slides[0]!.elements[0]! as TableElement
    expect(elAfterInsertCol.colWidths).toHaveLength(3)
    expect(elAfterInsertCol.rows[0]![0]!.colspan).toBe(3)
    expect(elAfterInsertCol.rows[1]).toEqual([])
    expect(gridIsValid(elAfterInsertCol.colWidths, elAfterInsertCol.rows)).toBe(true)
    expect(checkRoundTrip(afterInsertCol)).toBeNull()

    const afterRemoveCol = removeCol(afterInsertCol, slideId, id, 1)
    const elAfterRemoveCol = afterRemoveCol.slides[0]!.elements[0]! as TableElement
    expect(elAfterRemoveCol.colWidths).toHaveLength(2)
    expect(elAfterRemoveCol.rows[0]![0]!.colspan).toBe(2)
    expect(elAfterRemoveCol.rows[0]![0]!.rowspan).toBe(2)
    expect(elAfterRemoveCol.rows[1]).toEqual([])
    expect(gridIsValid(elAfterRemoveCol.colWidths, elAfterRemoveCol.rows)).toBe(true)
    expect(checkRoundTrip(afterRemoveCol)).toBeNull()
  })

  test('같은 삭제선을 가로지르는 다중 병합 — removeRow가 각 병합을 독립적으로 축소한다', () => {
    const t = createTable(createIdGen('x'), 3, 3, { left: 0, top: 0, width: 720, height: 120 })
    const withContent: TableElement = {
      ...t,
      rows: t.rows.map((row, r) => row.map((cell, c) => ({ ...cell, html: `${r}${c}` }))),
    }
    const { doc, slideId, id } = docWithTable(withContent)
    const merge1 = mergeCells(doc, slideId, id, 0, 0, 1, 0) // 행0-1, 열0 세로 병합
    const merge2 = mergeCells(merge1, slideId, id, 0, 2, 1, 2) // 행0-1, 열2 세로 병합
    const mergedEl = merge2.slides[0]!.elements[0]! as TableElement
    expect(gridIsValid(mergedEl.colWidths, mergedEl.rows)).toBe(true)
    expect(checkRoundTrip(merge2)).toBeNull()

    const out = removeRow(merge2, slideId, id, 0)
    const el = out.slides[0]!.elements[0]! as TableElement
    expect(el.rows).toHaveLength(2)
    expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
    expect(checkRoundTrip(out)).toBeNull()
    // 두 병합 모두 삭제선(행0)을 가로지르므로 rowspan이 각각 독립적으로 1로 줄고, 내용은 앵커에 남는다.
    // 가운데 열(병합에 관여하지 않음)의 행1 셀은 위로 한 칸 이동한다.
    expect(el.rows[0]!.map((c) => c.html)).toEqual(['0010', '11', '0212'])
    expect(el.rows[0]!.every((c) => c.rowspan === 1 && c.colspan === 1)).toBe(true)
    expect(el.rows[1]!.map((c) => c.html)).toEqual(['20', '21', '22'])
  })
})
