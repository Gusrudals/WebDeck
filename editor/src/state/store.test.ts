import { describe, expect, test } from 'vitest'
import type { DeckDoc } from '../model/types.ts'
import { countOpaque, editorReducer, initialEditorState } from './store.ts'

function doc(slideCount = 3, opaquePerSlide = 0): DeckDoc {
  return {
    title: 't',
    slideWidth: 1280,
    slideHeight: 720,
    deckExtraClasses: [],
    deckExtraAttrs: {},
    headExtra: '',
    bodyAttrs: {},
    bodyExtra: '',
    bodyScript: '',
    htmlAttrs: {},
    slides: Array.from({ length: slideCount }, (_, i) => ({
      id: `s-${i}`,
      bg: null,
      extraAttrs: {},
      extraClasses: [],
      elements: Array.from({ length: opaquePerSlide }, (_, j) => ({
        type: 'opaque' as const,
        id: `o-${i}-${j}`,
        html: '<div></div>',
      })),
    })),
  }
}

describe('editorReducer', () => {
  test('OPEN_SUCCESS는 문서·히스토리·opaque 수를 설정하고 오류를 지운다', () => {
    const errored = editorReducer(initialEditorState, { type: 'OPEN_ERROR', message: 'x' })
    const d = doc(3, 2)
    const state = editorReducer(errored, { type: 'OPEN_SUCCESS', doc: d, fileName: 'a.html', fileHandle: null })
    expect(state.doc).toBe(d)
    expect(state.history!.present).toBe(d)
    expect(state.fileName).toBe('a.html')
    expect(state.currentSlideIndex).toBe(0)
    expect(state.opaqueCount).toBe(6)
    expect(state.loadError).toBeNull()
  })

  test('OPEN_ERROR는 기존 문서를 유지한 채 오류만 설정한다', () => {
    const opened = editorReducer(initialEditorState, { type: 'OPEN_SUCCESS', doc: doc(), fileName: 'a.html', fileHandle: null })
    const state = editorReducer(opened, { type: 'OPEN_ERROR', message: '문서를 해석할 수 없습니다' })
    expect(state.doc).toBe(opened.doc)
    expect(state.loadError).toBe('문서를 해석할 수 없습니다')
  })

  test('SELECT_SLIDE는 범위로 클램프한다', () => {
    const opened = editorReducer(initialEditorState, { type: 'OPEN_SUCCESS', doc: doc(3), fileName: 'a.html', fileHandle: null })
    expect(editorReducer(opened, { type: 'SELECT_SLIDE', index: 2 }).currentSlideIndex).toBe(2)
    expect(editorReducer(opened, { type: 'SELECT_SLIDE', index: 99 }).currentSlideIndex).toBe(2)
    expect(editorReducer(opened, { type: 'SELECT_SLIDE', index: -1 }).currentSlideIndex).toBe(0)
    expect(editorReducer(initialEditorState, { type: 'SELECT_SLIDE', index: 1 })).toBe(initialEditorState)
  })
})

test('countOpaque는 전 슬라이드의 opaque 요소를 센다', () => {
  expect(countOpaque(doc(2, 3))).toBe(6)
  expect(countOpaque(doc(2, 0))).toBe(0)
})
