import type { Point, ShapeKind, StrokeDash } from './types.ts'

export interface LineStyle {
  strokeWidth: number
  strokeDash: StrokeDash
  headStart: boolean
  headEnd: boolean
}

export type StrokeKind = 'line' | 'arrow' | 'elbow' | 'curve'

/** kind별 선 서식 기본값 — 파서 폴백·직렬화 생략 판정의 유일 원본 (스펙 §2) */
export function lineDefaults(kind: StrokeKind): LineStyle {
  return { strokeWidth: 2, strokeDash: 'solid', headStart: false, headEnd: kind === 'arrow' }
}

/** ShapeElement(구조적 상위형)에서 선 서식 4필드만 추출 */
export function lineStyleOf(el: LineStyle): LineStyle {
  return { strokeWidth: el.strokeWidth, strokeDash: el.strokeDash, headStart: el.headStart, headEnd: el.headEnd }
}

/** 대시·화살표 머리 속성 문자열 — line/polyline/path 정준형이 공유 */
function strokeAttrs(uid: string, style: LineStyle): { dash: string; defs: string; markers: string } {
  const w = style.strokeWidth
  const dash =
    style.strokeDash === 'dashed'
      ? ` stroke-dasharray="${w * 3} ${w * 2}"`
      : style.strokeDash === 'dotted'
        ? ` stroke-dasharray="0 ${w * 2}" stroke-linecap="round"`
        : ''
  const markerId = `wd-arrow-head-${uid}`
  const defs =
    style.headStart || style.headEnd
      ? `<defs><marker id="${markerId}" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0,0 L5,2.5 L0,5 Z" fill="currentColor"></path></marker></defs>`
      : ''
  const markers = `${style.headStart ? ` marker-start="url(#${markerId})"` : ''}${style.headEnd ? ` marker-end="url(#${markerId})"` : ''}`
  return { dash, defs, markers }
}

/**
 * line/arrow의 정준 내부 SVG — 직렬화·에디터 렌더의 유일 원본.
 * viewBox 없이 퍼센트 좌표라 상자 비율 왜곡이 없다. 화살표 머리는 markerUnits="strokeWidth"로
 * 굵기에 비례(치수 5/2.5 = 굵기 2에서 종전 userSpaceOnUse 10px 규격과 픽셀 동일).
 * marker id는 요소별 유일(wd-arrow-head-<uid>) — url(#id)가 문서 전역 첫 정의로 해석되고
 * marker 안 currentColor는 정의 위치의 color를 따르므로, 상수 id면 머리 색이 첫 정의 색으로 고정된다.
 * 시작 머리는 orient="auto-start-reverse"로 같은 marker를 반전 사용한다.
 * 대시는 굵기 비례(파선 3w/2w, 점선 0/2w+round 캡 — 지름 w의 원점).
 * 출력은 style만으로 결정된다 — kind별 차이는 lineDefaults가 흡수하므로 kind 인자가 없다.
 */
export function shapeInnerHtml(uid: string, style: LineStyle): string {
  const { dash, defs, markers } = strokeAttrs(uid, style)
  return `<svg width="100%" height="100%" style="overflow: visible; display: block;">${defs}<line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" stroke-width="${style.strokeWidth}"${dash}${markers}></line></svg>`
}

/**
 * elbow/curve의 정준 내부 SVG — polyline/path는 % 좌표를 지원하지 않으므로
 * frame 크기를 곱한 px 좌표(소수 2자리)로 재생성한다. data-points가 단일 원본이고
 * 파서는 내부를 무시하므로 리사이즈 후 저장 시 자동 정합된다 (스펙 9d §3).
 * fill="none" 필수 — path/polyline 기본 fill은 검정.
 */
export function pathInnerHtml(kind: 'elbow' | 'curve', uid: string, style: LineStyle, points: Point[], frameW: number, frameH: number): string {
  const px = (v: number, size: number) => Math.round((v / 100) * size * 100) / 100
  const abs = points.map(([x, y]) => `${px(x, frameW)},${px(y, frameH)}`)
  const { dash, defs, markers } = strokeAttrs(uid, style)
  const common = ` fill="none" stroke="currentColor" stroke-width="${style.strokeWidth}"${dash}${markers}`
  const shape =
    kind === 'elbow'
      ? `<polyline points="${abs.join(' ')}"${common}></polyline>`
      : `<path d="M ${abs[0]} C ${abs[1]} ${abs[2]} ${abs[3]}"${common}></path>`
  return `<svg width="100%" height="100%" style="overflow: visible; display: block;">${defs}${shape}</svg>`
}

export function isLinear(shape: ShapeKind): boolean {
  return shape === 'line' || shape === 'arrow'
}

export function isStroke(shape: ShapeKind): shape is StrokeKind {
  return shape === 'line' || shape === 'arrow' || shape === 'elbow' || shape === 'curve'
}

export function isPath(shape: ShapeKind): shape is 'elbow' | 'curve' {
  return shape === 'elbow' || shape === 'curve'
}
