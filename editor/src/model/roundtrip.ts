import { parseWebdeck } from './parse.ts'
import { serializeWebdeck } from './serialize.ts'
import type { DeckDoc } from './types.ts'

/** id는 세션 내부 값이므로 비교에서 제외. 텍스트/표 셀 html은 trim 정규화(파서가 trim하므로) */
function normalize(doc: DeckDoc): DeckDoc {
  return {
    ...doc,
    slides: doc.slides.map((s) => ({
      ...s,
      id: '',
      elements: s.elements.map((el) => {
        if (el.type === 'text') return { ...el, id: '', html: el.html.trim() }
        if (el.type === 'table') {
          return {
            ...el,
            id: '',
            rows: el.rows.map((row) => row.map((cell) => ({ ...cell, html: cell.html.trim() }))),
          }
        }
        return { ...el, id: '' }
      }),
    })),
  }
}

/**
 * 저장 전 최후 안전망 (스펙 §8): 직렬화 결과를 다시 파싱해 모델과 동등한지 검사.
 * 통과하면 null, 실패하면 사용자에게 보여줄 한국어 사유를 반환한다.
 */
export function checkRoundTrip(doc: DeckDoc): string | null {
  let html: string
  try {
    html = serializeWebdeck(doc)
  } catch (e) {
    return `직렬화에 실패했습니다: ${e instanceof Error ? e.message : String(e)}`
  }
  let reparsed: DeckDoc
  try {
    reparsed = parseWebdeck(html)
  } catch (e) {
    return `저장 결과를 다시 읽을 수 없습니다: ${e instanceof Error ? e.message : String(e)}`
  }
  if (doc.slides.length !== reparsed.slides.length) {
    return `저장하면 슬라이드 수가 달라집니다 (${doc.slides.length} → ${reparsed.slides.length}) — 최근 편집을 취소(Ctrl+Z)하고 다시 시도하세요`
  }
  for (let i = 0; i < doc.slides.length; i++) {
    const before = doc.slides[i]!.elements.length
    const after = reparsed.slides[i]!.elements.length
    if (before !== after) {
      return `저장하면 슬라이드 ${i + 1}의 요소 수가 달라집니다 (${before} → ${after}) — 최근 편집을 취소(Ctrl+Z)하고 다시 시도하세요`
    }
  }
  if (JSON.stringify(normalize(doc)) !== JSON.stringify(normalize(reparsed))) {
    return '저장하면 문서 내용이 달라집니다 — 최근 편집을 취소(Ctrl+Z)하고 다시 시도하세요'
  }
  return null
}
