import { describe, expect, test } from 'vitest'
import { parseInlineStyle, serializeInlineStyle } from './style.ts'

describe('parseInlineStyle', () => {
  test('선언을 소문자 속성 맵으로 파싱한다', () => {
    expect(parseInlineStyle('LEFT: 10px; top:20px ; color: var(--wd-text)')).toEqual({
      left: '10px',
      top: '20px',
      color: 'var(--wd-text)',
    })
  })

  test('괄호 안의 세미콜론은 값의 일부다', () => {
    const style = parseInlineStyle("background:url(data:image/svg+xml;base64,AAA=); width:10px")
    expect(style['background']).toBe('url(data:image/svg+xml;base64,AAA=)')
    expect(style['width']).toBe('10px')
  })
})

describe('serializeInlineStyle', () => {
  test('파싱의 역연산이다', () => {
    const text = 'left:96px; top:200px; background:url(data:image/svg+xml;base64,AAA=);'
    expect(parseInlineStyle(serializeInlineStyle(parseInlineStyle(text)))).toEqual(parseInlineStyle(text))
  })
})
