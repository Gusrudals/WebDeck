import { normalizeAngle } from './rotation.ts'
import type { Frame, Point } from './types.ts'

const MIN_EDGE = 8

/** % 경유점 → 문서 px 절대좌표 */
export function absPointsOf(frame: Frame, points: Point[]): [number, number][] {
  return points.map(([x, y]) => [frame.left + (x / 100) * frame.width, frame.top + (y / 100) * frame.height])
}

/**
 * 점들의 bbox로 frame·%를 재정규화 — 불변량 "frame = 점 bbox" 복원 (스펙 9d §5).
 * bbox 변이 1px 미만이면 그 축은 frame 8px(중앙 기준)·점 50% — 0 나눗셈 가드.
 */
export function normalizePoints(absPoints: [number, number][]): { frame: Frame; points: Point[] } {
  const xs = absPoints.map((p) => p[0])
  const ys = absPoints.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const degX = maxX - minX < 1
  const degY = maxY - minY < 1
  const frame: Frame = {
    left: round2(degX ? minX - MIN_EDGE / 2 : minX),
    top: round2(degY ? minY - MIN_EDGE / 2 : minY),
    width: round2(degX ? MIN_EDGE : maxX - minX),
    height: round2(degY ? MIN_EDGE : maxY - minY),
  }
  const points: Point[] = absPoints.map(([x, y]) => [
    degX ? 50 : round2(((x - minX) / (maxX - minX)) * 100),
    degY ? 50 : round2(((y - minY) / (maxY - minY)) * 100),
  ])
  return { frame, points }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** 세그먼트 축 — y 공유 'h', x 공유 'v'(점 일치 시 'h'), 비직교 null */
export function segmentAxis(a: Point, b: Point): 'h' | 'v' | null {
  if (a[1] === b[1]) return 'h'
  if (a[0] === b[0]) return 'v'
  return null
}

/** seg번째 세그먼트를 직각 방향으로 이동 — h는 상하(dy), v는 좌우(dx). 비직교면 원본 반환 */
export function moveElbowSegment(abs: [number, number][], seg: number, dx: number, dy: number): [number, number][] {
  const a = abs[seg]
  const b = abs[seg + 1]
  if (!a || !b) return abs
  const axis = segmentAxis([a[0], a[1]], [b[0], b[1]])
  if (axis === null) return abs
  return abs.map((p, i) => {
    if (i !== seg && i !== seg + 1) return p
    return axis === 'h' ? [p[0], p[1] + dy] : [p[0] + dx, p[1]]
  })
}

/** 끝점 이동 — 인접 꺾임점의 공유 축을 동기해 직교 유지 (국소 재라우팅, 스펙 9d §5) */
export function moveElbowEndpoint(abs: [number, number][], end: 'start' | 'end', to: [number, number]): [number, number][] {
  const next = abs.map((p) => [p[0], p[1]] as [number, number])
  const i = end === 'start' ? 0 : next.length - 1
  const j = end === 'start' ? 1 : next.length - 2
  const endPt = next[i]
  const adj = next[j]
  if (!endPt) return abs
  if (adj && next.length > 2) {
    const axis = segmentAxis([endPt[0], endPt[1]], [adj[0], adj[1]])
    if (axis === 'h') adj[1] = to[1]
    if (axis === 'v') adj[0] = to[0]
  }
  next[i] = [to[0], to[1]]
  return next
}

/** 두 점 → 초기 elbow (H-V-H 또는 V-H-V, 스펙 9d §4) */
export function elbowFromDrag(p1: [number, number], p2: [number, number]): { frame: Frame; points: Point[] } {
  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const degX = Math.abs(dx) < 1
  const degY = Math.abs(dy) < 1
  const frame: Frame = {
    left: round2(degX ? Math.min(p1[0], p2[0]) - MIN_EDGE / 2 : Math.min(p1[0], p2[0])),
    top: round2(degY ? Math.min(p1[1], p2[1]) - MIN_EDGE / 2 : Math.min(p1[1], p2[1])),
    width: round2(degX ? MIN_EDGE : Math.abs(dx)),
    height: round2(degY ? MIN_EDGE : Math.abs(dy)),
  }
  const sx = degX ? 50 : dx > 0 ? 0 : 100
  const sy = degY ? 50 : dy > 0 ? 0 : 100
  const ex = degX ? 50 : 100 - sx
  const ey = degY ? 50 : 100 - sy
  const points: Point[] =
    Math.abs(dx) >= Math.abs(dy)
      ? [[sx, sy], [50, sy], [50, ey], [ex, ey]]
      : [[sx, sy], [sx, 50], [ex, 50], [ex, ey]]
  return { frame, points }
}

/** 두 점 → 완만한 아치 curve — 제어점을 1/3·2/3 지점에서 수직으로 직선 길이 25% 오프셋 후 재정규화 */
export function curveFromDrag(p1: [number, number], p2: [number, number]): { frame: Frame; points: Point[] } {
  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const len = Math.hypot(dx, dy)
  // 좌수직(dy,-dx) 법선 — 화면상 위쪽(작은 y)으로 부푸는 아치. (-dy,dx)는 아래로 부풀어 오답.
  const nx = len === 0 ? 0 : dy / len
  const ny = len === 0 ? -1 : -dx / len
  const off = len * 0.25
  const c1: [number, number] = [p1[0] + dx / 3 + nx * off, p1[1] + dy / 3 + ny * off]
  const c2: [number, number] = [p1[0] + (dx * 2) / 3 + nx * off, p1[1] + (dy * 2) / 3 + ny * off]
  return normalizePoints([p1, c1, c2, p2])
}

/** 두 끝점 → line/arrow frame+rotation (9c beginDraw 수학의 단일 원본) */
export function lineFromEndpoints(p1: [number, number], p2: [number, number], height: number): { frame: Frame; rotation: number } {
  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const dist = Math.hypot(dx, dy)
  const rotation = normalizeAngle(Math.round((Math.atan2(dy, dx) * 180) / Math.PI))
  return {
    frame: {
      left: Math.round((p1[0] + p2[0]) / 2 - dist / 2),
      top: Math.round((p1[1] + p2[1]) / 2 - height / 2),
      width: Math.round(dist),
      height,
    },
    rotation,
  }
}
