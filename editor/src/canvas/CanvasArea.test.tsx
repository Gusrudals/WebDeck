import { fireEvent, render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { TableSel } from '../App.tsx'
import { createIdGen } from '../model/id.ts'
import { LINEAR_INSERT_FRAME, addElement } from '../model/ops.ts'
import type { DeckDoc } from '../model/types.ts'
import { parseWebdeck } from '../model/parse.ts'
import { createTable } from '../model/tableOps.ts'
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

function renderCanvas(selectedIds: string[] = [], drawMode: 'line' | 'arrow' | null = null) {
  const dispatch = vi.fn()
  const setDrawMode = vi.fn()
  const utils = render(
    <CanvasArea
      doc={DOC}
      slideIndex={0}
      selectedIds={selectedIds}
      editingTextId={null}
      dispatch={dispatch}
      tableSel={null}
      setTableSel={() => {}}
      drawMode={drawMode}
      setDrawMode={setDrawMode}
      idGen={createIdGen('d')}
    />,
  )
  return { dispatch, setDrawMode, ...utils }
}

// 단일 도형 요소 문서 픽스처 — 기존 DOC_ONE(문서 파싱→render→요소 선택) 준비 코드 관례를 추출해 재사용
function parseSingleShapeDoc(extraStyle = ''): DeckDoc {
  return parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-shape" data-shape="rect" style="left:300px; top:300px; width:80px; height:80px;${extraStyle}"></div></section>
</main></body></html>`)
}

const DOC_SHAPE_ONLY = parseSingleShapeDoc()
const DOC_ROTATED = parseSingleShapeDoc(' transform:rotate(30deg);')

// 단일 요소 선택 상태 헬퍼 — 기존 리사이즈 테스트의 준비 코드(문서 파싱→render→요소 선택)를 추출
function renderCanvasWithSelection() {
  const dispatch = vi.fn()
  const elId = DOC_SHAPE_ONLY.slides[0]!.elements[0]!.id
  const utils = render(
    <CanvasArea
      doc={DOC_SHAPE_ONLY}
      slideIndex={0}
      selectedIds={[elId]}
      editingTextId={null}
      dispatch={dispatch}
      tableSel={null}
      setTableSel={() => {}}
      drawMode={null}
      setDrawMode={() => {}}
      idGen={createIdGen('d')}
    />,
  )
  return { dispatch, ...utils }
}

// rotation 30 요소 선택 픽스처
function renderCanvasWithRotatedSelection() {
  const dispatch = vi.fn()
  const elId = DOC_ROTATED.slides[0]!.elements[0]!.id
  const utils = render(
    <CanvasArea
      doc={DOC_ROTATED}
      slideIndex={0}
      selectedIds={[elId]}
      editingTextId={null}
      dispatch={dispatch}
      tableSel={null}
      setTableSel={() => {}}
      drawMode={null}
      setDrawMode={() => {}}
      idGen={createIdGen('d')}
    />,
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
    <CanvasArea
      doc={DOC}
      slideIndex={0}
      selectedIds={[EL_TEXT]}
      editingTextId={EL_TEXT}
      dispatch={dispatch}
      tableSel={null}
      setTableSel={() => {}}
      drawMode={null}
      setDrawMode={() => {}}
      idGen={createIdGen('d')}
    />,
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
    <CanvasArea
      doc={DOC_ONE}
      slideIndex={0}
      selectedIds={[elId]}
      editingTextId={null}
      dispatch={dispatch}
      tableSel={null}
      setTableSel={() => {}}
      drawMode={null}
      setDrawMode={() => {}}
      idGen={createIdGen('d')}
    />,
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
  // 회전 핸들(.handle-rotate)도 항상 함께 표시되므로 리사이즈 핸들만 세어본다
  expect(container.querySelectorAll('.handle:not(.handle-rotate)')).toHaveLength(8)
  expect(container.querySelector('.handle-rotate')).toBeTruthy()
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

test('회전 핸들 드래그는 pointerup에 1회 APPLY_DOC으로 회전을 커밋한다', () => {
  const { dispatch, container } = renderCanvasWithSelection()
  const handle = container.querySelector('.handle-rotate')!
  fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
  fireEvent.pointerUp(window)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const el = (applies[0]![0].doc as DeckDoc).slides[0]!.elements[0]!
  if (el.type === 'opaque') return
  expect(el.rotation).not.toBe(0)
})

test('회전된 요소는 리사이즈 핸들이 표시되지 않고 회전 핸들만 남는다', () => {
  const { container } = renderCanvasWithRotatedSelection()
  expect(container.querySelector('.handle-rotate')).toBeTruthy()
  expect(container.querySelector('.handle-se')).toBeNull()
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
    <CanvasArea
      doc={DOC}
      slideIndex={0}
      selectedIds={[EL_TEXT]}
      editingTextId={EL_TEXT}
      dispatch={dispatch}
      tableSel={null}
      setTableSel={() => {}}
      drawMode={null}
      setDrawMode={() => {}}
      idGen={createIdGen('d')}
    />,
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

// ---- 표 셀 선택·편집 인터랙션 (Task 10) ----

// 2×2 표 1개 문서 픽스처 — 빈 슬라이드에 createTable로 표를 추가한다(기존 tableOps/TableView 테스트 관례)
function makeTableDoc() {
  const base = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
</main></body></html>`)
  const table = createTable(createIdGen('tb'), 2, 2, { left: 100, top: 100, width: 400, height: 120 })
  const doc = addElement(base, base.slides[0]!.id, table)
  return { doc, tableId: table.id }
}

