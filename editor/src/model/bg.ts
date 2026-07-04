export type BgAngle = 0 | 90 | 180 | 270

export type BgInfo =
  | { kind: 'none' }
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; angle: BgAngle; from: string; to: string }
  | { kind: 'image' }
  | { kind: 'custom' }

const HEX = /^#[0-9a-fA-F]{6}$/
const GRADIENT = /^linear-gradient\((0|90|180|270)deg, (#[0-9a-fA-F]{6}), (#[0-9a-fA-F]{6})\)$/

/** data-bg 값을 UI 편집 가능한 형태로 분류한다 — 인식 불가 값은 custom(원문 보존) */
export function parseBg(bg: string | null): BgInfo {
  if (bg === null) return { kind: 'none' }
  if (HEX.test(bg)) return { kind: 'solid', color: bg }
  const m = GRADIENT.exec(bg)
  if (m) return { kind: 'gradient', angle: Number(m[1]) as BgAngle, from: m[2]!, to: m[3]! }
  if (bg.startsWith('url(data:image/')) return { kind: 'image' }
  return { kind: 'custom' }
}

export function buildGradient(angle: BgAngle, from: string, to: string): string {
  return `linear-gradient(${angle}deg, ${from}, ${to})`
}

export function buildImageBg(dataUri: string): string {
  return `url(${dataUri}) center / cover no-repeat`
}
