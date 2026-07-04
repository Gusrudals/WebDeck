import type { ShapeKind } from './types.ts'

/**
 * line/arrow의 정준 내부 SVG — 직렬화·에디터 렌더의 유일 원본.
 * viewBox 없이 퍼센트 좌표라 상자 비율 왜곡이 없고, 화살표 머리는 userSpaceOnUse marker로 고정 픽셀 크기.
 * marker id는 상수 — 문서 내 중복돼도 모든 정의가 동일해 렌더 무해.
 */
export const SHAPE_INNER_HTML = {
  line: '<svg width="100%" height="100%" style="overflow: visible; display: block;"><line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" stroke-width="2"></line></svg>',
  arrow: '<svg width="100%" height="100%" style="overflow: visible; display: block;"><defs><marker id="wd-arrow-head" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 Z" fill="currentColor"></path></marker></defs><line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" stroke-width="2" marker-end="url(#wd-arrow-head)"></line></svg>',
} as const

export function isLinear(shape: ShapeKind): boolean {
  return shape === 'line' || shape === 'arrow'
}
