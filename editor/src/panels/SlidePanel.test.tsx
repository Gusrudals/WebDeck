import type { ComponentProps } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import { SlidePanel } from './SlidePanel.tsx'

const TEMPLATES = import.meta.dirname
  ? join(import.meta.dirname, '../../../templates/')
  : fileURLToPath(new URL('../../../templates/', import.meta.url))

const DOC = parseWebdeck(readFileSync(join(TEMPLATES, 'business-report.html'), 'utf8'))

const ONE_SLIDE_DOC = (() => {
  const full = DOC
  return { ...full, slides: [full.slides[0]!] }
})()

function renderPanel(doc: typeof DOC, over: Partial<ComponentProps<typeof SlidePanel>> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
  }
  const utils = render(
    <SlidePanel doc={doc} currentIndex={0} canRemove={doc.slides.length > 1} {...handlers} {...over} />,
  )
  return { ...handlers, ...utils }
}

test('슬라이드 수만큼 썸네일 버튼을 렌더링한다', () => {
  const { getAllByRole } = renderPanel(DOC)
  // 액션 버튼 3개 + 썸네일 4개 = 7개
  expect(getAllByRole('button')).toHaveLength(7)
  expect(screen.getByRole('button', { name: '슬라이드 3' })).toBeTruthy()
})

test('현재 슬라이드에 selected 표시가 붙는다', () => {
  renderPanel(DOC, { currentIndex: 1 })
  const current = screen.getByRole('button', { name: '슬라이드 2' })
  expect(current.className).toContain('selected')
  expect(current.getAttribute('aria-current')).toBe('true')
})

test('썸네일 클릭 시 onSelect가 호출된다', async () => {
  const { onSelect } = renderPanel(DOC)
  await userEvent.click(screen.getByRole('button', { name: '슬라이드 4' }))
  expect(onSelect).toHaveBeenCalledWith(3)
})

test('복제·삭제 버튼이 핸들러를 호출한다', () => {
  const { onDuplicate, onRemove, getByRole } = renderPanel(DOC)
  fireEvent.click(getByRole('button', { name: '슬라이드 복제' }))
  fireEvent.click(getByRole('button', { name: '슬라이드 삭제' }))
  expect(onDuplicate).toHaveBeenCalled()
  expect(onRemove).toHaveBeenCalled()
})

test('새 슬라이드 버튼은 레이아웃 팝오버를 열고, 선택 시 키를 전달한다', () => {
  const onAdd = vi.fn()
  const { getByRole, queryByRole } = renderPanel(DOC, { onAdd })
  expect(queryByRole('menu')).toBeNull()
  fireEvent.click(getByRole('button', { name: '새 슬라이드' }))
  expect(getByRole('menu')).toBeTruthy()
  fireEvent.click(getByRole('menuitem', { name: '제목+본문' }))
  expect(onAdd).toHaveBeenCalledWith('title-body')
  expect(queryByRole('menu')).toBeNull()
})

test('레이아웃 팝오버는 빈 장을 포함해 4종을 보여준다', () => {
  const { getByRole, getAllByRole } = renderPanel(DOC)
  fireEvent.click(getByRole('button', { name: '새 슬라이드' }))
  expect(getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['빈 장', '표지', '제목+본문', '2단'])
})

test('슬라이드가 1장이면 삭제 버튼이 disabled다', () => {
  const { getByRole } = renderPanel(ONE_SLIDE_DOC)
  expect((getByRole('button', { name: '슬라이드 삭제' }) as HTMLButtonElement).disabled).toBe(true)
})

test('썸네일 드래그로 순서 변경을 요청한다', () => {
  const { onReorder, getAllByRole } = renderPanel(DOC)
  const thumbs = getAllByRole('button', { name: /^슬라이드 \d/ })
  fireEvent.dragStart(thumbs[0]!)
  fireEvent.dragOver(thumbs[1]!)
  fireEvent.drop(thumbs[1]!)
  expect(onReorder).toHaveBeenCalledWith(0, 1)
})
