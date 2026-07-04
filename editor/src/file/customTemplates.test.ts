import { beforeEach, expect, test, vi } from 'vitest'
import { listCustomTemplates, removeCustomTemplate, saveCustomTemplate } from './customTemplates.ts'

beforeEach(() => localStorage.clear())

test('저장하면 목록에 나타나고 id가 유일하다', () => {
  const a = saveCustomTemplate('회사 표준', '<html>a</html>')
  const b = saveCustomTemplate('회사 표준', '<html>b</html>')
  expect(a.id).not.toBe(b.id)
  const list = listCustomTemplates()
  expect(list).toHaveLength(2)
  expect(list[0]!.label).toBe('회사 표준')
  expect(list[1]!.html).toBe('<html>b</html>')
})

test('삭제하면 목록에서 빠진다', () => {
  const a = saveCustomTemplate('x', '<html></html>')
  saveCustomTemplate('y', '<html></html>')
  removeCustomTemplate(a.id)
  const list = listCustomTemplates()
  expect(list).toHaveLength(1)
  expect(list[0]!.label).toBe('y')
})

test('파손된 JSON은 빈 목록으로 취급한다', () => {
  localStorage.setItem('webdeck.templates', '{broken')
  expect(listCustomTemplates()).toEqual([])
  // 다음 저장이 정상 목록을 재생성한다
  saveCustomTemplate('복구', '<html></html>')
  expect(listCustomTemplates()).toHaveLength(1)
})

test('배열이지만 필드가 깨진 항목은 걸러낸다', () => {
  localStorage.setItem('webdeck.templates', JSON.stringify([{ id: 'a' }, { id: 'b', label: 'ok', html: '<html></html>', savedAt: 't' }]))
  const list = listCustomTemplates()
  expect(list).toHaveLength(1)
  expect(list[0]!.id).toBe('b')
})

test('용량 초과는 한국어 오류로 변환한다', () => {
  const spy = vi.spyOn(localStorage, 'setItem' as any).mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError')
  })
  expect(() => saveCustomTemplate('큰 것', '<html></html>')).toThrow('저장 공간이 부족합니다')
  spy.mockRestore()
})
