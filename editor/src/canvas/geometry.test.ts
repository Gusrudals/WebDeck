import { describe, expect, test } from 'vitest'
import { alignFrame, angleFromCenter, buildSnapTargets, distributeFrames, resizeFrame, snapAngle, snapMove, snapResize } from './geometry.ts'

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

describe('resizeFrame lockAspect', () => {
  const orig = { left: 100, top: 100, width: 200, height: 100 }

  test('se 핸들 + lockAspect는 종횡비 2:1을 유지한다', () => {
    const f = resizeFrame(orig, 'se', 100, 0, true)
    expect(f.width / f.height).toBeCloseTo(2)
    expect(f.left).toBe(100)
    expect(f.top).toBe(100)
  })

  test('nw 핸들 + lockAspect는 오른쪽 아래 모서리를 고정한다', () => {
    const f = resizeFrame(orig, 'nw', -100, 0, true)
    expect(f.width / f.height).toBeCloseTo(2)
    expect(f.left + f.width).toBe(300)
    expect(f.top + f.height).toBe(200)
  })

  test('변 핸들에서는 lockAspect가 무시된다', () => {
    expect(resizeFrame(orig, 'e', 50, 0, true)).toEqual({ left: 100, top: 100, width: 250, height: 100 })
  })
})

describe('distributeFrames', () => {
  test('x축: 첫/끝 고정, 사이 간격을 균등화한다', () => {
    const frames = [
      { left: 0, top: 0, width: 100, height: 50 },
      { left: 120, top: 0, width: 100, height: 50 },
      { left: 500, top: 0, width: 100, height: 50 },
    ]
    const out = distributeFrames(frames, 'x')
    expect(out[0]).toEqual(frames[0])
    expect(out[2]).toEqual(frames[2])
    // 전체 스팬 600 - 크기 합 300 = 여백 300, 간격 150 → 가운데는 0+100+150
    expect(out[1]!.left).toBe(250)
  })

  test('입력 순서와 무관하게 좌표순으로 분배하고 원래 순서로 반환한다', () => {
    const frames = [
      { left: 500, top: 0, width: 100, height: 50 },
      { left: 0, top: 0, width: 100, height: 50 },
      { left: 120, top: 0, width: 100, height: 50 },
    ]
    const out = distributeFrames(frames, 'x')
    expect(out[0]).toEqual(frames[0])
    expect(out[1]).toEqual(frames[1])
    expect(out[2]!.left).toBe(250)
  })

  test('y축 분배', () => {
    const frames = [
      { left: 0, top: 0, width: 50, height: 100 },
      { left: 0, top: 900, width: 50, height: 100 },
      { left: 0, top: 200, width: 50, height: 100 },
    ]
    const out = distributeFrames(frames, 'y')
    expect(out[2]!.top).toBe(450) // 0+100+350 (스팬 1000, 크기합 300, 간격 350)
  })

  test('2개 이하면 그대로 반환한다', () => {
    const frames = [
      { left: 0, top: 0, width: 100, height: 50 },
      { left: 300, top: 0, width: 100, height: 50 },
    ]
    expect(distributeFrames(frames, 'x')).toEqual(frames)
  })
})

describe('회전 기하', () => {
  test('angleFromCenter — 12시 0°, 3시 90°, 6시 180°, 9시 270°', () => {
    expect(angleFromCenter(100, 100, 100, 0)).toBe(0)
    expect(angleFromCenter(100, 100, 200, 100)).toBe(90)
    expect(angleFromCenter(100, 100, 100, 200)).toBe(180)
    expect(angleFromCenter(100, 100, 0, 100)).toBe(270)
  })

  test('snapAngle — 15° 단위 스냅과 360 랩', () => {
    expect(snapAngle(22)).toBe(15)
    expect(snapAngle(23)).toBe(30)
    expect(snapAngle(358)).toBe(0)
  })
})

describe('snapResize', () => {
  const targets = { xs: [0, 300, 640], ys: [0, 200, 360] }
  const orig = { left: 100, top: 100, width: 100, height: 100 }

  test('e 핸들: 오른쪽 변이 대상에 흡착된다', () => {
    // dx 96 → 오른쪽 변 296, 대상 300까지 4px(임계 6 이내) → 흡착
    const { frame, guides } = snapResize(orig, 'e', 96, 0, targets)
    expect(frame.width).toBe(200)
    expect(guides).toEqual([{ axis: 'x', position: 300 }])
  })

  test('w 핸들: 왼쪽 변 흡착은 left와 width를 함께 보정한다', () => {
    // dx -96 → 왼쪽 변 4, 대상 0까지 4px → left 0, width 200
    const { frame } = snapResize(orig, 'w', -96, 0, targets)
    expect(frame.left).toBe(0)
    expect(frame.width).toBe(200)
  })

  test('s 핸들: 아래 변이 y 대상에 흡착된다', () => {
    // dy 156 → 아래 변 356, 대상 360까지 4px(임계 6 이내) → 흡착
    const { frame, guides } = snapResize(orig, 's', 0, 156, targets)
    expect(frame.height).toBe(260) // top 100 고정, 아래 변 360
    expect(guides).toEqual([{ axis: 'y', position: 360 }])
  })

  test('임계값 밖이면 흡착하지 않는다', () => {
    const { frame, guides } = snapResize(orig, 'e', 50, 0, targets)
    expect(frame.width).toBe(150)
    expect(guides).toEqual([])
  })
})
