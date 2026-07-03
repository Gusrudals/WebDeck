import { describe, expect, test, vi } from 'vitest'
import { FONT_FAMILIES, clampFontSize, execFontName, execList, focusEditable, restoreSelection, saveSelection, setLineHeight } from './format.ts'

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

test('execList는 목록 execCommand를 호출한다', () => {
  const spy = vi.fn()
  ;(document as unknown as { execCommand: unknown }).execCommand = spy
  execList('ul')
  expect(spy).toHaveBeenCalledWith('insertUnorderedList')
  execList('ol')
  expect(spy).toHaveBeenCalledWith('insertOrderedList')
})

describe('폰트·크기 유틸', () => {
  test('FONT_FAMILIES는 5종이고 스택에 폴백을 포함한다', () => {
    expect(FONT_FAMILIES).toHaveLength(5)
    expect(FONT_FAMILIES[0]!.stack).toContain('Malgun Gothic')
  })

  test('clampFontSize는 8~120으로 클램프하고 반올림한다', () => {
    expect(clampFontSize(200)).toBe(120)
    expect(clampFontSize(2)).toBe(8)
    expect(clampFontSize(17.4)).toBe(17)
  })

  test('execFontName은 styleWithCSS로 감싸 fontName을 실행한다', () => {
    const spy = vi.fn()
    ;(document as unknown as { execCommand: unknown }).execCommand = spy
    execFontName('"Dotum", sans-serif')
    expect(spy.mock.calls).toEqual([
      ['styleWithCSS', false, 'true'],
      ['fontName', false, '"Dotum", sans-serif'],
      ['styleWithCSS', false, 'false'],
    ])
  })
})

describe('setLineHeight', () => {
  test('캐럿이 있는 문단에만 line-height를 적용한다', () => {
    const editable = document.createElement('div')
    editable.className = 'text-editable'
    editable.innerHTML = '<p>하나</p><p>둘</p>'
    document.body.appendChild(editable)
    const first = editable.querySelector('p')!
    const range = document.createRange()
    range.selectNodeContents(first)
    range.collapse(true)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    setLineHeight(1.5)
    expect((first as HTMLElement).style.lineHeight).toBe('1.5')
    const second = editable.querySelectorAll('p')[1] as HTMLElement
    expect(second.style.lineHeight).toBe('')
    editable.remove()
  })

  test('두 문단에 걸친 셀렉션은 두 블록 모두에 적용된다', () => {
    const editable = document.createElement('div')
    editable.className = 'text-editable'
    editable.innerHTML = '<p>하나</p><p>둘</p>'
    document.body.appendChild(editable)
    const ps = editable.querySelectorAll('p')
    const range = document.createRange()
    range.setStart(ps[0]!.firstChild!, 0)
    range.setEnd(ps[1]!.firstChild!, 1)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    setLineHeight(2)
    expect((ps[0] as HTMLElement).style.lineHeight).toBe('2')
    expect((ps[1] as HTMLElement).style.lineHeight).toBe('2')
    editable.remove()
  })

  test('편집 영역 밖 셀렉션이면 아무것도 하지 않는다', () => {
    const div = document.createElement('div')
    div.innerHTML = '<p>외부</p>'
    document.body.appendChild(div)
    const p = div.querySelector('p')!
    const range = document.createRange()
    range.selectNodeContents(p)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    expect(() => setLineHeight(2)).not.toThrow()
    expect((p as HTMLElement).style.lineHeight).toBe('')
    div.remove()
  })

  test('셀렉션이 없으면 no-op이다', () => {
    window.getSelection()?.removeAllRanges()
    expect(() => setLineHeight(1.15)).not.toThrow()
  })
})
