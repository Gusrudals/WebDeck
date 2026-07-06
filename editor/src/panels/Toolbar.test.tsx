import { fireEvent, render } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import type { DeckDoc } from '../model/types.ts'
import { editorReducer, initialEditorState } from '../state/store.ts'
import type { EditorState } from '../state/store.ts'
import { FONT_FAMILIES } from './format.ts'
import { PALETTE } from './ColorPopover.tsx'
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

const DOC3 = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:100px; height:50px;"></div>
<div class="el el-shape" data-shape="rect" style="left:120px; top:0px; width:100px; height:50px;"></div>
<div class="el el-shape" data-shape="rect" style="left:500px; top:0px; width:100px; height:50px;"></div>
</section>
</main></body></html>`)

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

test('도형 팝오버에서 사각형 선택은 사각형을 추가한다', () => {
  const { dispatch, getByRole } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '도형' }))
  fireEvent.click(getByRole('menuitem', { name: '사각형' }))
  const els = appliedDoc(dispatch)!.slides[0]!.elements
  expect(els[2]!.type).toBe('shape')
})

test('도형 버튼은 팝오버를 열고 5종을 보여준다', () => {
  const { getByRole, getAllByRole, queryByRole } = renderToolbar()
  expect(queryByRole('menu')).toBeNull()
  fireEvent.click(getByRole('button', { name: '도형' }))
  expect(getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['사각형', '둥근 사각형', '타원', '선', '화살표'])
})

test('타원 선택은 border-radius 50% 도형을 1 APPLY_DOC으로 삽입한다', () => {
  const { dispatch, getByRole } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '도형' }))
  fireEvent.click(getByRole('menuitem', { name: '타원' }))
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const doc = applies[0]![0].doc as DeckDoc
  const added = doc.slides[0]!.elements.at(-1)!
  expect(added.type).toBe('shape')
  if (added.type !== 'shape') return
  expect(added.shape).toBe('ellipse')
  expect(added.extraStyle['border-radius']).toBe('50%')
})

test('선 선택은 320×8 선을 삽입한다', () => {
  const { dispatch, getByRole } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '도형' }))
  fireEvent.click(getByRole('menuitem', { name: '선' }))
  const doc = (dispatch.mock.calls.find(([a]) => a?.type === 'APPLY_DOC')![0]).doc as DeckDoc
  const added = doc.slides[0]!.elements.at(-1)!
  if (added.type !== 'shape') return
  expect(added.shape).toBe('line')
  expect(added.frame.width).toBe(320)
  expect(added.frame.height).toBe(8)
})

test('표 버튼은 8×8 그리드 피커를 열고 hover 라벨을 보여준다', () => {
  const { getByRole, container } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '표' }))
  const cells = container.querySelectorAll('.table-picker-cell')
  expect(cells).toHaveLength(64)
  fireEvent.pointerEnter(cells[10]!)  // r=1, c=2 → 2×3
  expect(getByRole('dialog', { name: '표 크기 선택' }).textContent).toContain('2 × 3')
})

test('그리드 클릭은 해당 크기 표를 1 APPLY_DOC으로 삽입한다', () => {
  const { dispatch, getByRole, container } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '표' }))
  fireEvent.click(container.querySelectorAll('.table-picker-cell')[9]!)  // r=1,c=1 → 2×2
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const doc = applies[0]![0].doc as DeckDoc
  const added = doc.slides[0]!.elements.at(-1)!
  expect(added.type).toBe('table')
  if (added.type !== 'table') return
  expect(added.rows).toHaveLength(2)
  expect(added.colWidths).toHaveLength(2)
  expect(added.frame.height).toBe(80)
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

test('편집 중 폰트 선택은 fontName execCommand를 호출한다', () => {
  const { getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.change(getByLabelText('폰트'), { target: { value: FONT_FAMILIES[0]!.stack } })
  expect(document.execCommand).toHaveBeenCalledWith('fontName', false, FONT_FAMILIES[0]!.stack)
})

test('크기 입력 + Enter는 fontSize 우회를 실행한다', () => {
  const { getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  const input = getByLabelText('글자 크기')
  fireEvent.change(input, { target: { value: '30' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(document.execCommand).toHaveBeenCalledWith('fontSize', false, '7')
})

test('크기 프리셋 선택도 fontSize를 실행한다', () => {
  const { getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.change(getByLabelText('글자 크기 프리셋'), { target: { value: '28' } })
  expect(document.execCommand).toHaveBeenCalledWith('fontSize', false, '7')
})

test('텍스트 도구에서 편집 밖으로 blur하면 편집을 커밋하고 종료한다', () => {
  const editable = document.createElement('div')
  editable.className = 'text-editable'
  editable.innerHTML = '<p>수정됨</p>'
  document.body.appendChild(editable)
  const { dispatch, getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.blur(getByLabelText('글자 크기'))
  expect(dispatch).toHaveBeenCalledWith({ type: 'END_TEXT_EDIT' })
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  editable.remove()
})

test('다른 텍스트 도구로의 blur는 편집을 유지한다', () => {
  const tool = document.createElement('input')
  tool.setAttribute('data-text-tool', '1')
  document.body.appendChild(tool)
  const { dispatch, getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.blur(getByLabelText('글자 크기'), { relatedTarget: tool })
  expect(dispatch).not.toHaveBeenCalled()
  tool.remove()
})

test('글자색 팝오버에서 스와치 선택은 foreColor를 실행한다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.click(getByRole('button', { name: '글자색' }))
  fireEvent.click(getByRole('button', { name: `색 ${PALETTE[0]}` }))
  expect(document.execCommand).toHaveBeenCalledWith('foreColor', false, PALETTE[0])
})

test('글자색 hex 적용은 입력한 색으로 foreColor를 실행한다', () => {
  const { getByRole, getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.click(getByRole('button', { name: '글자색' }))
  fireEvent.change(getByLabelText('글자색 hex'), { target: { value: '#ff8800' } })
  fireEvent.keyDown(getByLabelText('글자색 hex'), { key: 'Enter' })
  expect(document.execCommand).toHaveBeenCalledWith('foreColor', false, '#ff8800')
})

test('목록 버튼은 목록 execCommand를 실행한다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.click(getByRole('button', { name: '글머리 기호' }))
  expect(document.execCommand).toHaveBeenCalledWith('insertUnorderedList')
  fireEvent.click(getByRole('button', { name: '번호 매기기' }))
  expect(document.execCommand).toHaveBeenCalledWith('insertOrderedList')
})

test('줄 간격 선택은 셀렉션이 걸친 문단에 적용된다', () => {
  const editable = document.createElement('div')
  editable.className = 'text-editable'
  editable.innerHTML = '<p>하나</p>'
  document.body.appendChild(editable)
  const p = editable.querySelector('p')!
  const range = document.createRange()
  range.selectNodeContents(p)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  const { getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.change(getByLabelText('줄 간격'), { target: { value: '1.5' } })
  expect((p as HTMLElement).style.lineHeight).toBe('1.5')
  editable.remove()
})

test('텍스트 중간 정렬은 텍스트 요소에만 flex 스타일을 적용한다', () => {
  const { dispatch, getByRole } = renderToolbar({ selectedIds: [EL_TEXT, EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '텍스트 중간' }))
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[0]).toMatchObject({
    extraStyle: { display: 'flex', 'flex-direction': 'column', 'justify-content': 'center' },
  })
  const shape = doc.slides[0]!.elements[1]!
  expect(shape.type !== 'opaque' && 'display' in shape.extraStyle).toBe(false)
})

test('텍스트 선택이 없으면 세로 정렬 버튼은 비활성이다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_SHAPE] })
  expect((getByRole('button', { name: '텍스트 위' }) as HTMLButtonElement).disabled).toBe(true)
})

test('가로 분배는 3개 이상 선택에서 간격을 균등화하고 1회 커밋한다', () => {
  const ids = DOC3.slides[0]!.elements.map((e) => e.id)
  const { dispatch, getByRole } = renderToolbar({ doc: DOC3, selectedIds: ids })
  fireEvent.click(getByRole('button', { name: '가로 분배' }))
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.elements[1]).toMatchObject({ frame: { left: 250 } })
})

test('2개 선택이면 분배 버튼이 비활성이다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_TEXT, EL_SHAPE] })
  expect((getByRole('button', { name: '가로 분배' }) as HTMLButtonElement).disabled).toBe(true)
})

const DOC_EVEN = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:100px; height:50px;"></div>
<div class="el el-shape" data-shape="rect" style="left:250px; top:0px; width:100px; height:50px;"></div>
<div class="el el-shape" data-shape="rect" style="left:500px; top:0px; width:100px; height:50px;"></div>
</section>
</main></body></html>`)

