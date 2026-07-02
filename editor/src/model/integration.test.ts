import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { validateWebdeck } from '../../../tools/lib/validate.mjs'
import { createHistory, push, undo } from './history.ts'
import { createIdGen } from './id.ts'
import { addSlide, createTextElement, addElement, moveElement, removeSlide, setTextHtml } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { serializeWebdeck } from './serialize.ts'

const TEMPLATE = import.meta.dirname ? `${import.meta.dirname}/../../../templates/business-report.html` : fileURLToPath(new URL('../../../templates/business-report.html', import.meta.url))

test('열기 → 편집 → undo → 저장 시나리오', () => {
  // 열기
  const original = parseWebdeck(readFileSync(TEMPLATE, 'utf8'))
  let history = createHistory(original)
  const gen = createIdGen('edit')

  // 편집 1: 표지 제목 텍스트 교체 (첫 슬라이드의 첫 text 요소)
  const cover = history.present.slides[0]!
  const titleEl = cover.elements.find((e) => e.type === 'text')!
  history = push(history, setTextHtml(history.present, cover.id, titleEl.id, '<p><strong><span style="font-size:54px;">수정된 제목</span></strong></p>'))

  // 편집 2: 새 슬라이드 추가 + 텍스트 상자 삽입 + 이동
  let doc = addSlide(history.present, gen)
  const newSlide = doc.slides[doc.slides.length - 1]!
  doc = addElement(doc, newSlide.id, createTextElement(gen, { left: 96, top: 64, width: 800, height: 80 }, '<p><strong><span style="font-size:36px;">추가 슬라이드</span></strong></p>'))
  const newText = doc.slides[doc.slides.length - 1]!.elements[0]!
  doc = moveElement(doc, newSlide.id, newText.id, 0, 100)
  history = push(history, doc)

  // 편집 3: 마지막 슬라이드 삭제 → undo로 되돌림
  history = push(history, removeSlide(history.present, newSlide.id))
  expect(history.present.slides).toHaveLength(4)
  history = undo(history)
  expect(history.present.slides).toHaveLength(5)

  // 저장: 직렬화 결과가 검증기를 통과하고, 다시 열어도 같은 모델
  const saved = serializeWebdeck(history.present)
  const { errors, warnings } = validateWebdeck(saved)
  expect(errors).toEqual([])
  expect(warnings).toEqual([])

  const reopened = parseWebdeck(saved)
  expect(reopened.slides).toHaveLength(5)
  expect(serializeWebdeck(reopened)).toBe(saved)

  // 원본 모델은 처음부터 끝까지 오염되지 않았다
  expect(original.slides).toHaveLength(4)
  expect(original.slides[0]!.elements.find((e) => e.type === 'text')).toMatchObject({ html: expect.stringContaining('2026년 상반기 업무 보고') })
})