// 표가 선택된 상태 렌더 헬퍼 — 기존 renderCanvasWithSelection 관례를 표로 확장
function renderCanvasWithTable() {
  const dispatch = vi.fn()
  const setTableSel = vi.fn()
  const { doc, tableId } = makeTableDoc()
  const tableSel: TableSel = { elementId: tableId, anchor: [0, 0], extent: [0, 0] }
  const utils = render(
    <CanvasArea
      doc={doc}
      slideIndex={0}
      selectedIds={[tableId]}
      editingTextId={null}
      dispatch={dispatch}
      tableSel={tableSel}
      setTableSel={setTableSel}
      drawMode={null}
      setDrawMode={() => {}}
      idGen={createIdGen('d')}
    />,
  )
  return { dispatch, setTableSel, tableId, doc, ...utils }
}

test('선택된 표의 셀 클릭은 tableSel을 설정한다', () => {
  const { setTableSel, container } = renderCanvasWithTable()
  fireEvent.pointerDown(container.querySelector('[data-r="1"][data-c="0"]')!)
  expect(setTableSel).toHaveBeenCalledWith(expect.objectContaining({ anchor: [1, 0], extent: [1, 0] }))
})

test('셀 더블클릭 → 편집 → blur 커밋이 1 APPLY_DOC + END_TEXT_EDIT', () => {
  const { dispatch, container } = renderCanvasWithTable()
  const cell = container.querySelector('[data-r="0"][data-c="0"]')!
  fireEvent.doubleClick(cell)
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'START_TEXT_EDIT' }))
  const editable = container.querySelector('[contenteditable]')!
  editable.innerHTML = '<p>새 내용</p>'
  fireEvent.blur(editable)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const el = (applies[0]![0].doc as DeckDoc).slides[0]!.elements[0]!
  if (el.type !== 'table') return
  expect(el.rows[0]![0]!.html).toBe('<p>새 내용</p>')
})

test('마지막 셀 Tab은 행을 추가한다', () => {
  const { dispatch, container } = renderCanvasWithTable()
  fireEvent.doubleClick(container.querySelector('[data-r="1"][data-c="1"]')!)
  const editable = container.querySelector('[contenteditable]')!
  fireEvent.keyDown(editable, { key: 'Tab' })
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies.length).toBeGreaterThanOrEqual(1)
  const el = (applies.at(-1)![0].doc as DeckDoc).slides[0]!.elements[0]!
  if (el.type !== 'table') return
  expect(el.rows).toHaveLength(3)
})

test('열 경계 드래그는 pointerup에 1 APPLY_DOC으로 colWidths를 갱신한다', () => {
  const { dispatch, container } = renderCanvasWithTable()
  const handle = container.querySelector('.col-resize-handle')!
  fireEvent.pointerDown(handle, { clientX: 200, clientY: 40 })
  fireEvent.pointerMove(window, { clientX: 240, clientY: 40 })
  fireEvent.pointerUp(window)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const el = (applies[0]![0].doc as DeckDoc).slides[0]!.elements[0]!
  if (el.type !== 'table') return
  expect(el.colWidths[0]).not.toBeCloseTo(50, 1)
  expect(el.colWidths[0]! + el.colWidths[1]!).toBeCloseTo(100, 1)
})

// ---- 브리프 보정 회귀 테스트 (Critical 1·2) ----

