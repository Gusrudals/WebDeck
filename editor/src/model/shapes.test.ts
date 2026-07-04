import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'
import { addElement, createShape } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'
import { serializeWebdeck } from './serialize.ts'
import { SHAPE_INNER_HTML, isLinear } from './shapeSvg.ts'

const WRAP = (inner: string) => `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">${inner}</section>
</main></body></html>`

const SHAPE = (kind: string, inner = '') =>
  WRAP(`<div class="el el-shape" data-shape="${kind}" style="left:10px; top:10px; width:200px; height:100px;">${inner}</div>`)

describe('도형 5종 파싱·왕복', () => {
  test.each(['rect', 'ellipse', 'rounded'] as const)('%s 는 ShapeElement로 파싱되고 왕복한다', (kind) => {
    const doc = parseWebdeck(SHAPE(kind))
    const el = doc.slides[0]!.elements[0]!
    expect(el.type).toBe('shape')
    if (el.type !== 'shape') return
    expect(el.shape).toBe(kind)
    expect(checkRoundTrip(doc)).toBeNull()
    expect(serializeWebdeck(doc)).toContain(`data-shape="${kind}"`)
  })

  test('미지원 data-shape 값은 opaque로 보존된다 (회귀)', () => {
    const doc = parseWebdeck(SHAPE('star'))
    expect(doc.slides[0]!.elements[0]!.type).toBe('opaque')
    expect(checkRoundTrip(doc)).toBeNull()
  })

  test('rect류에 자식이 있으면 opaque (기존 규칙 유지)', () => {
    const doc = parseWebdeck(SHAPE('ellipse', '<p>x</p>'))
    expect(doc.slides[0]!.elements[0]!.type).toBe('opaque')
  })
})

describe('line·arrow 정준 SVG', () => {
  test('내부 마크업이 무엇이든 파싱되고 직렬화가 정준 SVG로 재생성한다', () => {
    const doc = parseWebdeck(SHAPE('arrow', '<svg><circle r="1"></circle></svg><b>쓰레기</b>'))
    const el = doc.slides[0]!.elements[0]!
    expect(el.type).toBe('shape')
    if (el.type !== 'shape') return
    expect(el.shape).toBe('arrow')
    const html = serializeWebdeck(doc)
    expect(html).toContain(SHAPE_INNER_HTML.arrow)
    expect(html).not.toContain('쓰레기')
  })

  test('직렬화는 정준적이다 — 재파싱 후 재직렬화가 동일하다', () => {
    const doc = parseWebdeck(SHAPE('line'))
    const once = serializeWebdeck(doc)
    const twice = serializeWebdeck(parseWebdeck(once))
    expect(twice).toBe(once)
    expect(once).toContain(SHAPE_INNER_HTML.line)
  })

  test('정준 SVG 규약: 퍼센트 좌표·currentColor·stroke-width 2·화살표 marker', () => {
    expect(SHAPE_INNER_HTML.line).toContain('y1="50%"')
    expect(SHAPE_INNER_HTML.line).toContain('x2="100%"')
    expect(SHAPE_INNER_HTML.line).toContain('stroke="currentColor"')
    expect(SHAPE_INNER_HTML.line).toContain('stroke-width="2"')
    expect(SHAPE_INNER_HTML.line).not.toContain('viewBox')
    expect(SHAPE_INNER_HTML.arrow).toContain('wd-arrow-head')
    expect(SHAPE_INNER_HTML.arrow).toContain('markerUnits="userSpaceOnUse"')
    expect(isLinear('line')).toBe(true)
    expect(isLinear('arrow')).toBe(true)
    expect(isLinear('rect')).toBe(false)
  })
})

describe('createShape 팩토리', () => {
  const BASE = parseWebdeck(WRAP(''))

  test('kind별 기본 스타일 — ellipse/rounded는 border-radius, line/arrow는 color', () => {
    const g = createIdGen('s')
    expect(createShape(g, 'ellipse', { left: 0, top: 0, width: 240, height: 160 }).extraStyle['border-radius']).toBe('50%')
    expect(createShape(g, 'rounded', { left: 0, top: 0, width: 240, height: 160 }).extraStyle['border-radius']).toBe('24px')
    expect(createShape(g, 'rect', { left: 0, top: 0, width: 240, height: 160 }).extraStyle['background']).toBe('var(--wd-accent)')
    const line = createShape(g, 'line', { left: 0, top: 0, width: 320, height: 8 })
    expect(line.extraStyle['color']).toBe('#374151')
    expect(line.extraStyle['background']).toBeUndefined()
  })

  test('삽입 후 왕복을 통과한다 (5종)', () => {
    const g = createIdGen('i')
    let doc = BASE
    for (const kind of ['rect', 'ellipse', 'rounded', 'line', 'arrow'] as const) {
      doc = addElement(doc, doc.slides[0]!.id, createShape(g, kind, { left: 20, top: 20, width: 240, height: 160 }))
    }
    expect(doc.slides[0]!.elements).toHaveLength(5)
    expect(checkRoundTrip(doc)).toBeNull()
  })
})
