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

const DOC_STYLED = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-shape" data-shape="rect" style="left:10px; top:10px; width:50px; height:50px; border:1px solid #000000; box-shadow:0 2px 6px rgba(0,0,0,0.25); opacity:0.5;"></div>
<div class="el el-shape" data-shape="rect" style="left:100px; top:10px; width:50px; height:50px; border:3px double red;"></div>
</section>
</main></body></html>`)

const DOC_LINE = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-shape" data-shape="line" style="left:10px; top:10px; width:320px; height:8px; color:#374151;"></div>
</section>
</main></body></html>`)

const DOC_ARROW = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-shape" data-shape="arrow" style="left:10px; top:10px; width:320px; height:8px; color:#374151;"></div>
</section>
</main></body></html>`)

const EL_TEXT = DOC.slides[0]!.elements[0]!.id
const EL_SHAPE = DOC.slides[0]!.elements[1]!.id
const EL_BORDERED = DOC_STYLED.slides[0]!.elements[0]!.id
const EL_CUSTOM_BORDER = DOC_STYLED.slides[0]!.elements[1]!.id
const EL_LINE = DOC_LINE.slides[0]!.elements[0]!.id
const EL_ARROW = DOC_ARROW.slides[0]!.elements[0]!.id

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

/** line 요소 단일 선택 픽스처 */
function renderLinePanel(over: Partial<EditorState> = {}) {
  return renderPanel({ doc: DOC_LINE, selectedIds: [EL_LINE], ...over })
}

/** arrow 요소 단일 선택 픽스처 */
function renderArrowPanel(over: Partial<EditorState> = {}) {
  return renderPanel({ doc: DOC_ARROW, selectedIds: [EL_ARROW], ...over })
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

test('단일 선택 시 X 입력 + Enter는 left를 갱신한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const input = getByLabelText('X')
  fireEvent.change(input, { target: { value: '50' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[1]!).toMatchObject({ frame: { left: 50, top: 300, width: 80, height: 80 } })
})

test('너비는 최소 8로 클램프된다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const input = getByLabelText('너비')
  fireEvent.change(input, { target: { value: '3' } })
  fireEvent.blur(input)
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[1]!).toMatchObject({ frame: { width: 8 } })
})

test('숫자가 아닌 입력은 커밋하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const input = getByLabelText('X')
  fireEvent.change(input, { target: { value: 'abc' } })
  fireEvent.blur(input)
  expect(dispatch).not.toHaveBeenCalled()
})

test('값이 그대로면 dispatch하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const input = getByLabelText('X')
  fireEvent.change(input, { target: { value: '300' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(dispatch).not.toHaveBeenCalled()
})

test('Escape는 드래프트를 버린다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const input = getByLabelText('X') as HTMLInputElement
  fireEvent.change(input, { target: { value: '999' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  fireEvent.blur(input)
  expect(dispatch).not.toHaveBeenCalled()
  expect(input.value).toBe('300')
})

test('다중 선택 시 위치·크기 섹션은 없다', () => {
  const { queryByLabelText } = renderPanel({ selectedIds: [EL_TEXT, EL_SHAPE] })
  expect(queryByLabelText('X')).toBeNull()
})

test('회전 입력은 blur에서 1회 커밋하고 [0,360)으로 정규화한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_TEXT] })
  const input = getByLabelText('회전')
  fireEvent.change(input, { target: { value: '370' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.blur(input)
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements.find((e) => e.id === EL_TEXT)!
  if (el.type === 'opaque') return
  expect(el.rotation).toBe(10)
})

test('같은 회전 값 커밋은 디스패치하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_TEXT] })
  const input = getByLabelText('회전')
  fireEvent.change(input, { target: { value: '0' } })
  fireEvent.blur(input)
  expect(dispatch).not.toHaveBeenCalled()
})

test('편집 중 선택이 바뀌면 드래프트가 새 요소로 넘어가지 않는다', () => {
  const dispatch = vi.fn()
  const { getByLabelText, rerender } = render(
    <PropertiesPanel state={makeState({ selectedIds: [EL_SHAPE] })} dispatch={dispatch} />,
  )
  fireEvent.change(getByLabelText('X'), { target: { value: '999' } })
  // blur 없이 선택 변경 (캔버스 preventDefault로 blur가 억제되는 시나리오)
  rerender(<PropertiesPanel state={makeState({ selectedIds: [EL_TEXT] })} dispatch={dispatch} />)
  const input = getByLabelText('X') as HTMLInputElement
  expect(input.value).toBe('0') // EL_TEXT의 left — 드래프트 잔존 없음
  fireEvent.blur(input)
  expect(dispatch).not.toHaveBeenCalled()
})

test('채우기 색 선택은 선택 요소 전체에 1회 커밋으로 적용된다', () => {
  const { dispatch, getByRole } = renderPanel({ selectedIds: [EL_TEXT, EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  fireEvent.click(getByRole('button', { name: '색 #1a56db' }))
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const doc = applies[0]![0].doc as DeckDoc
  expect(doc.slides[0]!.elements[0]).toMatchObject({ extraStyle: { background: '#1a56db' } })
  expect(doc.slides[0]!.elements[1]).toMatchObject({ extraStyle: { background: '#1a56db' } })
})

test('채우기 없음은 background 키를 제거한다', () => {
  const { dispatch, getByRole } = renderPanel({ selectedIds: [EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  fireEvent.click(getByRole('button', { name: '채우기 없음' }))
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[1]!
  expect(el.type !== 'opaque' && 'background' in el.extraStyle).toBe(false)
})

test('선 요소 선택 시 채우기는 color를 패치하고 테두리·그림자는 숨긴다', () => {
  const { dispatch, queryByText, getByRole, getAllByRole } = renderLinePanel()
  expect(queryByText('테두리')).toBeNull()
  expect(queryByText('그림자')).toBeNull()
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  fireEvent.click(getAllByRole('button', { name: /^색 #/ })[0]!)
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  if (el.type === 'opaque') return
  expect(el.extraStyle['color']).toBeTruthy()
  expect(el.extraStyle['background']).toBeUndefined()
})

test('선 요소 선택 시 채우기 표시값은 extraStyle color에서 읽는다', () => {
  const { getByRole } = renderLinePanel()
  const trigger = getByRole('button', { name: '채우기 색' })
  const chip = trigger.querySelector('.color-chip') as HTMLElement
  expect(chip.style.background).toBe('#374151')
})

test('선 요소 선택 시 채우기 없음도 color 키를 제거한다', () => {
  const { dispatch, getByRole } = renderLinePanel()
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  fireEvent.click(getByRole('button', { name: '채우기 없음' }))
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  expect(el.type !== 'opaque' && 'color' in el.extraStyle).toBe(false)
})

test('line 단일 선택이면 선 섹션이 보인다', () => {
  const { getByText, getByLabelText } = renderLinePanel()
  expect(getByText('선')).toBeTruthy()
  expect(getByLabelText('굵기')).toBeTruthy()
  expect(getByLabelText('파선')).toBeTruthy()
})

test('rect 단일 선택이면 선 섹션이 없다', () => {
  const { queryByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  expect(queryByLabelText('파선')).toBeNull()
})

test('파선 클릭은 strokeDash를 패치한 APPLY_DOC 1회', () => {
  const { dispatch, getByLabelText } = renderLinePanel()
  fireEvent.click(getByLabelText('파선'))
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const doc = applies[0]![0].doc as DeckDoc
  const el = doc.slides[0]!.elements[0]!
  expect(el.type === 'shape' && el.strokeDash).toBe('dashed')
})

test('현재 값과 같은 버튼 클릭은 dispatch하지 않는다', () => {
  const { dispatch, getByLabelText } = renderLinePanel()
  fireEvent.click(getByLabelText('실선'))
  expect(dispatch).not.toHaveBeenCalled()
})

test('굵기 커밋은 1~24 정수로 클램프', () => {
  const { dispatch, getByLabelText } = renderLinePanel()
  const input = getByLabelText('굵기')
  fireEvent.change(input, { target: { value: '99' } })
  fireEvent.blur(input)
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  expect(el.type === 'shape' && el.strokeWidth).toBe(24)
})

test('arrow의 끝 머리 토글: aria-pressed true → 클릭 → headEnd false', () => {
  const { dispatch, getByLabelText } = renderArrowPanel()
  const btn = getByLabelText('끝 머리')
  expect(btn.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(btn)
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  expect(el.type === 'shape' && el.headEnd).toBe(false)
})

test('혼합 선택(선+상자)이면 채우기는 기존대로 background를 패치한다', () => {
  // 단일 line 선택(EL_LINE)은 allLinear=true 경로 — 대조용으로 line+rect를 함께 선택한 혼합 문서를 사용
  const mixedDoc = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-shape" data-shape="line" style="left:10px; top:10px; width:320px; height:8px; color:#374151;"></div>
<div class="el el-shape" data-shape="rect" style="left:300px; top:300px; width:80px; height:80px; background:red;"></div>
</section>
</main></body></html>`)
  const lineId = mixedDoc.slides[0]!.elements[0]!.id
  const rectId = mixedDoc.slides[0]!.elements[1]!.id
  const { dispatch, getByRole, getByText } = renderPanel({ doc: mixedDoc, selectedIds: [lineId, rectId] })
  expect(getByText('테두리')).toBeTruthy()
  expect(getByText('그림자')).toBeTruthy()
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  fireEvent.click(getByRole('button', { name: '색 #1a56db' }))
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[0]).toMatchObject({ extraStyle: { background: '#1a56db' } })
  expect(doc.slides[0]!.elements[1]).toMatchObject({ extraStyle: { background: '#1a56db' } })
})

