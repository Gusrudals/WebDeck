import { describe, expect, test } from 'vitest'
import { focusEditable, restoreSelection, saveSelection } from './format.ts'

describe('셀렉션 저장/복원', () => {
  test('셀렉션이 없어도 안전하다', () => {
    window.getSelection()?.removeAllRanges()
    expect(() => {
      saveSelection()
      restoreSelection()
    }).not.toThrow()
  })

  test('저장한 Range를 복원한다', () => {
    const div = document.createElement('div')
    div.textContent = '안녕하세요'
    document.body.appendChild(div)
    const range = document.createRange()
    range.selectNodeContents(div)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    saveSelection()
    sel.removeAllRanges()
    expect(sel.rangeCount).toBe(0)
    restoreSelection()
    expect(window.getSelection()!.rangeCount).toBe(1)
    div.remove()
  })
})

test('focusEditable은 .text-editable에 포커스를 준다', () => {
  const div = document.createElement('div')
  div.className = 'text-editable'
  div.tabIndex = -1
  document.body.appendChild(div)
  focusEditable()
  expect(document.activeElement).toBe(div)
  div.remove()
})
