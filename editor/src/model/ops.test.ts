import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'
import {
  addElement,
  addSlide,
  createShapeElement,
  createTextElement,
  duplicateSlide,
  moveElement,
  moveElementZ,
  moveSlide,
  removeElement,
  removeSlide,
  setElementFrame,
  setElementRotation,
  setElementStyle,
  setSlideNotes,
  setSlideTransition,
  setSlideBg,
  setTextHtml,
} from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'
import { serializeWebdeck } from './serialize.ts'
import type { DeckDoc, Slide } from './types.ts'

function fixture(): DeckDoc {
  const gen = createIdGen()
  const slide: Slide = {
    id: gen(), // wd-1
    bg: '#ffffff',
    transition: null,
    notes: '',
    extraAttrs: {},
    extraClasses: ['intro'],
    elements: [
      { type: 'shape', id: gen(), frame: { left: 0, top: 0, width: 100, height: 50 }, rotation: 0, extraStyle: {}, extraAttrs: {}, extraClasses: [], shape: 'rect', strokeWidth: 2, strokeDash: 'solid', headStart: false, headEnd: false }, // wd-2
      { type: 'text', id: gen(), frame: { left: 10, top: 60, width: 200, height: 80 }, rotation: 0, extraStyle: {}, extraAttrs: {}, extraClasses: [], html: '<p>a</p>' }, // wd-3
      { type: 'opaque', id: gen(), html: '<div class="x"></div>' }, // wd-4
    ],
  }
  return { title: 't', slideWidth: 1280, slideHeight: 720, deckExtraClasses: [], deckExtraAttrs: {}, headExtra: '', bodyAttrs: {}, bodyExtra: '', bodyScript: '', htmlAttrs: { 'data-webdeck-version': '1' }, slides: [slide] }
}

describe('요소 커맨드', () => {
  test('moveElement는 프레임을 이동하고 원본을 변경하지 않는다', () => {
    const doc = fixture()
    const next = moveElement(doc, 'wd-1', 'wd-3', 5, -10)
    expect(next.slides[0]!.elements[1]).toMatchObject({ frame: { left: 15, top: 50, width: 200, height: 80 } })
    expect(doc.slides[0]!.elements[1]).toMatchObject({ frame: { left: 10, top: 60 } })
    expect(next).not.toBe(doc)
  })

  test('opaque 요소는 이동할 수 없다', () => {
    expect(() => moveElement(fixture(), 'wd-1', 'wd-4', 1, 1)).toThrow('편집할 수 없는 요소')
  })

  test('setElementFrame / setTextHtml', () => {
    const doc = fixture()
    const framed = setElementFrame(doc, 'wd-1', 'wd-2', { left: 1, top: 2, width: 3, height: 4 })
    expect(framed.slides[0]!.elements[0]).toMatchObject({ frame: { left: 1, top: 2, width: 3, height: 4 } })
    const texted = setTextHtml(doc, 'wd-1', 'wd-3', '<p>b</p>')
    expect(texted.slides[0]!.elements[1]).toMatchObject({ html: '<p>b</p>' })
    expect(() => setTextHtml(doc, 'wd-1', 'wd-2', '<p>b</p>')).toThrow('텍스트 요소가 아닙니다')
  })

  test('addElement / removeElement', () => {
    const doc = fixture()
    const gen = createIdGen('new')
    const added = addElement(doc, 'wd-1', createTextElement(gen, { left: 0, top: 0, width: 10, height: 10 }, '<p>n</p>'))
    expect(added.slides[0]!.elements).toHaveLength(4)
    const removed = removeElement(added, 'wd-1', 'new-1')
    expect(removed.slides[0]!.elements).toHaveLength(3)
    expect(() => removeElement(doc, 'wd-1', 'no-such')).toThrow('요소를 찾을 수 없습니다')
  })

  test('moveElementZ — DOM 순서가 z-order다', () => {
    const doc = fixture()
    const ids = (d: DeckDoc) => d.slides[0]!.elements.map((e) => e.id)
    expect(ids(moveElementZ(doc, 'wd-1', 'wd-2', 'forward'))).toEqual(['wd-3', 'wd-2', 'wd-4'])
    expect(ids(moveElementZ(doc, 'wd-1', 'wd-4', 'back'))).toEqual(['wd-4', 'wd-2', 'wd-3'])
    expect(ids(moveElementZ(doc, 'wd-1', 'wd-2', 'front'))).toEqual(['wd-3', 'wd-4', 'wd-2'])
    expect(ids(moveElementZ(doc, 'wd-1', 'wd-2', 'backward'))).toEqual(ids(doc)) // 이미 맨 뒤
    expect(moveElementZ(doc, 'wd-1', 'wd-2', 'backward')).toBe(doc) // 경계 no-op은 같은 참조
  })
})

