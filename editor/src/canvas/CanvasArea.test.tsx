import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { DeckDoc } from '../model/types.ts'
import { parseWebdeck } from '../model/parse.ts'
import { CanvasArea } from './CanvasArea.tsx'

// happy-dom(20.x)의 WheelEvent는 스펙과 달리 MouseEvent를 상속하지 않아
// ctrlKey/metaKey가 항상 undefined다 (실제 브라우저에서는 정상 동작). fireEvent.wheel의
// init을 인스턴스에 반영하도록 이 테스트 파일 범위에서만 보정한다.
const NativeWheelEvent = globalThis.WheelEvent
class TestWheelEvent extends NativeWheelEvent {
  override readonly ctrlKey: boolean
  override readonly metaKey: boolean
  constructor(type: string, eventInitDict?: WheelEventInit) {
    super(type, eventInitDict)
    this.ctrlKey = eventInitDict?.ctrlKey ?? false
    this.metaKey = eventInitDict?.metaKey ?? false
  }
}
globalThis.WheelEvent = TestWheelEvent

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

test('Shift+모서리 리사이즈는 종횡비를 유지한다', () => {
  const { dispatch, container } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(container.querySelector('.handle-se')!, { clientX: 380, clientY: 380 })
  fireEvent.pointerMove(window, { clientX: 480, clientY: 400, shiftKey: true })
  fireEvent.pointerUp(window)
  const doc = appliedDoc(dispatch)!
  // 80×80에서 dx 100, dy 20 → 폭 변화 우세 → 180×180 (비율 1:1)
  expect(doc.slides[0]!.elements[1]!).toMatchObject({ frame: { left: 300, top: 300, width: 180, height: 180 } })
})

test('리사이즈 중 움직이는 변이 스냅 대상에 흡착된다', () => {
  const { dispatch, container } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(container.querySelector('.handle-e')!, { clientX: 380, clientY: 340 })
  // dx 256 → 오른쪽 변 636, 슬라이드 중앙 640까지 4px(임계 6 이내) → 흡착
  fireEvent.pointerMove(window, { clientX: 636, clientY: 340 })
  fireEvent.pointerUp(window)
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[1]!).toMatchObject({ frame: { width: 340 } })
})

test('리사이즈 스냅 중 가이드 라인이 표시된다', () => {
  const { container } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(container.querySelector('.handle-e')!, { clientX: 380, clientY: 340 })
  fireEvent.pointerMove(window, { clientX: 636, clientY: 340 })
  expect(container.querySelector('.snap-guide-x')).toBeTruthy()
  fireEvent.pointerUp(window)
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

test('텍스트 요소 더블클릭은 편집 시작을 dispatch한다', () => {
  const { dispatch, getByText } = renderCanvas([EL_TEXT])
  fireEvent.doubleClick(getByText('제목'))
  expect(dispatch).toHaveBeenCalledWith({ type: 'START_TEXT_EDIT', id: EL_TEXT })
})

test('도형 더블클릭은 편집을 시작하지 않는다', () => {
  const { dispatch, container } = renderCanvas([EL_SHAPE])
  fireEvent.doubleClick(container.querySelector('.el-shape')!)
  expect(dispatch.mock.calls.map(([a]) => a).some((a) => a?.type === 'START_TEXT_EDIT')).toBe(false)
})

function renderEditing() {
  const dispatch = vi.fn()
  const utils = render(
    <CanvasArea doc={DOC} slideIndex={0} selectedIds={[EL_TEXT]} editingTextId={EL_TEXT} dispatch={dispatch} />,
  )
  const editable = utils.container.querySelector('.text-editable') as HTMLElement
  return { dispatch, editable, ...utils }
}

test('편집 중에는 contentEditable이 뜨고 blur에 변경을 커밋한다', () => {
  const { dispatch, editable } = renderEditing()
  expect(editable).toBeTruthy()
  expect(editable.innerHTML).toContain('제목')
  editable.innerHTML = '<p>고친 제목</p>'
  fireEvent.blur(editable)
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  expect(el.type).toBe('text')
  if (el.type === 'text') expect(el.html).toBe('<p>고친 제목</p>')
  expect(dispatch).toHaveBeenCalledWith({ type: 'END_TEXT_EDIT' })
})

test('내용이 같으면 blur에 커밋 없이 편집만 끝낸다', () => {
  const { dispatch, editable } = renderEditing()
  fireEvent.blur(editable)
  expect(appliedDoc(dispatch)).toBeNull()
  expect(dispatch).toHaveBeenCalledWith({ type: 'END_TEXT_EDIT' })
})

test('Escape는 커밋하고 편집을 끝낸다', () => {
  const { dispatch, editable } = renderEditing()
  editable.innerHTML = '<p>ESC</p>'
  fireEvent.keyDown(editable, { key: 'Escape' })
  const el = appliedDoc(dispatch)!.slides[0]!.elements[0]!
  if (el.type === 'text') expect(el.html).toBe('<p>ESC</p>')
  expect(dispatch).toHaveBeenCalledWith({ type: 'END_TEXT_EDIT' })
})

test('확대 비율 200% 선택은 스테이지 크기를 2배로 만든다', () => {
  const { container, getByLabelText } = renderCanvas()
  fireEvent.change(getByLabelText('확대 비율'), { target: { value: '2' } })
  const box = container.querySelector('.canvas-stage-box') as HTMLElement
  expect(box.style.width).toBe('2560px')
  expect(box.style.height).toBe('1440px')
})

test('Ctrl+휠은 프리셋 단계를 오르내린다', () => {
  const { container, getByLabelText } = renderCanvas()
  const scroll = container.querySelector('.canvas-scroll')!
  fireEvent.wheel(scroll, { ctrlKey: true, deltaY: -100 })
  // 테스트 환경 fitScale=1에서 확대 → 다음 단계 1.5
  expect((getByLabelText('확대 비율') as HTMLSelectElement).value).toBe('1.5')
  fireEvent.wheel(scroll, { ctrlKey: true, deltaY: 100 })
  expect((getByLabelText('확대 비율') as HTMLSelectElement).value).toBe('1')
})

test('줌 컨트롤 클릭은 선택을 해제하지 않는다', () => {
  const { dispatch, container } = renderCanvas([EL_TEXT])
  fireEvent.pointerDown(container.querySelector('.zoom-control')!)
  expect(dispatch).not.toHaveBeenCalled()
})

test('배율 200%에서 드래그 좌표가 보정된다', () => {
  const { dispatch, getByText, getByLabelText } = renderCanvas([EL_TEXT])
  fireEvent.change(getByLabelText('확대 비율'), { target: { value: '2' } })
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { clientX: 110, clientY: 10 })
  fireEvent.pointerUp(window)
  const doc = appliedDoc(dispatch)!
  // 화면 100px ÷ 배율 2 = 모델 50px
  expect(doc.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 50, top: 0 } })
})