test('이미 균등한 간격이면 분배는 dispatch하지 않는다', () => {
  const ids = DOC_EVEN.slides[0]!.elements.map((e) => e.id)
  const { dispatch, getByRole } = renderToolbar({ doc: DOC_EVEN, selectedIds: ids })
  fireEvent.click(getByRole('button', { name: '가로 분배' }))
  expect(dispatch).not.toHaveBeenCalled()
})

const DOC_FLEX = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-text" style="left:0px; top:0px; width:100px; height:50px; display:flex; flex-direction:column; justify-content:center;"><p>가운데</p></div>
</section>
</main></body></html>`)

test('이미 같은 세로 정렬이면 dispatch하지 않는다', () => {
  const id = DOC_FLEX.slides[0]!.elements[0]!.id
  const { dispatch, getByRole } = renderToolbar({ doc: DOC_FLEX, selectedIds: [id] })
  fireEvent.click(getByRole('button', { name: '텍스트 중간' }))
  expect(dispatch).not.toHaveBeenCalled()
})

test('도형 팝오버는 fixed로 렌더된다 (툴바 overflow 클리핑 탈출)', () => {
  const { getByRole, container } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '도형' }))
  const pop = container.querySelector('.layout-popover') as HTMLElement
  expect(pop.style.position).toBe('fixed')
})

test('표 피커도 fixed로 렌더된다 (툴바 overflow 클리핑 탈출)', () => {
  const { getByRole, container } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '표' }))
  const pop = container.querySelector('.table-picker') as HTMLElement
  expect(pop.style.position).toBe('fixed')
})

test('stopPropagation하는 외부 요소를 눌러도 도형 팝오버가 닫힌다 (캡처 단계 닫힘)', () => {
  const { getByRole, container } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '도형' }))
  const outside = document.createElement('div')
  outside.addEventListener('pointerdown', (e) => e.stopPropagation())
  document.body.appendChild(outside)
  fireEvent.pointerDown(outside)
  document.body.removeChild(outside)
  expect(container.querySelector('.layout-popover')).toBeNull()
})
