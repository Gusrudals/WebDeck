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

  test('caption·tfoot 등 미지원 자식이 있으면 null (조용한 소실 방지 — 리뷰 회귀)', () => {
    // caption이 table 직속 자식으로 있는 경우
    expect(parseTableMarkup(tableEl('<caption>제목</caption><tbody><tr><td>a</td></tr></tbody>'))).toBeNull()
    // tfoot이 table 직속 자식으로 있는 경우
    expect(parseTableMarkup(tableEl('<tbody><tr><td>a</td></tr></tbody><tfoot><tr><td>f</td></tr></tfoot>'))).toBeNull()
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
    // serializeInlineStyle의 실제 출력 형식은 콜론 뒤 공백 없이 "prop:value;"이며 선언 사이만 공백으로 구분한다
    // (task-1-report.md 참고 — 검증 대상은 승격 순서(extraStyle → background → text-align)와 보존 여부이지 공백 형식이 아니다)
    expect(out).toContain('<th colspan="2" style="border:1px solid #d1d5db; background:#eef2ff; text-align:center;"><p>H</p></th>')
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
