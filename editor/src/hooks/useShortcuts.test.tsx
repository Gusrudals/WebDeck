import { fireEvent, render } from '@testing-library/react'
import type { Dispatch } from 'react'
import { expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import type { DeckDoc, KnownElement } from '../model/types.ts'
import { editorReducer, initialEditorState } from '../state/store.ts'
import type { EditorAction, EditorState } from '../state/store.ts'
import { useShortcuts } from './useShortcuts.ts'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>제목</p></div></section>
</main></body></html>`)

const EL_TEXT = DOC.slides[0]!.elements[0]!.id

let seq = 0
const idGen = () => `n-${++seq}`

function makeState(over: Partial<EditorState> = {}): EditorState {
  const opened = editorReducer(initialEditorState, {
    type: 'OPEN_SUCCESS',
    doc: DOC,
    fileName: 't.html',
    fileHandle: null,
  })
  return { ...opened, ...over }
}

function Harness({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  useShortcuts(state, dispatch, idGen)
  return <input aria-label="더미 입력" />
}

function setup(over: Partial<EditorState> = {}) {
  const dispatch = vi.fn()
  const utils = render(<Harness state={makeState(over)} dispatch={dispatch} />)
  return { dispatch, ...utils }
}

function appliedDoc(dispatch: ReturnType<typeof vi.fn>): DeckDoc | null {
  const action = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  return action ? (action.doc as DeckDoc) : null
}

test('Ctrl+Z는 UNDO, Ctrl+Shift+Z와 Ctrl+Y는 REDO', () => {
  const { dispatch } = setup()
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(dispatch).toHaveBeenCalledWith({ type: 'UNDO' })
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
  fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'REDO')).toHaveLength(2)
})

test('Delete는 선택 요소를 삭제한다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(window, { key: 'Delete' })
  expect(appliedDoc(dispatch)!.slides[0]!.elements).toHaveLength(0)
})

test('방향키는 1px, Shift+방향키는 10px 이동한다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(window, { key: 'ArrowRight' })
  expect(appliedDoc(dispatch)!.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 1 } })
  dispatch.mockClear()
  fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true })
  expect(appliedDoc(dispatch)!.slides[0]!.elements[0]!).toMatchObject({ frame: { top: 10 } })
})

test('Ctrl+C는 선택 요소를 클립보드에 담는다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
  const call = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'SET_CLIPBOARD')
  expect(call.elements).toHaveLength(1)
  expect(call.elements[0].id).toBe(EL_TEXT)
})

test('Ctrl+V는 오프셋과 새 id로 붙여넣고 선택한다', () => {
  const el = DOC.slides[0]!.elements[0]! as KnownElement
  const { dispatch } = setup({ clipboard: [structuredClone(el)] })
  fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
  const call = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  const els = (call.doc as DeckDoc).slides[0]!.elements
  expect(els).toHaveLength(2)
  expect(els[1]!).toMatchObject({ frame: { left: 16, top: 16 } })
  expect(els[1]!.id).not.toBe(EL_TEXT)
  expect(call.select).toEqual([els[1]!.id])
})

test('Ctrl+D는 선택 요소를 복제한다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
  expect(appliedDoc(dispatch)!.slides[0]!.elements).toHaveLength(2)
})

test('텍스트 편집 중에는 아무것도 dispatch하지 않는다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  fireEvent.keyDown(window, { key: 'Delete' })
  expect(dispatch).not.toHaveBeenCalled()
})

test('INPUT에 포커스가 있으면 무시한다', () => {
  const { dispatch, getByLabelText } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(getByLabelText('더미 입력'), { key: 'Delete' })
  expect(dispatch).not.toHaveBeenCalled()
})

test('Escape는 선택을 해제한다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_SELECTION' })
})
