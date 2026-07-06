import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createIdGen } from '../model/id.ts'
import { createTable, setCellHtml } from '../model/tableOps.ts'
import { addElement } from '../model/ops.ts'
import { parseWebdeck } from '../model/parse.ts'
import { ElementView } from './ElementView.tsx'
import type { TableInteraction } from './TableView.tsx'

function makeTable() {
  return createTable(createIdGen('t'), 2, 2, { left: 0, top: 0, width: 400, height: 80 })
}

function tableInteraction(over: Partial<TableInteraction> = {}): TableInteraction {
  return {
    selectedRange: null, editingCell: null,
    onCellPointerDown: vi.fn(), onCellPointerEnter: vi.fn(), onCellDoubleClick: vi.fn(),
    onCellCommit: vi.fn(), onCellTab: vi.fn(), onColBorderPointerDown: vi.fn(),
    ...over,
  }
}

test('표를 colgroup·th/td로 렌더한다', () => {
  const { container } = render(<ElementView element={makeTable()} />)
  expect(container.querySelectorAll('col')).toHaveLength(2)
  expect(container.querySelectorAll('th')).toHaveLength(2)
  expect(container.querySelectorAll('td')).toHaveLength(2)
})

test('셀 더블클릭·범위 하이라이트·data 좌표', () => {
  const t = makeTable()
  const ti = tableInteraction({ selectedRange: { r1: 0, c1: 0, r2: 1, c2: 0 } })
  const { container } = render(
    <ElementView element={t} interaction={{ selected: true, editing: false, onPointerDown: vi.fn(), onDoubleClick: vi.fn(), onTextCommit: vi.fn(), table: ti }} />,
  )
  const cell = container.querySelector('[data-r="1"][data-c="0"]')!
  fireEvent.doubleClick(cell)
  expect(ti.onCellDoubleClick).toHaveBeenCalledWith(1, 0)
  expect(cell.classList.contains('cell-selected')).toBe(true)
  expect(container.querySelector('[data-r="1"][data-c="1"]')!.classList.contains('cell-selected')).toBe(false)
})

test('editingCell은 TextEditable로 렌더되고 Tab이 onCellTab을 부른다', () => {
  const t = makeTable()
  const ti = tableInteraction({ editingCell: { r: 0, c: 0 } })
  const { container } = render(
    <ElementView element={t} interaction={{ selected: true, editing: false, onPointerDown: vi.fn(), onDoubleClick: vi.fn(), onTextCommit: vi.fn(), table: ti }} />,
  )
  const editable = container.querySelector('[contenteditable]')!
  fireEvent.keyDown(editable, { key: 'Tab' })
  expect(ti.onCellTab).toHaveBeenCalledWith(0, 0, false)
})

test('열 경계 핸들이 열 수-1개 렌더된다 (table 인터랙션 존재 시)', () => {
  const t = makeTable()
  const { container } = render(
    <ElementView element={t} interaction={{ selected: true, editing: false, onPointerDown: vi.fn(), onDoubleClick: vi.fn(), onTextCommit: vi.fn(), table: tableInteraction() }} />,
  )
  expect(container.querySelectorAll('.col-resize-handle')).toHaveLength(1)
})

test('table 인터랙션이 없으면 셀 핸들러 없이 렌더 (읽기 전용·썸네일)', () => {
  const { container } = render(<ElementView element={makeTable()} />)
  expect(container.querySelector('.col-resize-handle')).toBeNull()
})

test('셀 html이 렌더된다', () => {
  const base = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720"><section class="slide"></section></main></body></html>`)
  const t = makeTable()
  const doc = setCellHtml(addElement(base, base.slides[0]!.id, t), base.slides[0]!.id, t.id, 1, 1, '<p>내용</p>')
  const el = doc.slides[0]!.elements[0]!
  const { getByText } = render(<ElementView element={el} />)
  expect(getByText('내용')).toBeTruthy()
})
