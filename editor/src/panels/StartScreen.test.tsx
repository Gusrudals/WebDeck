import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StartScreen } from './StartScreen.tsx'

function renderStart() {
  const onStart = vi.fn()
  const onOpen = vi.fn()
  const utils = render(<StartScreen onStart={onStart} onOpen={onOpen} />)
  return { onStart, onOpen, ...utils }
}

test('템플릿 카드들이 렌더되고 첫 카드는 빈 문서다', () => {
  const { container } = renderStart()
  const cards = container.querySelectorAll('.start-card')
  expect(cards.length).toBeGreaterThanOrEqual(3)
  expect(cards[0]!.textContent).toContain('빈 문서')
})

test('카드 클릭은 해당 템플릿 key로 onStart를 호출한다', () => {
  const { onStart, getByRole } = renderStart()
  fireEvent.click(getByRole('button', { name: /업무 보고/ }))
  expect(onStart).toHaveBeenCalledWith('business-report')
})

test('기존 문서 열기는 onOpen을 호출한다', () => {
  const { onOpen, getByRole } = renderStart()
  fireEvent.click(getByRole('button', { name: '기존 문서 열기…' }))
  expect(onOpen).toHaveBeenCalled()
})
