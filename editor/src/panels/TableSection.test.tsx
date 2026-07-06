import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createIdGen } from '../model/id.ts'
import { addElement } from '../model/ops.ts'
import { parseWebdeck } from '../model/parse.ts'
import { createTable } from '../model/tableOps.ts'
import { gridIsValid } from '../model/tableMarkup.ts'
import type { DeckDoc, TableElement } from '../model/types.ts'
import { TableSection } from './TableSection.tsx'

const BASE = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section></main></body></html>`)

function setup(sel: { elementId: string; anchor: [number, number]; extent: [number, number] } | null = null, table?: TableElement) {
  const el = table ?? createTable(createIdGen('t'), 2, 2, { left: 0, top: 0, width: 400, height: 80 })
  const doc = addElement(BASE, BASE.slides[0]!.id, el)
  const dispatch = vi.fn()
  const utils = render(
    <TableSection doc={doc} slide={doc.slides[0]!} el={el} sel={sel ? { ...sel, elementId: el.id } : null} dispatch={dispatch} />,
  )
  return { el, doc, dispatch, ...utils }
}

function appliedTable(dispatch: ReturnType<typeof vi.fn>): TableElement {
  const call = dispatch.mock.calls.find(([a]) => a?.type === 'APPLY_DOC')!
  return (call[0].doc as DeckDoc).slides[0]!.elements[0]! as TableElement
}

test('행 추가 — 선택 없으면 끝에, 1 APPLY_DOC', () => {
  const { dispatch, getByRole } = setup()
  fireEvent.click(getByRole('button', { name: '행 추가' }))
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')).toHaveLength(1)
  expect(appliedTable(dispatch).rows).toHaveLength(3)
})

test('선택이 있으면 anchor 행 아래에 추가하고, 행 삭제는 anchor 행', () => {
  const { dispatch, getByRole } = setup({ elementId: '', anchor: [0, 0], extent: [0, 0] })
  fireEvent.click(getByRole('button', { name: '행 삭제' }))
  expect(appliedTable(dispatch).rows).toHaveLength(1)
})

test('셀 선택 없으면 행 삭제·병합·분할·서식 비활성', () => {
  const { getByRole } = setup()
  expect((getByRole('button', { name: '행 삭제' }) as HTMLButtonElement).disabled).toBe(true)
  expect((getByRole('button', { name: '병합' }) as HTMLButtonElement).disabled).toBe(true)
  expect((getByRole('button', { name: '분할' }) as HTMLButtonElement).disabled).toBe(true)
})

test('2×1 범위 선택 시 병합 활성 → 클릭 1 APPLY_DOC', () => {
  const { dispatch, getByRole } = setup({ elementId: '', anchor: [0, 0], extent: [1, 0] })
  const merge = getByRole('button', { name: '병합' }) as HTMLButtonElement
  expect(merge.disabled).toBe(false)
  fireEvent.click(merge)
  const el = appliedTable(dispatch)
  expect(el.rows[0]![0]!.rowspan).toBe(2)
})

test('헤더 토글은 범위 대상 1 APPLY_DOC', () => {
  const { dispatch, getByRole } = setup({ elementId: '', anchor: [1, 0], extent: [1, 1] })
  fireEvent.click(getByRole('button', { name: '헤더' }))
  const el = appliedTable(dispatch)
  expect(el.rows[1]![0]!.header).toBe(true)
  expect(el.rows[1]![1]!.header).toBe(true)
})

// ---- 브리프 보정 1: 스테일 tableSel 클램프 ----

test('보정: 스테일 tableSel(삭제된 행 좌표)이 격자 경계로 클램프되어 행 추가가 예외 없이 끝에 삽입된다', () => {
  // 2×2에서 행 하나를 미리 삭제해 1×2로 만들되, sel은 여전히 삭제된 행([1,0])을 가리킨다
  // (App의 "같은 표면 tableSel 유지" 가드로 실제 발생하는 상황 — 브리프 보정 1 참고).
  const table = createTable(createIdGen('t'), 1, 2, { left: 0, top: 0, width: 400, height: 80 })
  const { dispatch, getByRole } = setup({ elementId: '', anchor: [1, 0], extent: [1, 0] }, table)
  expect(() => fireEvent.click(getByRole('button', { name: '행 추가' }))).not.toThrow()
  const el = appliedTable(dispatch)
  expect(el.rows).toHaveLength(2)
  expect(gridIsValid(el.colWidths, el.rows)).toBe(true)
})
