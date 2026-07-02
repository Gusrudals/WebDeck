import type { DeckDoc } from '../model/types.ts'

/**
 * AI 수정 요청 확장 지점 (스펙 §6.4).
 * MVP에서는 구현체와 UI가 없다 — 추후 사내 LLM 프록시/Claude API 어댑터를
 * 이 인터페이스로 구현해 "AI에게 수정 요청" 기능을 붙인다.
 */
export interface AIEditRequest {
  doc: DeckDoc
  /** 현재 보고 있는 슬라이드 (0-base) */
  slideIndex: number
  /** 사용자의 자연어 수정 지시 */
  instruction: string
}

export interface AIEditResult {
  doc: DeckDoc
  /** 사용자에게 보여줄 변경 요약 */
  summary: string
}

export interface AIServiceAdapter {
  requestEdit(request: AIEditRequest): Promise<AIEditResult>
}
