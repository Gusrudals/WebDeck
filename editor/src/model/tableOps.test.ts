import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'
import { addElement } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'
import {
  buildGrid,
  createTable,
  insertCol,
  insertRow,
  newCell,
  normalizeWidths,
  removeCol,
  removeRow,
  setCellHtml,
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
