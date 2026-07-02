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
  setSlideBg,
  setTextHtml,
} from './ops.ts'
import type { DeckDoc, Slide } from './types.ts'

function fixture(): DeckDoc {
  const gen = createIdGen()
  const slide: Slide = {
    id: gen(), // wd-1
    bg: '#ffffff',
    extraAttrs: {},
    elements: [
      { type: 'shape', id: gen(), frame: { left: 0, top: 0, width: 100, height: 50 }, extraStyle: {}, extraAttrs: {}, shape: 'rect' }, // wd-2
      { type: 'text', id: gen(), frame: { left: 10, top: 60, width: 200, height: 80 }, extraStyle: {}, extraAttrs: {}, html: '<p>a</p>' }, // wd-3
      { type: 'opaque', id: gen(), html: '<div class="x"></div>' }, // wd-4
    ],
  }
  return { title: 't', slideWidth: 1280, slideHeight: 720, headExtra: '', bodyAttrs: {}, bodyExtra: '', bodyScript: '', htmlAttrs: { 'data-webdeck-version': '1' }, slides: [slide] }
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
