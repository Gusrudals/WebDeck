import { describe, expect, test } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import { checkRoundTrip } from '../model/roundtrip.ts'
import { RUNTIME_SCRIPT } from '../model/runtime.ts'
import { TEMPLATES } from './templates.ts'

describe('내장 템플릿', () => {
  test('리포의 템플릿 3종이 번들에 포함된다', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(3)
    expect(TEMPLATES.map((t) => t.key)).toEqual(
      expect.arrayContaining(['minimal', 'business-report', 'project-proposal']),
    )
  })

  test('첫 템플릿은 빈 문서(minimal)다', () => {
    expect(TEMPLATES[0]!.key).toBe('minimal')
    expect(TEMPLATES[0]!.label).toBe('빈 문서')
  })

  test('모든 템플릿은 WebDeck 문서로 파싱된다', () => {
    for (const t of TEMPLATES) {
      const doc = parseWebdeck(t.html)
      expect(doc.slides.length, t.key).toBeGreaterThanOrEqual(1)
      expect(t.label.length, t.key).toBeGreaterThan(0)
      expect(checkRoundTrip(doc), t.key).toBeNull()
    }
  })

  test('모든 템플릿은 최신 런타임을 바이트 단위로 내장한다', () => {
    for (const t of TEMPLATES) {
      expect(t.html.includes(RUNTIME_SCRIPT), t.key).toBe(true)
    }
  })
})
