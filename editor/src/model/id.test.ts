import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'

describe('createIdGen', () => {
  test('접두사와 증가 번호로 id를 생성한다', () => {
    const gen = createIdGen()
    expect(gen()).toBe('wd-1')
    expect(gen()).toBe('wd-2')
  })

  test('생성기 인스턴스는 서로 독립적이다', () => {
    const a = createIdGen()
    const b = createIdGen('el')
    a()
    expect(b()).toBe('el-1')
    expect(a()).toBe('wd-2')
  })
})
