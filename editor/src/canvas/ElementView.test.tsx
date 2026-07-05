import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createIdGen } from '../model/id.ts'
import { createShape, createTextElement } from '../model/ops.ts'
import { ElementView } from './ElementView.tsx'

test('회전된 요소는 transform rotate로 렌더된다', () => {
  const el = { ...createTextElement(createIdGen('t'), { left: 0, top: 0, width: 100, height: 50 }, '<p>x</p>'), rotation: 30 }
  const { container } = render(<ElementView element={el} />)
  const div = container.firstElementChild as HTMLElement
  expect(div.style.transform).toBe('rotate(30deg)')
})

test('rotation 0이면 transform이 없다', () => {
  const el = createTextElement(createIdGen('t'), { left: 0, top: 0, width: 100, height: 50 }, '<p>x</p>')
  const { container } = render(<ElementView element={el} />)
  expect((container.firstElementChild as HTMLElement).style.transform).toBe('')
})

test('line/arrow 도형은 정준 SVG를 렌더한다', () => {
  const el = createShape(createIdGen('s'), 'arrow', { left: 0, top: 0, width: 320, height: 8 })
  const { container } = render(<ElementView element={el} />)
  expect(container.querySelector('svg line')).toBeTruthy()
  expect(container.querySelector(`marker#wd-arrow-head-${el.id}`)).toBeTruthy()
})

test('rect 도형은 자식 없이 렌더된다 (회귀)', () => {
  const el = createShape(createIdGen('s'), 'rect', { left: 0, top: 0, width: 240, height: 160 })
  const { container } = render(<ElementView element={el} />)
  expect(container.querySelector('svg')).toBeNull()
})
