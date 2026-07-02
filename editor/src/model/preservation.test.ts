import { describe, expect, test } from 'vitest'
import { parseWebdeck } from './parse.ts'
import { serializeWebdeck } from './serialize.ts'

function doc(body: string, bodyAttrs = ''): string {
  return `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title><style>.el{position:absolute}</style></head>
<body${bodyAttrs}>
<main class="deck" data-slide-width="1280" data-slide-height="720">${body}</main>
<script>/* v */</script>
</body>
</html>`
}

const BASIC_SLIDE = `<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>a</p></div></section>`

describe('왕복 보존 강화', () => {
  test('슬라이드의 커스텀 속성이 보존된다 (P7)', () => {
    const html = doc(`<section class="slide" data-bg="#ffffff" data-custom="x" id="s1"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>a</p></div></section>`)
    const m = parseWebdeck(html)
    expect(m.slides[0]!.extraAttrs).toEqual({ 'data-custom': 'x', id: 's1' })
    const out = serializeWebdeck(m)
    expect(out).toContain('data-custom="x"')
    expect(out).toContain('id="s1"')
    expect(parseWebdeck(out)).toEqual(m)
  })

  test('body 속성이 보존된다 (P1)', () => {
    const m = parseWebdeck(doc(BASIC_SLIDE, ' class="corp" data-env="prod"'))
    expect(m.bodyAttrs).toEqual({ class: 'corp', 'data-env': 'prod' })
    const out = serializeWebdeck(m)
    expect(out).toContain('<body class="corp" data-env="prod">')
    expect(parseWebdeck(out)).toEqual(m)
  })

  test('body 수준의 main/script 외 요소가 보존된다 (P1b)', () => {
    const extra = '<div class="watermark">사내용</div>'
    const html = doc(BASIC_SLIDE).replace('<script>', `${extra}\n<script>`)
    const m = parseWebdeck(html)
    expect(m.bodyExtra).toContain('watermark')
    const out = serializeWebdeck(m)
    expect(out).toContain(extra)
    expect(parseWebdeck(out)).toEqual(m)
  })

  test('img의 부가 속성이 있으면 el-image 전체가 opaque로 보존된다 (P2)', () => {
    const raw = `<div class="el el-image" style="left:0px; top:0px; width:100px; height:100px;"><img src="data:image/png;base64,AAA=" alt="a" loading="lazy" data-credit="x"></div>`
    const m = parseWebdeck(doc(`<section class="slide">${raw}</section>`))
    expect(m.slides[0]!.elements[0]!.type).toBe('opaque')
    expect(serializeWebdeck(m)).toContain('data-credit="x"')
  })

  test('el-image의 img 외 자식이 있으면 opaque로 보존된다 (P2b)', () => {
    const raw = `<div class="el el-image" style="left:0px; top:0px; width:100px; height:100px;"><img src="data:image/png;base64,AAA=" alt="a"><figcaption>캡션</figcaption></div>`
    const m = parseWebdeck(doc(`<section class="slide">${raw}</section>`))
    expect(m.slides[0]!.elements[0]!.type).toBe('opaque')
    expect(serializeWebdeck(m)).toContain('캡션')
  })

  test('el-shape의 자식이 있으면 opaque로 보존된다 (P3)', () => {
    const raw = `<div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:100px; height:100px;"><span>내용</span></div>`
    const m = parseWebdeck(doc(`<section class="slide">${raw}</section>`))
    expect(m.slides[0]!.elements[0]!.type).toBe('opaque')
    expect(serializeWebdeck(m)).toContain('<span>내용</span>')
  })

  test('부가 정보가 없는 문서는 기존과 동일하게 파싱된다 (회귀 없음)', () => {
    const m = parseWebdeck(doc(BASIC_SLIDE))
    expect(m.slides[0]!.elements[0]!.type).toBe('text')
    expect(m.slides[0]!.extraAttrs).toEqual({})
    expect(m.bodyAttrs).toEqual({})
    expect(m.bodyExtra).toBe('')
  })

  test('슬라이드·요소의 추가 class 토큰이 보존된다', () => {
    const html = doc(`<section class="slide intro cover"><div class="el el-text fancy" style="left:0px; top:0px; width:100px; height:50px;"><p>a</p></div></section>`)
    const m = parseWebdeck(html)
    expect(m.slides[0]!.extraClasses).toEqual(['intro', 'cover'])
    const el = m.slides[0]!.elements[0]!
    expect(el.type).toBe('text')
    if (el.type === 'text') expect(el.extraClasses).toEqual(['fancy'])
    const out = serializeWebdeck(m)
    expect(out).toContain('class="slide intro cover"')
    expect(out).toContain('class="el el-text fancy"')
    expect(parseWebdeck(out)).toEqual(m)
  })

  test('deck(main)의 추가 class·속성이 보존된다', () => {
    const html = doc('BASIC').replace(
      '<main class="deck" data-slide-width="1280" data-slide-height="720">',
      '<main class="deck presentation" data-slide-width="1280" data-slide-height="720" id="deck-1" data-owner="hr">',
    ).replace('BASIC', BASIC_SLIDE)
    const m = parseWebdeck(html)
    expect(m.deckExtraClasses).toEqual(['presentation'])
    expect(m.deckExtraAttrs).toEqual({ id: 'deck-1', 'data-owner': 'hr' })
    const out = serializeWebdeck(m)
    expect(out).toContain('class="deck presentation"')
    expect(out).toContain('id="deck-1"')
    expect(parseWebdeck(out)).toEqual(m)
  })

  test('class 토큰이 없는 문서는 빈 배열로 파싱된다 (회귀 없음)', () => {
    const m = parseWebdeck(doc(BASIC_SLIDE))
    expect(m.deckExtraClasses).toEqual([])
    expect(m.deckExtraAttrs).toEqual({})
    expect(m.slides[0]!.extraClasses).toEqual([])
  })
})
