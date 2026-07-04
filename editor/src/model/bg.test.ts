import { expect, test } from 'vitest'
import { buildGradient, buildImageBg, parseBg } from './bg.ts'

test('단색 hex를 인식한다', () => {
  expect(parseBg('#ff0000')).toEqual({ kind: 'solid', color: '#ff0000' })
})

test('null은 none', () => {
  expect(parseBg(null)).toEqual({ kind: 'none' })
})

test('규약 그라데이션을 역파싱한다', () => {
  expect(parseBg('linear-gradient(180deg, #1a56db, #e8f0fe)')).toEqual({
    kind: 'gradient', angle: 180, from: '#1a56db', to: '#e8f0fe',
  })
})

test('build↔parse 왕복', () => {
  const s = buildGradient(90, '#000000', '#ffffff')
  expect(s).toBe('linear-gradient(90deg, #000000, #ffffff)')
  expect(parseBg(s)).toEqual({ kind: 'gradient', angle: 90, from: '#000000', to: '#ffffff' })
})

test('비규약 그라데이션·기타 값은 custom (원문 보존 대상)', () => {
  expect(parseBg('linear-gradient(45deg, red, blue)').kind).toBe('custom')
  expect(parseBg('radial-gradient(#fff, #000)').kind).toBe('custom')
  expect(parseBg('var(--wd-accent)').kind).toBe('custom')
})

test('data URI 이미지 배경을 인식한다', () => {
  const s = buildImageBg('data:image/png;base64,AAAA')
  expect(s).toBe('url(data:image/png;base64,AAAA) center / cover no-repeat')
  expect(parseBg(s)).toEqual({ kind: 'image' })
})

test('외부 URL 이미지는 custom (자기완결 원칙 — UI가 만들지 않음)', () => {
  expect(parseBg('url(https://x/y.png) center / cover no-repeat').kind).toBe('custom')
})
