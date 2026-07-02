import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { DeckDoc } from '../model/types.ts'
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

const DOC_ONE = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>홀로</p></div></section>
</main></body></html>`)

function appliedDoc(dispatch: ReturnType<typeof vi.fn>): DeckDoc | null {
  const action = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  return action ? (action.doc as DeckDoc) : null
}

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
  fireEvent.pointerUp(window)
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
  fireEvent.pointerUp(window)
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

test('드래그로 요소를 이동하고 pointerup에 1회만 커밋한다', () => {
  const { dispatch, getByText } = renderCanvas([EL_TEXT])
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { clientX: 60, clientY: 30 })
  fireEvent.pointerUp(window)
  const doc = appliedDoc(dispatch)
  expect(doc).toBeTruthy()
  expect(doc!.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 50, top: 20 } })
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')).toHaveLength(1)
})

test('3px 미만 이동은 클릭으로 간주하고 커밋하지 않는다', () => {
  const { dispatch, getByText } = renderCanvas([EL_TEXT])
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { clientX: 11, clientY: 11 })
  fireEvent.pointerUp(window)
  expect(appliedDoc(dispatch)).toBeNull()
})

test('단일 이동은 슬라이드 중앙에 스냅하고 가이드를 그린다', () => {
  const dispatch = vi.fn()
  const elId = DOC_ONE.slides[0]!.elements[0]!.id
  const { getByText, container } = render(
    <CanvasArea doc={DOC_ONE} slideIndex={0} selectedIds={[elId]} editingTextId={null} dispatch={dispatch} />,
  )
  fireEvent.pointerDown(getByText('홀로'), { clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 594, clientY: 100 })
  const guide = container.querySelector('.snap-guide-x') as HTMLElement
  expect(guide).toBeTruthy()
  expect(guide.style.left).toBe('640px')
  fireEvent.pointerUp(window)
  expect(appliedDoc(dispatch)!.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 590, top: 100 } })
})

test('다중 선택 드래그는 모두 함께 이동한다 (스냅 없음)', () => {
  const { dispatch, getByText } = renderCanvas([EL_TEXT, EL_SHAPE])
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { clientX: 60, clientY: 30 })
  fireEvent.pointerUp(window)
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 50, top: 20 } })
  expect(doc.slides[0]!.elements[1]!).toMatchObject({ frame: { left: 350, top: 320 } })
})

test('단일 선택이면 8개 리사이즈 핸들이 보인다', () => {
  const { container } = renderCanvas([EL_SHAPE])
  expect(container.querySelectorAll('.handle')).toHaveLength(8)
})

test('다중 선택이면 핸들이 없다', () => {
  const { container } = renderCanvas([EL_TEXT, EL_SHAPE])
  expect(container.querySelectorAll('.handle')).toHaveLength(0)
})

test('se 핸들 드래그로 크기를 조절한다', () => {
  const { dispatch, container } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(container.querySelector('.handle-se')!, { clientX: 100, clientY: 100 })
  fireEvent.pointerMove(window, { clientX: 130, clientY: 120 })
  fireEvent.pointerUp(window)
  expect(appliedDoc(dispatch)!.slides[0]!.elements[1]!).toMatchObject({
    frame: { left: 300, top: 300, width: 110, height: 100 },
  })
})

test('nw 핸들 드래그는 left/top을 함께 옮긴다', () => {
  const { dispatch, container } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(container.querySelector('.handle-nw')!, { clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 10, clientY: 20 })
  fireEvent.pointerUp(window)
  expect(appliedDoc(dispatch)!.slides[0]!.elements[1]!).toMatchObject({
    frame: { left: 310, top: 320, width: 70, height: 60 },
  })
})

test('이동 중 pointercancel은 커밋 없이 리스너를 해제한다', () => {
  const { dispatch, getByText } = renderCanvas([EL_TEXT])
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { clientX: 60, clientY: 30 })
  fireEvent.pointerCancel(window)
  expect(appliedDoc(dispatch)).toBeNull()
  dispatch.mockClear()
  fireEvent.pointerMove(window, { clientX: 200, clientY: 200 })
  fireEvent.pointerUp(window)
  expect(dispatch).not.toHaveBeenCalled()
})