test('테두리 두께 선택은 기본값으로 border를 합성한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  fireEvent.change(getByLabelText('테두리 두께'), { target: { value: '2' } })
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[1]).toMatchObject({ extraStyle: { border: '2px solid #1f2937' } })
})

test('테두리가 있으면 스타일·색 컨트롤이 보이고 점선 변경이 동작한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ doc: DOC_STYLED, selectedIds: [EL_BORDERED] })
  fireEvent.change(getByLabelText('테두리 스타일'), { target: { value: 'dashed' } })
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[0]).toMatchObject({ extraStyle: { border: '1px dashed #000000' } })
})

test('테두리 없음은 border 키를 제거한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ doc: DOC_STYLED, selectedIds: [EL_BORDERED] })
  fireEvent.change(getByLabelText('테두리 두께'), { target: { value: '0' } })
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  expect(el.type !== 'opaque' && 'border' in el.extraStyle).toBe(false)
})

test('인식할 수 없는 테두리 값은 보존 안내를 보여준다', () => {
  const { getByText } = renderPanel({ doc: DOC_STYLED, selectedIds: [EL_CUSTOM_BORDER] })
  expect(getByText(/사용자 지정/)).toBeTruthy()
})

test('그림자 약하게는 box-shadow를 설정한다', () => {
  const { dispatch, getByRole } = renderPanel({ selectedIds: [EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '그림자 약하게' }))
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[1]).toMatchObject({ extraStyle: { 'box-shadow': '0 2px 6px rgba(0,0,0,0.25)' } })
})