test('회귀(Critical 1): Tab 이동 후에도 START_TEXT_EDIT이 재발화되어 단축키 억제가 유지된다', () => {
  // 플랜 스니펫대로면 onCellTab이 setEditingCell만 하고 START_TEXT_EDIT을 다시 dispatch하지
  // 않는다 — 그러면 commitCell의 END_TEXT_EDIT 이후 editingTextId가 null로 남아 다음 셀에서
  // Backspace가 useShortcuts의 억제를 뚫고 표 요소를 삭제한다(useShortcuts.ts:30,85).
  const { dispatch, container } = renderCanvasWithTable()
  fireEvent.doubleClick(container.querySelector('[data-r="0"][data-c="0"]')!)
  const editable = container.querySelector('[contenteditable]')!
  fireEvent.keyDown(editable, { key: 'Tab' })
  const types = dispatch.mock.calls.map(([a]) => (a as { type: string }).type)
  const endIdx = types.lastIndexOf('END_TEXT_EDIT')
  expect(endIdx).toBeGreaterThanOrEqual(0)
  // END_TEXT_EDIT(커밋) 이후에 START_TEXT_EDIT이 다시 존재해야 편집 상태가 이어진다
  expect(types.indexOf('START_TEXT_EDIT', endIdx + 1)).toBeGreaterThan(endIdx)
})

test('회귀(Critical 2): 마지막 셀 내용 변경 후 Tab은 커밋된 내용과 새 행을 모두 보존한다', () => {
  // 플랜 스니펫대로면 onCellTab의 insertRow가 커밋 전 stale doc 클로저를 기반으로 두 번째
  // APPLY_DOC을 디스패치해 방금 커밋된 셀 내용을 덮어 사라지게 한다. pendingDocRef로 방금
  // 커밋된 doc 위에 insertRow를 적용해야 두 변경이 공존한다.
  const { dispatch, container } = renderCanvasWithTable()
  fireEvent.doubleClick(container.querySelector('[data-r="1"][data-c="1"]')!)
  const editable = container.querySelector('[contenteditable]')!
  editable.innerHTML = '<p>마지막 내용</p>'
  fireEvent.keyDown(editable, { key: 'Tab' })
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(2)
  const last = (applies.at(-1)![0].doc as DeckDoc).slides[0]!.elements[0]!
  if (last.type !== 'table') return
  expect(last.rows).toHaveLength(3)
  expect(last.rows[1]![1]!.html).toBe('<p>마지막 내용</p>')
})

test('보정(Minor·계약 ⑧): 선택 해제 후 같은 표 재선택 시 이전 편집 셀이 되살아나지 않는다', () => {
  const { doc, tableId, dispatch, container, rerender } = renderCanvasWithTable()
  fireEvent.doubleClick(container.querySelector('[data-r="0"][data-c="0"]')!)
  expect(container.querySelector('[contenteditable]')).toBeTruthy()
  // blur 없이 선택 해제(패널/키보드 경유 시나리오) — editingCell이 스테일로 남으면 안 된다
  rerender(
    <CanvasArea
      doc={doc}
      slideIndex={0}
      selectedIds={[]}
      editingTextId={null}
      dispatch={dispatch}
      tableSel={null}
      setTableSel={() => {}}
      drawMode={null}
      setDrawMode={() => {}}
      idGen={createIdGen('d')}
    />,
  )
  rerender(
    <CanvasArea
      doc={doc}
      slideIndex={0}
      selectedIds={[tableId]}
      editingTextId={null}
      dispatch={dispatch}
      tableSel={null}
      setTableSel={() => {}}
      drawMode={null}
      setDrawMode={() => {}}
      idGen={createIdGen('d')}
    />,
  )
  expect(container.querySelector('[contenteditable]')).toBeNull()
})

// ---- 보정 회귀: beginColResize 음수 폭 클램프 (Task 10 리뷰 이월, Task 11 브리프 보정 2) ----

