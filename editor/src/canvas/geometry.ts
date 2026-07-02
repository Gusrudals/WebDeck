import type { Frame } from '../model/types.ts'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const MIN_SIZE = 8
export const SNAP_THRESHOLD = 6

export function resizeFrame(orig: Frame, handle: ResizeHandle, dx: number, dy: number): Frame {
  let { left, top, width, height } = orig
  const right = left + width
  const bottom = top + height
  if (handle.includes('w')) {
    const newLeft = Math.min(left + dx, right - MIN_SIZE)
    width = right - newLeft
    left = newLeft
  }
  if (handle.includes('e')) width = Math.max(MIN_SIZE, width + dx)
  if (handle.includes('n')) {
    const newTop = Math.min(top + dy, bottom - MIN_SIZE)
    height = bottom - newTop
    top = newTop
  }
  if (handle.includes('s')) height = Math.max(MIN_SIZE, height + dy)
  return { left, top, width, height }
}

export interface SnapTargets {
  xs: number[]
  ys: number[]
}

/** 스냅 대상: 슬라이드 가장자리·중앙 + 다른 요소들의 변·중앙 */
export function buildSnapTargets(slideWidth: number, slideHeight: number, otherFrames: Frame[]): SnapTargets {
  const xs = [0, slideWidth / 2, slideWidth]
  const ys = [0, slideHeight / 2, slideHeight]
  for (const f of otherFrames) {
    xs.push(f.left, f.left + f.width / 2, f.left + f.width)
    ys.push(f.top, f.top + f.height / 2, f.top + f.height)
  }
  return { xs, ys }
}

export interface Guide {
  axis: 'x' | 'y'
  position: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: Guide[]
}

function bestOffset(edges: number[], targets: number[]): { offset: number; target: number } | null {
  let best: { offset: number; target: number } | null = null
  for (const edge of edges) {
    for (const target of targets) {
      const offset = target - edge
      if (Math.abs(offset) <= SNAP_THRESHOLD && (!best || Math.abs(offset) < Math.abs(best.offset))) {
        best = { offset, target }
      }
    }
  }
  return best
}

/** 이동 중 스냅: 이동한 frame의 변·중앙을 대상 라인에 끌어붙인 보정 delta와 가이드를 반환 */
export function snapMove(frame: Frame, dx: number, dy: number, targets: SnapTargets): SnapResult {
  const xs = [frame.left + dx, frame.left + dx + frame.width / 2, frame.left + dx + frame.width]
  const ys = [frame.top + dy, frame.top + dy + frame.height / 2, frame.top + dy + frame.height]
  const bx = bestOffset(xs, targets.xs)
  const by = bestOffset(ys, targets.ys)
  const guides: Guide[] = []
  if (bx) guides.push({ axis: 'x', position: bx.target })
  if (by) guides.push({ axis: 'y', position: by.target })
  return { dx: dx + (bx?.offset ?? 0), dy: dy + (by?.offset ?? 0), guides }
}

export type AlignMode = 'left' | 'center-h' | 'right' | 'top' | 'middle' | 'bottom'

export function alignFrame(frame: Frame, slideWidth: number, slideHeight: number, mode: AlignMode): Frame {
  switch (mode) {
    case 'left':
      return { ...frame, left: 0 }
    case 'center-h':
      return { ...frame, left: (slideWidth - frame.width) / 2 }
    case 'right':
      return { ...frame, left: slideWidth - frame.width }
    case 'top':
      return { ...frame, top: 0 }
    case 'middle':
      return { ...frame, top: (slideHeight - frame.height) / 2 }
    case 'bottom':
      return { ...frame, top: slideHeight - frame.height }
  }
}