test('그림자 없음은 box-shadow 키를 제거한다', () => {
  const { dispatch, getByRole } = renderPanel({ doc: DOC_STYLED, selectedIds: [EL_BORDERED] })
  fireEvent.click(getByRole('button', { name: '그림자 없음' }))
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  expect(el.type !== 'opaque' && 'box-shadow' in el.extraStyle).toBe(false)
})

test('투명도 슬라이더는 조작 중 커밋하지 않고 pointerup에 1회 커밋한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const range = getByLabelText('투명도')
  fireEvent.change(range, { target: { value: '30' } })
  fireEvent.change(range, { target: { value: '40' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.pointerUp(range)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.elements[1]).toMatchObject({ extraStyle: { opacity: '0.6' } })
})

test('투명도 0%는 opacity 키를 제거한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ doc: DOC_STYLED, selectedIds: [EL_BORDERED] })
  const range = getByLabelText('투명도')
  fireEvent.change(range, { target: { value: '0' } })
  fireEvent.pointerUp(range)
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  expect(el.type !== 'opaque' && 'opacity' in el.extraStyle).toBe(false)
})

test('전환 효과 선택은 1회 APPLY_DOC 한다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  fireEvent.change(getByLabelText('전환 효과'), { target: { value: 'fade' } })
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.transition).toBe('fade')
})

