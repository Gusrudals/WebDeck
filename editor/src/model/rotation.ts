/** 각도를 [0,360) 범위로 정규화한다 */
export function normalizeAngle(deg: number): number {
  const n = deg % 360
  // `+ 0`으로 -0(예: normalizeAngle(-720))을 +0으로 정규화 — Object.is(-0, 0) === false 대응
  return (n < 0 ? n + 360 : n) + 0
}

/** 정확한 rotate(<수>deg) 형태만 매칭 — 그 외 transform은 1급 승격하지 않는다 */
export const ROTATE_PATTERN = /^rotate\((-?\d+(?:\.\d+)?)deg\)$/
