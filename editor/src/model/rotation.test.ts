import { expect, test } from 'vitest'
import { normalizeAngle } from './rotation.ts'

test('normalizeAngle은 [0,360)으로 정규화한다', () => {
  expect(normalizeAngle(0)).toBe(0)
  expect(normalizeAngle(360)).toBe(0)
  expect(normalizeAngle(365)).toBe(5)
  expect(normalizeAngle(-15)).toBe(345)
  expect(normalizeAngle(-720)).toBe(0)
  expect(normalizeAngle(15.5)).toBe(15.5)
})
