import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import { SlidePanel } from './SlidePanel.tsx'

const TEMPLATES = import.meta.dirname
  ? join(import.meta.dirname, '../../../templates/')
  : fileURLToPath(new URL('../../../templates/', import.meta.url))

const report = parseWebdeck(readFileSync(join(TEMPLATES, 'business-report.html'), 'utf8'))

test('슬라이드 수만큼 썸네일 버튼을 렌더링한다', () => {
  render(<SlidePanel doc={report} currentIndex={0} onSelect={() => {}} />)
  expect(screen.getAllByRole('button')).toHaveLength(4)
  expect(screen.getByRole('button', { name: '슬라이드 3' })).toBeTruthy()
})

test('현재 슬라이드에 selected 표시가 붙는다', () => {
  render(<SlidePanel doc={report} currentIndex={1} onSelect={() => {}} />)
  const current = screen.getByRole('button', { name: '슬라이드 2' })
  expect(current.className).toContain('selected')
  expect(current.getAttribute('aria-current')).toBe('true')
})

test('썸네일 클릭 시 onSelect가 호출된다', async () => {
  const onSelect = vi.fn()
  render(<SlidePanel doc={report} currentIndex={0} onSelect={onSelect} />)
  await userEvent.click(screen.getByRole('button', { name: '슬라이드 4' }))
  expect(onSelect).toHaveBeenCalledWith(3)
})
