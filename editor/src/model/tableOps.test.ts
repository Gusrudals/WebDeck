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
})
