import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import { CanvasArea } from './CanvasArea.tsx'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>제목</p></div>
<div class="el el-shape" data-shape="rect" style="left:300px; top:300px; width:80px; height:80px;"></div>
</section>
</main></body></html>`)

const EL_TEXT = DOC.slides[0]!.elements[0]!.id
const EL_SHAPE = DOC.slides[0]!.elements[1]!.id

function renderCanvas(selectedIds: string[] = []) {
  const dispatch = vi.fn()
  const utils = render(
    <CanvasArea doc={DOC} slideIndex={0} selectedIds={selectedIds} editingTextId={null} dispatch={dispatch} />,
  )
  return { dispatch, ...utils }
}

test('요소 클릭은 단일 선택을 dispatch한다', () => {
  const { dispatch, getByText } = renderCanvas()
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  expect(dispatch).toHaveBeenCalledWith({ type: 'SELECT_ELEMENTS', ids: [EL_TEXT] })
})

test('Shift+클릭은 토글을 dispatch한다', () => {
  const { dispatch, getByText } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(getByText('제목'), { shiftKey: true, clientX: 10, clientY: 10 })
  expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_SELECT', id: EL_TEXT })
})

test('이미 선택된 요소 클릭은 선택을 유지한다', () => {
  const { dispatch, getByText } = renderCanvas([EL_TEXT])
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  // 선택 관련 액션이 하나도 dispatch되지 않아야 한다 (다중 드래그 준비를 위한 선택 유지)
  const types = dispatch.mock.calls.map(([action]) => (action as { type: string }).type)
  expect(types).not.toContain('SELECT_ELEMENTS')
  expect(types).not.toContain('TOGGLE_SELECT')
  expect(types).not.toContain('CLEAR_SELECTION')
})

test('텍스트 편집 중에는 요소 클릭이 선택을 바꾸지 않는다', () => {
  const dispatch = vi.fn()
  const { container } = render(
    <CanvasArea doc={DOC} slideIndex={0} selectedIds={[EL_TEXT]} editingTextId={EL_TEXT} dispatch={dispatch} />,
  )
  fireEvent.pointerDown(container.querySelector('.el-shape')!, { clientX: 310, clientY: 310 })
  expect(dispatch).not.toHaveBeenCalled()
})

test('빈 영역 클릭은 선택을 해제한다', () => {
  const { dispatch, container } = renderCanvas([EL_TEXT])
  fireEvent.pointerDown(container.querySelector('.slide-view')!)
  expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_SELECTION' })
})

test('선택된 요소에 선택 테두리가 그려진다', () => {
  const { container } = renderCanvas([EL_SHAPE])
  const box = container.querySelector('.selection-box') as HTMLElement
  expect(box).toBeTruthy()
  expect(box.style.left).toBe('300px')
  expect(box.style.width).toBe('80px')
})
