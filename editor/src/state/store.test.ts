import { describe, expect, test } from 'vitest'
import { moveElement } from '../model/ops.ts'
import { parseWebdeck } from '../model/parse.ts'
import type { DeckDoc } from '../model/types.ts'
import { countOpaque, editorReducer, initialEditorState, isDirty } from './store.ts'
import type { EditorState } from './store.ts'

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
      transition: null,
      notes: '',
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
    expect(state.savedDoc).toBe(d)
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

const TWO_SLIDES = `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>a</p></div></section>
<section class="slide"></section>
</main></body></html>`

function opened(): EditorState {
  return editorReducer(initialEditorState, {
    type: 'OPEN_SUCCESS',
    doc: parseWebdeck(TWO_SLIDES),
    fileName: 't.html',
    fileHandle: null,
  })
}

describe('편집 상태', () => {
  test('OPEN_SUCCESS는 savedDoc을 설정하고 dirty가 아니다', () => {
    const s = opened()
    expect(s.savedDoc).toBe(s.doc)
    expect(isDirty(s)).toBe(false)
  })

  test('APPLY_DOC은 history에 push하고 dirty가 된다', () => {
    const s0 = opened()
    const elId = s0.doc!.slides[0]!.elements[0]!.id
    const s1 = editorReducer(s0, { type: 'APPLY_DOC', doc: moveElement(s0.doc!, s0.doc!.slides[0]!.id, elId, 10, 0) })
    expect(s1.history!.past).toHaveLength(1)
    expect(isDirty(s1)).toBe(true)
  })

  test('UNDO/REDO는 doc을 되돌리고 선택·텍스트 편집을 정리한다', () => {
    const s0 = opened()
    const slide = s0.doc!.slides[0]!
    const elId = slide.elements[0]!.id
    let s = editorReducer(s0, { type: 'SELECT_ELEMENTS', ids: [elId] })
    s = editorReducer(s, { type: 'APPLY_DOC', doc: moveElement(s.doc!, slide.id, elId, 10, 0) })
    s = editorReducer(s, { type: 'START_TEXT_EDIT', id: elId })
    s = editorReducer(s, { type: 'UNDO' })
    expect(s.doc).toBe(s0.doc)
    expect(s.editingTextId).toBeNull()
    s = editorReducer(s, { type: 'REDO' })
    expect(s.doc!.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 10 } })
  })

  test('TOGGLE_SELECT는 추가/제거를 오간다', () => {
    let s = editorReducer(opened(), { type: 'TOGGLE_SELECT', id: 'a' })
    expect(s.selectedIds).toEqual(['a'])
    s = editorReducer(s, { type: 'TOGGLE_SELECT', id: 'a' })
    expect(s.selectedIds).toEqual([])
  })

  test('SELECT_SLIDE는 선택과 텍스트 편집을 해제한다', () => {
    let s = editorReducer(opened(), { type: 'SELECT_ELEMENTS', ids: ['x'] })
    s = editorReducer(s, { type: 'START_TEXT_EDIT', id: 'x' })
    s = editorReducer(s, { type: 'SELECT_SLIDE', index: 1 })
    expect(s.currentSlideIndex).toBe(1)
    expect(s.selectedIds).toEqual([])
    expect(s.editingTextId).toBeNull()
  })

  test('APPLY_DOC에서 사라진 요소는 선택에서 걷어낸다', () => {
    const s0 = opened()
    const slide = s0.doc!.slides[0]!
    const elId = slide.elements[0]!.id
    let s = editorReducer(s0, { type: 'SELECT_ELEMENTS', ids: [elId] })
    const removed = { ...s.doc!, slides: [{ ...slide, elements: [] }, s.doc!.slides[1]!] }
    s = editorReducer(s, { type: 'APPLY_DOC', doc: removed })
    expect(s.selectedIds).toEqual([])
  })

  test('MARK_SAVED는 dirty를 해제하고 SAVE_ERROR는 메시지를 남긴다', () => {
    const s0 = opened()
    const elId = s0.doc!.slides[0]!.elements[0]!.id
    let s = editorReducer(s0, { type: 'APPLY_DOC', doc: moveElement(s0.doc!, s0.doc!.slides[0]!.id, elId, 1, 1) })
    s = editorReducer(s, { type: 'MARK_SAVED', doc: s.doc! })
    expect(isDirty(s)).toBe(false)
    s = editorReducer(s, { type: 'SAVE_ERROR', message: '실패' })
    expect(s.saveError).toBe('실패')
  })

  test('SAVE_ERROR 후 APPLY_DOC하면 saveError가 지워진다', () => {
    const s0 = opened()
    const elId = s0.doc!.slides[0]!.elements[0]!.id
    let s = editorReducer(s0, { type: 'SAVE_ERROR', message: '실패' })
    expect(s.saveError).toBe('실패')
    s = editorReducer(s, { type: 'APPLY_DOC', doc: moveElement(s.doc!, s.doc!.slides[0]!.id, elId, 1, 1) })
    expect(s.saveError).toBeNull()
  })

  test('START_DOC은 핸들 없이 시작하고 항상 dirty다', () => {
    const doc_val = parseWebdeck(TWO_SLIDES)
    const s = editorReducer(initialEditorState, { type: 'START_DOC', doc: doc_val, fileName: '제목 없음.html' })
    expect(s.doc).toBe(doc_val)
    expect(s.fileName).toBe('제목 없음.html')
    expect(s.fileHandle).toBeNull()
    expect(s.savedDoc).toBeNull()
    expect(isDirty(s)).toBe(true)
    expect(s.history!.past).toHaveLength(0)
    expect(s.loadError).toBeNull()
  })

  test('SAVED_AS는 파일명·핸들을 교체하고 dirty를 해제한다', () => {
    const s0 = opened()
    const elId = s0.doc!.slides[0]!.elements[0]!.id
    let s = editorReducer(s0, { type: 'APPLY_DOC', doc: moveElement(s0.doc!, s0.doc!.slides[0]!.id, elId, 1, 1) })
    expect(isDirty(s)).toBe(true)
    const handle = {} as FileSystemFileHandle
    s = editorReducer(s, { type: 'SAVED_AS', doc: s.doc!, fileName: 'copy.html', fileHandle: handle })
    expect(s.fileName).toBe('copy.html')
    expect(s.fileHandle).toBe(handle)
    expect(isDirty(s)).toBe(false)
    expect(s.saveError).toBeNull()
  })
})
