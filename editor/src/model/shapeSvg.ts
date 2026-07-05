import type { ShapeKind } from './types.ts'

const LINE_SVG = '<svg width="100%" height="100%" style="overflow: visible; display: block;"><line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" stroke-width="2"></line></svg>'

/**
 * line/arrow의 정준 내부 SVG — 직렬화·에디터 렌더의 유일 원본.
 * viewBox 없이 퍼센트 좌표라 상자 비율 왜곡이 없고, 화살표 머리는 userSpaceOnUse marker로 고정 픽셀 크기.
 * marker id는 요소별 유일(wd-arrow-head-<uid>) — url(#id)가 문서 전역 첫 정의로 해석되고
 * marker 안 currentColor는 정의 위치의 color를 따르므로, 상수 id면 화살표들의 머리 색이 첫 정의 색으로 고정된다.
 */
export function shapeInnerHtml(kind: 'line' | 'arrow', uid: string): string {
  if (kind === 'line') return LINE_SVG
  const markerId = `wd-arrow-head-${uid}`
  return `<svg width="100%" height="100%" style="overflow: visible; display: block;"><defs><marker id="${markerId}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 Z" fill="currentColor"></path></marker></defs><line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" stroke-width="2" marker-end="url(#${markerId})"></line></svg>`
}

export function isLinear(shape: ShapeKind): boolean {
  return shape === 'line' || shape === 'arrow'
}
