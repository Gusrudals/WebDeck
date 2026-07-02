import { describe, expect, test } from 'vitest'
import { cssTextToReact, extractThemeVars, styleFromModel } from './styleFromModel.ts'

describe('styleFromModel', () => {
  test('frame을 절대 위치 스타일로 변환한다', () => {
    const s = styleFromModel({ left: 96, top: 200, width: 520, height: 440 }, {})
    expect(s).toMatchObject({ position: 'absolute', left: '96px', top: '200px', width: '520px', height: '440px' })
  })

  test('extraStyle의 kebab-case를 camelCase로 바꾸고 커스텀 프로퍼티는 유지한다', () => {
    const s = styleFromModel({ left: 0, top: 0, width: 1, height: 1 }, { 'background-color': 'red', '--wd-primary': 'blue' })
    expect(s).toMatchObject({ backgroundColor: 'red', '--wd-primary': 'blue' })
  })
})

test('cssTextToReact는 인라인 스타일 문자열을 변환한다', () => {
  expect(cssTextToReact('width:100%; height:100%;')).toEqual({ width: '100%', height: '100%' })
})

describe('extractThemeVars', () => {
  test('headExtra의 --wd-* 변수를 추출한다', () => {
    const head = '<style>:root { --wd-primary: #ff0000; --wd-accent: #e8f0fe; } body { margin: 0; }</style>'
    expect(extractThemeVars(head)).toEqual({ '--wd-primary': '#ff0000', '--wd-accent': '#e8f0fe' })
  })

  test('변수가 없으면 빈 객체', () => {
    expect(extractThemeVars('<style>body{margin:0}</style>')).toEqual({})
  })
})
