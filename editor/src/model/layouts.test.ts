import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'
import { LAYOUTS } from './layouts.ts'
import { addSlide } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'

const BASE = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
</main></body></html>`)

test('레이아웃은 4종이고 라벨이 정확하다', () => {
  expect(LAYOUTS.map((l) => l.key)).toEqual(['blank', 'cover', 'title-body', 'two-col'])
  expect(LAYOUTS.map((l) => l.label)).toEqual(['빈 장', '표지', '제목+본문', '2단'])
})

describe.each(LAYOUTS)('레이아웃 $key', (layout) => {
  test('요소가 캔버스(1280×720) 안에 있고 왕복을 통과한다', () => {
    const els = layout.build(createIdGen('L'))
    for (const el of els) {
      expect(el.frame.left).toBeGreaterThanOrEqual(0)
      expect(el.frame.top).toBeGreaterThanOrEqual(0)
      expect(el.frame.left + el.frame.width).toBeLessThanOrEqual(1280)
      expect(el.frame.top + el.frame.height).toBeLessThanOrEqual(720)
    }
    const doc = addSlide(BASE, createIdGen('s'), 1, els)
    expect(doc.slides).toHaveLength(2)
    expect(doc.slides[1]!.elements).toHaveLength(els.length)
    expect(checkRoundTrip(doc)).toBeNull()
  })
})

test('blank 외 레이아웃은 var(--wd-*) 테마 참조를 포함한다', () => {
  for (const layout of LAYOUTS.filter((l) => l.key !== 'blank')) {
    const els = layout.build(createIdGen('v'))
    const all = JSON.stringify(els)
    expect(all, layout.key).toContain('var(--wd-')
  }
})

test('addSlide는 elements 없이도 기존과 동일하다 (하위 호환)', () => {
  const doc = addSlide(BASE, createIdGen('a'))
  expect(doc.slides[1]!.elements).toEqual([])
})