test('같은 전환 값(없음) 재선택은 디스패치하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  fireEvent.change(getByLabelText('전환 효과'), { target: { value: 'none' } })
  expect(dispatch).not.toHaveBeenCalled()
})

test('미지원 transition 잔재가 있으면 같은 값(없음) 선택도 디스패치해 잔재를 제거한다', () => {
  const zoomDoc = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide" data-transition="zoom"></section>
</main></body></html>`)
  const { dispatch, getByLabelText } = renderPanel({ doc: zoomDoc })
  fireEvent.change(getByLabelText('전환 효과'), { target: { value: 'none' } })
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.extraAttrs['data-transition']).toBeUndefined()
})

test('노트는 입력 중 디스패치 없이 blur에서 1회 커밋된다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  const ta = getByLabelText('노트')
  fireEvent.change(ta, { target: { value: '첫 줄' } })
  fireEvent.change(ta, { target: { value: '첫 줄 둘째' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.blur(ta)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.notes).toBe('첫 줄 둘째')
})

test('노트 Escape는 드래프트를 버리고 커밋하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  const ta = getByLabelText('노트')
  fireEvent.change(ta, { target: { value: '버릴 내용' } })
  fireEvent.keyDown(ta, { key: 'Escape' })
  fireEvent.blur(ta)
  expect(dispatch).not.toHaveBeenCalled()
})

test('노트를 같은 내용으로 blur하면 디스패치하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  const ta = getByLabelText('노트')
  fireEvent.change(ta, { target: { value: '' } })
  fireEvent.blur(ta)
  expect(dispatch).not.toHaveBeenCalled()
})

test('슬라이드 모드 — 변환 가능한 opaque 표가 있으면 변환 버튼이 보이고 1 APPLY_DOC', () => {
  const withOpaque = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el" style="left:96px; top:200px; width:600px; height:200px;"><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table></div></section>
</main></body></html>`)
  const { dispatch, getByRole } = renderPanel({ doc: withOpaque })
  const btn = getByRole('button', { name: '편집 불가 표 1개를 표 요소로 변환' })
  fireEvent.click(btn)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.elements[0]!.type).toBe('table')
})

test('변환 가능한 표가 없으면 버튼 미표시', () => {
  const { queryByRole } = renderPanel()
  expect(queryByRole('button', { name: /표 요소로 변환/ })).toBeNull()
})

test('비정상 opacity 값은 NaN 없이 0%로 표시된다', () => {
  const DOC_BAD = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:50px; height:50px; opacity:inherit;"></div>
</section>
</main></body></html>`)
  const id = DOC_BAD.slides[0]!.elements[0]!.id
  const { getByLabelText, getByText } = renderPanel({ doc: DOC_BAD, selectedIds: [id] })
  expect((getByLabelText('투명도') as HTMLInputElement).value).toBe('0')
  expect(getByText('0%')).toBeTruthy()
})
