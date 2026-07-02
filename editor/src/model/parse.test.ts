import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { WebdeckParseError, parseWebdeck } from './parse.ts'

const TEMPLATES = import.meta.dirname ? `${import.meta.dirname}/../../../templates/` : fileURLToPath(new URL('../../../templates/', import.meta.url))

function docWith(slides: string, htmlAttrs = ' data-webdeck-version="1"'): string {
  return `<!DOCTYPE html>
<html lang="ko"${htmlAttrs}>
<head><meta charset="utf-8"><title>테스트</title><style>.el{position:absolute}</style></head>
<body>
<main class="deck" data-slide-width="1280" data-slide-height="720">${slides}</main>
<script>/* viewer */</script>
</body>
</html>`
}

describe('parseWebdeck', () => {
  test('버전 속성이 없으면 WebdeckParseError', () => {
    expect(() => parseWebdeck(docWith('<section class="slide"></section>', ''))).toThrow(WebdeckParseError)
  })

  test('deck이 없으면 WebdeckParseError', () => {
    expect(() => parseWebdeck('<!DOCTYPE html><html data-webdeck-version="1"><body></body></html>')).toThrow(
      WebdeckParseError,
    )
  })

  test('문서 메타를 파싱한다', () => {
    const doc = parseWebdeck(docWith('<section class="slide" data-bg="#ffffff"></section>'))
    expect(doc.title).toBe('테스트')
    expect(doc.slideWidth).toBe(1280)
    expect(doc.slideHeight).toBe(720)
    expect(doc.htmlAttrs['data-webdeck-version']).toBe('1')
    expect(doc.htmlAttrs['lang']).toBe('ko')
    expect(doc.headExtra).toContain('<style>')
    expect(doc.bodyScript).toContain('viewer')
    expect(doc.slides).toHaveLength(1)
    expect(doc.slides[0]!.bg).toBe('#ffffff')
  })

  test('요소 3종을 파싱한다', () => {
    const doc = parseWebdeck(
      docWith(`<section class="slide">
        <div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:100px; height:50px; background:var(--wd-accent);"></div>
        <div class="el el-text" style="left:10px; top:60px; width:200px; height:80px;" data-note="x"><p>안녕</p></div>
        <div class="el el-image" style="left:10px; top:150px; width:100px; height:100px;"><img src="data:image/png;base64,AAA=" alt="그림" style="width:100%; height:100%;"></div>
      </section>`),
    )
    const [shape, text, image] = doc.slides[0]!.elements
    expect(shape).toMatchObject({ type: 'shape', shape: 'rect', frame: { left: 0, top: 0, width: 100, height: 50 }, extraStyle: { background: 'var(--wd-accent)' } })
    expect(text).toMatchObject({ type: 'text', html: '<p>안녕</p>', extraAttrs: { 'data-note': 'x' } })
    expect(image).toMatchObject({ type: 'image', src: 'data:image/png;base64,AAA=', alt: '그림', imgStyle: 'width:100%; height:100%;' })
  })

  test('이해할 수 없는 요소는 opaque로 원문 보존한다', () => {
    const raw = '<div class="fancy-widget" data-x="1"><span>?</span></div>'
    const doc = parseWebdeck(docWith(`<section class="slide">${raw}</section>`))
    const el = doc.slides[0]!.elements[0]!
    expect(el.type).toBe('opaque')
    expect(el.type === 'opaque' && el.html).toBe(raw)
  })

  test('frame이 불완전한 .el도 opaque로 보존한다', () => {
    const doc = parseWebdeck(docWith(`<section class="slide"><div class="el el-text" style="left:10px;"><p>x</p></div></section>`))
    expect(doc.slides[0]!.elements[0]!.type).toBe('opaque')
  })

  test('id는 문서 순서대로 결정적으로 생성된다', () => {
    const html = docWith('<section class="slide"><div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:1px; height:1px;"></div></section>')
    const a = parseWebdeck(html)
    const b = parseWebdeck(html)
    expect(a).toEqual(b)
  })

  test('실제 템플릿 3종을 파싱한다', () => {
    for (const name of ['minimal.html', 'business-report.html', 'project-proposal.html']) {
      const doc = parseWebdeck(readFileSync(`${TEMPLATES}${name}`, 'utf8'))
      expect(doc.slides.length).toBeGreaterThanOrEqual(2)
      expect(doc.slides.flatMap((s) => s.elements).every((e) => e.type !== 'opaque')).toBe(true)
    }
  })
})
