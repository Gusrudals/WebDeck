import { describe, expect, test } from 'vitest'
import { alignFrame, buildSnapTargets, resizeFrame, snapMove } from './geometry.ts'

const F = { left: 100, top: 100, width: 200, height: 100 }

describe('resizeFrame', () => {
  test('se 핸들은 너비·높이만 키운다', () => {
    expect(resizeFrame(F, 'se', 30, 20)).toEqual({ left: 100, top: 100, width: 230, height: 120 })
  })
  test('nw 핸들은 left/top을 옮기며 크기를 줄인다', () => {
    expect(resizeFrame(F, 'nw', 30, 20)).toEqual({ left: 130, top: 120, width: 170, height: 80 })
  })
  test('n 핸들은 세로만 바꾼다', () => {
    expect(resizeFrame(F, 'n', 999, -10)).toEqual({ left: 100, top: 90, width: 200, height: 110 })
  })
  test('최소 크기(8px) 아래로 줄어들지 않는다', () => {
    const r = resizeFrame(F, 'se', -500, -500)
    expect(r.width).toBe(8)
    expect(r.height).toBe(8)
    const r2 = resizeFrame(F, 'nw', 500, 500)
    expect(r2).toEqual({ left: 292, top: 192, width: 8, height: 8 })
  })
})

describe('snapMove', () => {
  const targets = buildSnapTargets(1280, 720, [{ left: 500, top: 0, width: 100, height: 50 }])
  test('임계값(6px) 안이면 슬라이드 중앙에 스냅하고 가이드를 낸다', () => {
    // frame 중심 = left+dx+100 → 목표 640: left=100,dx=436 → 중심 636, 오프셋 +4
    const r = snapMove(F, 436, 0, targets)
    expect(r.dx).toBe(440)
    expect(r.guides).toContainEqual({ axis: 'x', position: 640 })
  })
  test('임계값 밖이면 스냅하지 않는다', () => {
    // dx 150 → 변 250/350/450, 대상 xs {0,640,1280,500,550,600} 어디에도 6px 내 없음
    const r = snapMove(F, 150, 150, targets)
    expect(r).toEqual({ dx: 150, dy: 150, guides: [] })
  })
  test('다른 요소의 왼쪽 변에도 스냅한다', () => {
    // frame left = 100+dx → 목표 500: dx=395 → 495, 오프셋 +5
    const r = snapMove(F, 395, 300, targets)
    expect(r.dx).toBe(400)
    expect(r.guides).toContainEqual({ axis: 'x', position: 500 })
  })
})

describe('alignFrame', () => {
  test('가로 중앙 정렬', () => {
    expect(alignFrame(F, 1280, 720, 'center-h')).toEqual({ ...F, left: 540 })
  })
  test('아래 정렬', () => {
    expect(alignFrame(F, 1280, 720, 'bottom')).toEqual({ ...F, top: 620 })
  })
})
