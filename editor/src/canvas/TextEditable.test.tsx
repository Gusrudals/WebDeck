import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { TextEditable } from './TextEditable.tsx'

test('data-text-tool 요소로의 blur는 커밋하지 않는다', () => {
  const onCommit = vi.fn()
  const { container } = render(<TextEditable html="<p>a</p>" onCommit={onCommit} />)
  const tool = document.createElement('input')
  tool.setAttribute('data-text-tool', '1')
  document.body.appendChild(tool)
  fireEvent.blur(container.querySelector('.text-editable')!, { relatedTarget: tool })
  expect(onCommit).not.toHaveBeenCalled()
  tool.remove()
})

test('일반 blur는 커밋한다', () => {
  const onCommit = vi.fn()
  const { container } = render(<TextEditable html="<p>a</p>" onCommit={onCommit} />)
  fireEvent.blur(container.querySelector('.text-editable')!)
  expect(onCommit).toHaveBeenCalledWith('<p>a</p>')
})