describe('슬라이드 커맨드', () => {
  test('addSlide는 빈 흰 슬라이드를 삽입한다', () => {
    const doc = fixture()
    const next = addSlide(doc, createIdGen('s'), 0)
    expect(next.slides).toHaveLength(2)
    expect(next.slides[0]).toMatchObject({ id: 's-1', bg: '#ffffff', elements: [] })
  })

  test('duplicateSlide는 새 id로 깊은 복제를 만든다', () => {
    const doc = fixture()
    const next = duplicateSlide(doc, 'wd-1', createIdGen('c'))
    expect(next.slides).toHaveLength(2)
    expect(next.slides[1]!.id).toBe('c-1')
    expect(next.slides[1]!.elements.map((e) => e.id)).toEqual(['c-2', 'c-3', 'c-4'])
    expect(next.slides[1]!.elements[1]).toMatchObject({ type: 'text', html: '<p>a</p>' })
    expect(next.slides[1]!.elements[1]).not.toBe(doc.slides[0]!.elements[1])
    expect(next.slides[1]!.extraClasses).toEqual(['intro'])
    expect(next.slides[1]!.extraClasses).not.toBe(doc.slides[0]!.extraClasses)
  })

  test('removeSlide / moveSlide / setSlideBg', () => {
    const doc = addSlide(fixture(), createIdGen('s'), 1) // [wd-1, s-1]
    expect(removeSlide(doc, 'wd-1').slides.map((s) => s.id)).toEqual(['s-1'])
    expect(() => removeSlide(removeSlide(doc, 'wd-1'), 's-1')).toThrow('마지막 슬라이드')
    expect(moveSlide(doc, 0, 1).slides.map((s) => s.id)).toEqual(['s-1', 'wd-1'])
    expect(setSlideBg(doc, 'wd-1', '#000000').slides[0]!.bg).toBe('#000000')
  })

  test('moveSlide 범위 초과는 오류', () => {
    const doc = fixture()
    expect(() => moveSlide(doc, 0, 5)).toThrow('범위를 벗어났습니다')
    expect(() => moveSlide(doc, -1, 0)).toThrow('범위를 벗어났습니다')
  })
})

describe('setElementStyle', () => {
  test('새 키를 추가하고 기존 키와 순서를 유지한다', () => {
    const doc = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:10px; height:10px; background:red;"></div></section>
</main></body></html>`)
    const slide = doc.slides[0]!
    const el = slide.elements[0]!
    const out = setElementStyle(doc, slide.id, el.id, { border: '1px solid #000' })
    const outEl = out.slides[0]!.elements[0]!
    if (outEl.type === 'opaque') throw new Error('unexpected')
    expect(outEl.extraStyle).toEqual({ background: 'red', border: '1px solid #000' })
    expect(Object.keys(outEl.extraStyle)).toEqual(['background', 'border'])
  })

  test('null 값은 키를 삭제한다', () => {
    const doc = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:10px; height:10px; background:red;"></div></section>
</main></body></html>`)
    const slide = doc.slides[0]!
    const el = slide.elements[0]!
    const out = setElementStyle(doc, slide.id, el.id, { background: null })
    const outEl = out.slides[0]!.elements[0]!
    if (outEl.type === 'opaque') throw new Error('unexpected')
    expect(outEl.extraStyle).toEqual({})
  })

  test('원본 doc는 불변이다', () => {
    const doc = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:10px; height:10px;"></div></section>
</main></body></html>`)
    const slide = doc.slides[0]!
    const el = slide.elements[0]!
    setElementStyle(doc, slide.id, el.id, { opacity: '0.5' })
    if (el.type === 'opaque') throw new Error('unexpected')
    expect(el.extraStyle).toEqual({})
  })
})

const TWO_SLIDE_DOC = `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
<section class="slide"></section>
</main></body></html>`

describe('setSlideTransition / setSlideNotes', () => {
  test('해당 슬라이드만 갱신하고 새 문서를 반환한다', () => {
    const doc = parseWebdeck(TWO_SLIDE_DOC)
    const id = doc.slides[0]!.id
    const d1 = setSlideTransition(doc, id, 'fade')
    expect(d1).not.toBe(doc)
    expect(d1.slides[0]!.transition).toBe('fade')
    expect(d1.slides[1]!.transition).toBeNull()
    const d2 = setSlideNotes(d1, id, '멘트')
    expect(d2.slides[0]!.notes).toBe('멘트')
  })

  test('duplicateSlide는 transition·notes를 복제한다', () => {
    const base = parseWebdeck(TWO_SLIDE_DOC)
    const id = base.slides[0]!.id
    const doc = setSlideNotes(setSlideTransition(base, id, 'push'), id, 'n')
    const dup = duplicateSlide(doc, id, createIdGen('d'))
    expect(dup.slides[1]!.transition).toBe('push')
    expect(dup.slides[1]!.notes).toBe('n')
  })

  test('addSlide 새 슬라이드는 transition null·notes 빈 문자열', () => {
    const doc = addSlide(parseWebdeck(TWO_SLIDE_DOC), createIdGen('a'))
    expect(doc.slides.at(-1)!.transition).toBeNull()
    expect(doc.slides.at(-1)!.notes).toBe('')
  })

  test('setSlideTransition은 extraAttrs의 미지원 data-transition 잔재를 제거한다 (중복 속성 방지)', () => {
    const doc = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide" data-transition="zoom"></section>
</main></body></html>`)
    const id = doc.slides[0]!.id
    const out = setSlideTransition(doc, id, 'fade')
    expect(out.slides[0]!.transition).toBe('fade')
    expect(out.slides[0]!.extraAttrs['data-transition']).toBeUndefined()
    expect(checkRoundTrip(out)).toBeNull()
    expect(serializeWebdeck(out).match(/data-transition/g)).toHaveLength(1)
  })
})

const P6_WRAP = (section: string) => `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
${section}
</main></body></html>`

describe('setElementRotation', () => {
  test('정규화해 설정하고 extraStyle의 transform 잔재를 제거한다', () => {
    const doc = parseWebdeck(P6_WRAP('<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px; transform: rotate(5deg) scale(2);"><p>x</p></div></section>'))
    const id = doc.slides[0]!.elements[0]!.id
    const out = setElementRotation(doc, doc.slides[0]!.id, id, 370)
    const el = out.slides[0]!.elements[0]!
    if (el.type !== 'text') return
    expect(el.rotation).toBe(10)
    expect(el.extraStyle['transform']).toBeUndefined()
    expect(checkRoundTrip(out)).toBeNull()
    expect(serializeWebdeck(out).match(/transform/g)).toHaveLength(1)
  })
})