test('보정: 이웃 두 열 합(pairPct)이 10% 미만이면 드래그해도 음수 폭이 생기지 않는다', () => {
  // 3열 표를 만들고 앞 두 열을 좁게(합 4%) 덮어써 pairPct<10 상황을 직접 구성한다 —
  // 8열 그리드 피커 캡으로는(Task 9 산출물) 도달 불가하지만 Task 11의 "열 추가"가 배선되면
  // 열 수 제한이 없어져 실전에서도 도달 가능해진다(브리프 실측: 45열 균등 분배 시 −0.556%).
  const base = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
</main></body></html>`)
  const wideTable = createTable(createIdGen('tn'), 2, 3, { left: 100, top: 100, width: 400, height: 120 })
  const table = { ...wideTable, colWidths: [2, 2, 96] }
  const doc = addElement(base, base.slides[0]!.id, table)
  const dispatch = vi.fn()
  const { container } = render(
    <CanvasArea
      doc={doc}
      slideIndex={0}
      selectedIds={[table.id]}
      editingTextId={null}
      dispatch={dispatch}
      tableSel={null}
      setTableSel={() => {}}
      drawMode={null}
      setDrawMode={() => {}}
      idGen={createIdGen('d')}
    />,
  )
  const handle = container.querySelectorAll('.col-resize-handle')[0]!
  // 극단 드래그: 매우 큰 음의 dx로 좌측 열을 최대한 줄이려 시도한다
  fireEvent.pointerDown(handle, { clientX: 500, clientY: 40 })
  fireEvent.pointerMove(window, { clientX: -5000, clientY: 40 })
  fireEvent.pointerUp(window)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const el = (applies[0]![0].doc as DeckDoc).slides[0]!.elements[0]!
  if (el.type !== 'table') return
  for (const w of el.colWidths) expect(w).toBeGreaterThanOrEqual(0)
  expect(el.colWidths[0]! + el.colWidths[1]!).toBeCloseTo(4, 1)
  expect(el.colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1)
})

// ---- 드래그 그리기 모드 (Plan 9c Task 3) ----

describe('드래그 그리기 모드 (Plan 9c)', () => {
  test('드래그로 두 점을 찍으면 중심+길이+각도의 선이 생성된다', () => {
    const { dispatch, setDrawMode, container } = renderCanvas([], 'line')
    fireEvent.pointerDown(container.querySelector('.canvas-area')!, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 300 })
    fireEvent.pointerUp(window)
    const doc = appliedDoc(dispatch)!
    const added = doc.slides[0]!.elements.at(-1)!
    expect(added.type).toBe('shape')
    if (added.type !== 'shape') return
    expect(added.shape).toBe('line')
    expect(added.rotation).toBe(90)
    expect(added.frame).toEqual({ left: 0, top: 196, width: 200, height: 8 })
    expect(setDrawMode).toHaveBeenCalledWith(null)
  })

  test('Shift 드래그는 각도를 15° 단위로 스냅한다', () => {
    const { dispatch, container } = renderCanvas([], 'line')
    fireEvent.pointerDown(container.querySelector('.canvas-area')!, { clientX: 0, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 200, clientY: 110, shiftKey: true })
    fireEvent.pointerUp(window)
    const doc = appliedDoc(dispatch)!
    const added = doc.slides[0]!.elements.at(-1)!
    if (added.type !== 'shape') throw new Error('shape 기대')
    expect(added.rotation).toBe(0)
    expect(added.frame.width).toBe(200)
  })

  test('8px 미만 드래그(클릭)는 기본 가로선 폴백', () => {
    const { dispatch, container } = renderCanvas([], 'line')
    fireEvent.pointerDown(container.querySelector('.canvas-area')!, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(window, { clientX: 102, clientY: 101 })
    const doc = appliedDoc(dispatch)!
    const added = doc.slides[0]!.elements.at(-1)!
    if (added.type !== 'shape') throw new Error('shape 기대')
    expect(added.frame).toEqual(LINEAR_INSERT_FRAME)
  })

  test('드래그 중 Esc는 생성 없이 모드를 끝낸다', () => {
    const { dispatch, setDrawMode, container } = renderCanvas([], 'line')
    fireEvent.pointerDown(container.querySelector('.canvas-area')!, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 300 })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(window)
    expect(appliedDoc(dispatch)).toBeNull()
    expect(setDrawMode).toHaveBeenCalledWith(null)
  })

  test('모드 중 캔버스 밖 pointerdown은 모드를 취소한다 (캡처 — stopPropagation 면역)', () => {
    const { setDrawMode } = renderCanvas([], 'line')
    const outside = document.createElement('div')
    outside.addEventListener('pointerdown', (e) => e.stopPropagation())
    document.body.appendChild(outside)
    fireEvent.pointerDown(outside)
    document.body.removeChild(outside)
    expect(setDrawMode).toHaveBeenCalledWith(null)
  })

  test('모드 중에는 요소 클릭이 선택을 바꾸지 않는다', () => {
    const { dispatch, container } = renderCanvas([], 'line')
    fireEvent.pointerDown(container.querySelector('.el')!, { clientX: 10, clientY: 10 })
    const types = dispatch.mock.calls.map(([a]) => (a as { type: string }).type)
    expect(types).not.toContain('SELECT_ELEMENTS')
    fireEvent.pointerUp(window)
  })

  test('모드 중에는 선택 요소의 리사이즈/회전 핸들이 렌더되지 않는다 (핸들이 그리기 시작점을 가로채는 결함 회귀)', () => {
    // drawMode null이면 단일 선택에 핸들이 렌더된다(기존 '단일 선택이면 8개 리사이즈 핸들' 테스트와 대비).
    // 모드 중엔 beginResize/beginRotate의 stopPropagation이 beginDraw 도달을 막아, 직전에 그려
    // 자동 선택된 선의 핸들 위에서 새 그리기를 시작하면 기존 요소가 의도치 않게 리사이즈/회전된다.
    const { container } = renderCanvas([EL_SHAPE], 'line')
    expect(container.querySelectorAll('.handle')).toHaveLength(0)
  })
})
