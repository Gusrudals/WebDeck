import { describe, expect, test } from 'vitest'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'
import { serializeWebdeck } from './serialize.ts'
import { setCellHtml } from './tableOps.ts'

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

  test('table 옆에 비공백 텍스트가 있으면 opaque 보존 (조용한 유실 방지 — 리뷰 회귀)', () => {
    const doc = parseWebdeck(TABLE('<tbody><tr><td>a</td></tr></tbody>').replace('<table>', 'stray text<table>'))
    expect(doc.slides[0]!.elements[0]!.type).toBe('opaque')
    expect(serializeWebdeck(doc)).toContain('stray text')
    expect(checkRoundTrip(doc)).toBeNull()
  })

  test('셀 html 앞뒤에 공백만 있어도 통과한다 (trim 정규화 — 최종 리뷰 F1)', () => {
    const doc = parseWebdeck(TABLE('<tbody><tr><td>x</td><td>y</td></tr></tbody>'))
    const el = doc.slides[0]!.elements[0]!
    expect(el.type).toBe('table')
    if (el.type !== 'table') return
    const d = setCellHtml(doc, doc.slides[0]!.id, el.id, 0, 0, '  <p>abc</p>\n')
    expect(checkRoundTrip(d)).toBeNull()
  })
})
