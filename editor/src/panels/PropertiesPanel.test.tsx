import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { DeckDoc } from '../model/types.ts'
import { parseWebdeck } from '../model/parse.ts'
import { editorReducer, initialEditorState } from '../state/store.ts'
import type { EditorState } from '../state/store.ts'
import { PropertiesPanel } from './PropertiesPanel.tsx'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide" data-bg="#ffffff">
<div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>제목</p></div>
<div class="el el-shape" data-shape="rect" style="left:300px; top:300px; width:80px; height:80px; background:red;"></div>
</section>
</main></body></html>`)

const EL_TEXT = DOC.slides[0]!.elements[0]!.id
const EL_SHAPE = DOC.slides[0]!.elements[1]!.id

function makeState(over: Partial<EditorState> = {}): EditorState {
  const opened = editorReducer(initialEditorState, {
    type: 'OPEN_SUCCESS',
    doc: DOC,
    fileName: 't.html',
    fileHandle: null,
  })
  return { ...opened, ...over }
}

function renderPanel(over: Partial<EditorState> = {}) {
  const dispatch = vi.fn()
  const utils = render(<PropertiesPanel state={makeState(over)} dispatch={dispatch} />)
  return { dispatch, ...utils }
}

function appliedDoc(dispatch: ReturnType<typeof vi.fn>): DeckDoc | null {
  const action = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  return action ? (action.doc as DeckDoc) : null
}

test('선택이 없으면 슬라이드 모드 — 배경색 입력을 보여준다', () => {
  const { getByText, getByLabelText } = renderPanel()
  expect(getByText('슬라이드')).toBeTruthy()
  expect(getByLabelText('배경색')).toBeTruthy()
})

test('배경색 변경은 blur 시 1회만 APPLY_DOC 한다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  const input = getByLabelText('배경색')
  fireEvent.change(input, { target: { value: '#ff0000' } })
  fireEvent.change(input, { target: { value: '#00ff00' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.blur(input)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.bg).toBe('#00ff00')
})

test('배경색을 바꾸지 않고 blur하면 dispatch하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  fireEvent.blur(getByLabelText('배경색'))
  expect(dispatch).not.toHaveBeenCalled()
})

test('요소 선택 시 요소 모드 헤딩을 보여주고 배경색 입력은 없다', () => {
  const { getByText, queryByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  expect(getByText('요소')).toBeTruthy()
  expect(queryByLabelText('배경색')).toBeNull()
})

test('다중 선택 시 개수를 표시한다', () => {
  const { getByText } = renderPanel({ selectedIds: [EL_TEXT, EL_SHAPE] })
  expect(getByText('요소 2개')).toBeTruthy()
})

test('doc이 없으면 빈 패널을 렌더링한다', () => {
  const dispatch = vi.fn()
  const { container, queryByText } = render(<PropertiesPanel state={initialEditorState} dispatch={dispatch} />)
  expect(container.querySelector('.props')).toBeTruthy()
  expect(queryByText('슬라이드')).toBeNull()
})
