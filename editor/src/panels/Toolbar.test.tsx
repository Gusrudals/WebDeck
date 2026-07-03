import { fireEvent, render } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import type { DeckDoc } from '../model/types.ts'
import { editorReducer, initialEditorState } from '../state/store.ts'
import type { EditorState } from '../state/store.ts'
import { Toolbar } from './Toolbar.tsx'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide" data-bg="#ffffff">
<div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>제목</p></div>
<div class="el el-shape" data-shape="rect" style="left:300px; top:300px; width:80px; height:80px;"></div>
</section>
</main></body></html>`)

const EL_TEXT = DOC.slides[0]!.elements[0]!.id
const EL_SHAPE = DOC.slides[0]!.elements[1]!.id

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

function renderToolbar(over: Partial<EditorState> = {}) {
  const dispatch = vi.fn()
  const utils = render(<Toolbar state={makeState(over)} dispatch={dispatch} idGen={idGen} />)
  return { dispatch, ...utils }
}

function appliedDoc(dispatch: ReturnType<typeof vi.fn>): DeckDoc | null {
  const action = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  return action ? (action.doc as DeckDoc) : null
}

beforeEach(() => {
  ;(document as unknown as { execCommand: unknown }).execCommand = vi.fn()
})

test('텍스트 상자 삽입은 새 요소를 추가하고 선택한다', () => {
  const { dispatch, getByRole } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '텍스트 상자' }))
  const call = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  expect(call).toBeTruthy()
  const els = (call.doc as DeckDoc).slides[0]!.elements
  expect(els).toHaveLength(3)
  const added = els[2]!
  expect(added.type).toBe('text')
  expect(call.select).toEqual([added.id])
})

test('도형 삽입은 사각형을 추가한다', () => {
  const { dispatch, getByRole } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '도형' }))
  const els = appliedDoc(dispatch)!.slides[0]!.elements
  expect(els[2]!.type).toBe('shape')
})

test('편집 중이 아니면 서식 버튼은 disabled다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_TEXT] })
  expect((getByRole('button', { name: '굵게' }) as HTMLButtonElement).disabled).toBe(true)
})

test('편집 중 굵게 클릭은 execCommand를 호출한다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.click(getByRole('button', { name: '굵게' }))
  expect(document.execCommand).toHaveBeenCalledWith('bold')
})

test('가로 가운데 정렬은 선택 요소의 left를 옮긴다', () => {
  const { dispatch, getByRole } = renderToolbar({ selectedIds: [EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '가로 가운데' }))
  expect(appliedDoc(dispatch)!.slides[0]!.elements[1]!).toMatchObject({ frame: { left: 600 } })
})

test('앞으로 보내기는 DOM 순서를 바꾼다', () => {
  const { dispatch, getByRole } = renderToolbar({ selectedIds: [EL_TEXT] })
  fireEvent.click(getByRole('button', { name: '앞으로' }))
  const els = appliedDoc(dispatch)!.slides[0]!.elements
  expect(els[1]!.id).toBe(EL_TEXT)
})

test('맨 뒤에서 뒤로 보내기는 dispatch하지 않는다 (경계 no-op)', () => {
  const { dispatch, getByRole } = renderToolbar({ selectedIds: [EL_TEXT] })
  fireEvent.click(getByRole('button', { name: '뒤로' }))
  expect(appliedDoc(dispatch)).toBeNull()
})

test('삭제는 선택 요소를 지우고 선택을 비운다', () => {
  const { dispatch, getByRole } = renderToolbar({ selectedIds: [EL_TEXT, EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '삭제' }))
  const call = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  expect((call.doc as DeckDoc).slides[0]!.elements).toHaveLength(0)
  expect(call.select).toEqual([])
})
