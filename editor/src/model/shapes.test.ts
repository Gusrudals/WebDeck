import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'
import { addElement, createShape } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'
import { serializeWebdeck } from './serialize.ts'
import { isLinear, lineDefaults, shapeInnerHtml } from './shapeSvg.ts'
import type { DeckDoc, ShapeElement } from './types.ts'

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
    expect(html).toContain(shapeInnerHtml(el.id, lineDefaults('arrow')))
    expect(html).not.toContain('쓰레기')
  })

  test('직렬화는 정준적이다 — 재파싱 후 재직렬화가 동일하다', () => {
    const doc = parseWebdeck(SHAPE('line'))
    const once = serializeWebdeck(doc)
    const twice = serializeWebdeck(parseWebdeck(once))
    expect(twice).toBe(once)
    expect(once).toContain(shapeInnerHtml('무관', lineDefaults('line')))
  })

  test('정준 SVG 규약: 퍼센트 좌표·currentColor·stroke-width 2·화살표 marker', () => {
    const lineHtml = shapeInnerHtml('무관', lineDefaults('line'))
    expect(lineHtml).toContain('y1="50%"')
    expect(lineHtml).toContain('x2="100%"')
    expect(lineHtml).toContain('stroke="currentColor"')
    expect(lineHtml).toContain('stroke-width="2"')
    expect(lineHtml).not.toContain('viewBox')
    const arrowHtml = shapeInnerHtml('abc123', lineDefaults('arrow'))
    expect(arrowHtml).toContain('wd-arrow-head-abc123')
    expect(arrowHtml).toContain('markerUnits="strokeWidth"')
    expect(isLinear('line')).toBe(true)
    expect(isLinear('arrow')).toBe(true)
    expect(isLinear('rect')).toBe(false)
  })

  test('화살표 여러 개는 각자 유일한 marker id를 갖는다 (머리 색 격리)', () => {
    const doc = parseWebdeck(WRAP(
      '<div class="el el-shape" data-shape="arrow" style="left:0px; top:10px; width:200px; height:8px; color:#dc2626;"></div>'
      + '<div class="el el-shape" data-shape="arrow" style="left:0px; top:40px; width:200px; height:8px; color:#1a56db;"></div>'
    ))
    const html = serializeWebdeck(doc)
    const ids = [...html.matchAll(/id="(wd-arrow-head-[^"]+)"/g)].map((m) => m[1])
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(html).toContain(`url(#${id})`)
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

describe('선 서식 — 정준 SVG (Plan 9c)', () => {
  test('기본 line 출력은 기존 정준형과 바이트 동일 (회귀)', () => {
    expect(shapeInnerHtml('x', lineDefaults('line'))).toBe(
      '<svg width="100%" height="100%" style="overflow: visible; display: block;"><line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" stroke-width="2"></line></svg>',
    )
  })
  test('기본 arrow: marker는 strokeWidth 단위 5/2.5 규격 + auto-start-reverse, marker-end만', () => {
    const html = shapeInnerHtml('abc', lineDefaults('arrow'))
    expect(html).toContain('markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto-start-reverse" markerUnits="strokeWidth"')
    expect(html).toContain('marker-end="url(#wd-arrow-head-abc)"')
    expect(html).not.toContain('marker-start')
  })
  test('대시 정준식은 굵기에 비례한다', () => {
    const dashed = shapeInnerHtml('x', { ...lineDefaults('line'), strokeWidth: 4, strokeDash: 'dashed' })
    expect(dashed).toContain('stroke-width="4"')
    expect(dashed).toContain('stroke-dasharray="12 8"')
    const dotted = shapeInnerHtml('x', { ...lineDefaults('line'), strokeDash: 'dotted' })
    expect(dotted).toContain('stroke-dasharray="0 4"')
    expect(dotted).toContain('stroke-linecap="round"')
  })
  test('시작 머리만 켜면 marker-start만, 머리가 없으면 defs도 없다', () => {
    const start = shapeInnerHtml('x', { ...lineDefaults('line'), headStart: true })
    expect(start).toContain('marker-start=')
    expect(start).not.toContain('marker-end=')
    expect(shapeInnerHtml('x', { ...lineDefaults('arrow'), headEnd: false })).not.toContain('<defs>')
  })
})

describe('선 서식 — 파서 승격/직렬화 (Plan 9c)', () => {
  const docOf = (attrs: string, kind = 'line') =>
    parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-shape" data-shape="${kind}"${attrs} style="left:0px; top:0px; width:320px; height:8px;"></div></section>
</main></body></html>`)
  const shapeOf = (doc: DeckDoc) => doc.slides[0]!.elements[0] as ShapeElement

  test('유효 속성은 필드로 승격되고 extraAttrs에 남지 않는다', () => {
    const el = shapeOf(docOf(' data-stroke-width="4" data-stroke-dash="dashed" data-head-start="1"'))
    expect(el.strokeWidth).toBe(4)
    expect(el.strokeDash).toBe('dashed')
    expect(el.headStart).toBe(true)
    expect(el.extraAttrs).toEqual({})
  })
  test('무효 값은 kind 기본값으로 (관용 수용, 스펙 §7)', () => {
    const el = shapeOf(docOf(' data-stroke-width="0" data-stroke-dash="wavy" data-head-end="yes"', 'arrow'))
    expect(el.strokeWidth).toBe(2)
    expect(el.strokeDash).toBe('solid')
    expect(el.headEnd).toBe(true) // arrow 기본
    expect(el.extraAttrs).toEqual({})
  })
  test('arrow의 data-head-end="0"은 끝 머리를 끈다', () => {
    expect(shapeOf(docOf(' data-head-end="0"', 'arrow')).headEnd).toBe(false)
  })
  test('rect에 붙은 동명 속성은 extraAttrs 보존 (기존 규칙)', () => {
    const el = shapeOf(docOf(' data-stroke-width="4"', 'rect'))
    expect(el.extraAttrs['data-stroke-width']).toBe('4')
  })
  test('직렬화는 기본값과 다른 필드만 출력한다', () => {
    const base = docOf('')
    expect(serializeWebdeck(base)).not.toContain('data-stroke-width')
    const styled = docOf(' data-stroke-width="4" data-head-end="1"')
    const html = serializeWebdeck(styled)
    expect(html).toContain('data-stroke-width="4"')
    expect(html).toContain('data-head-end="1"')
    expect(html).not.toContain('data-stroke-dash')
    expect(html).not.toContain('data-head-start')
  })
  test('서식 조합 왕복 동등 (checkRoundTrip)', () => {
    expect(checkRoundTrip(docOf(' data-stroke-width="6" data-stroke-dash="dotted" data-head-start="1" data-head-end="1"', 'arrow'))).toBeNull()
  })
})
