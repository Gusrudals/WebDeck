import { describe, expect, test } from 'vitest'
import {
  absPointsOf, curveFromDrag, elbowFromDrag, lineFromEndpoints, moveElbowEndpoint, moveElbowSegment, normalizePoints, segmentAxis,
} from './pathOps.ts'

describe('absPointsOf / normalizePoints', () => {
  test('%→px 왕복', () => {
    const frame = { left: 100, top: 50, width: 200, height: 100 }
    expect(absPointsOf(frame, [[0, 0], [50, 100]])).toEqual([[100, 50], [200, 150]])
  })
  test('재정규화: bbox가 frame, 점은 0~100%', () => {
    const { frame, points } = normalizePoints([[100, 50], [300, 50], [300, 250]])
    expect(frame).toEqual({ left: 100, top: 50, width: 200, height: 200 })
    expect(points).toEqual([[0, 0], [100, 0], [100, 100]])
  })
  test('퇴화 축 가드: 변 1px 미만이면 frame 8px·점 50%', () => {
    const { frame, points } = normalizePoints([[100, 80], [300, 80]])
    expect(frame).toEqual({ left: 100, top: 76, width: 200, height: 8 })
    expect(points).toEqual([[0, 50], [100, 50]])
  })
})

describe('segmentAxis / moveElbowSegment / moveElbowEndpoint', () => {
  const Z: [number, number][] = [[0, 0], [160, 0], [160, 160], [320, 160]]
  test('축 판별: h/v/비직교 null', () => {
    expect(segmentAxis([0, 0], [160, 0])).toBe('h')
    expect(segmentAxis([160, 0], [160, 160])).toBe('v')
    expect(segmentAxis([0, 0], [70, 30])).toBeNull()
  })
  test('V 세그먼트는 좌우로만: 양 끝 x 갱신', () => {
    expect(moveElbowSegment(Z, 1, 40, 99)).toEqual([[0, 0], [200, 0], [200, 160], [320, 160]])
  })
  test('H 세그먼트는 상하로만: 양 끝 y 갱신', () => {
    expect(moveElbowSegment(Z, 0, 99, 24)).toEqual([[0, 24], [160, 24], [160, 160], [320, 160]])
  })
  test('끝점 이동: 인접 꺾임점의 공유 축 동기 (첫 세그먼트 h → 인접점 y 동기)', () => {
    expect(moveElbowEndpoint(Z, 'start', [-40, 48])).toEqual([[-40, 48], [160, 48], [160, 160], [320, 160]])
    expect(moveElbowEndpoint(Z, 'end', [400, 200])).toEqual([[0, 0], [160, 0], [160, 200], [400, 200]])
  })
  test('2점 직선·비직교 인접이면 끝점만 교체', () => {
    expect(moveElbowEndpoint([[0, 0], [100, 0]], 'start', [10, 20])).toEqual([[10, 20], [100, 0]])
    expect(moveElbowEndpoint([[0, 0], [70, 30], [160, 30]], 'start', [5, 5])).toEqual([[5, 5], [70, 30], [160, 30]])
  })
})

describe('elbowFromDrag / curveFromDrag / lineFromEndpoints', () => {
  test('가로 우세 → H-V-H(Z자), 방향 모서리 반영', () => {
    const { frame, points } = elbowFromDrag([100, 100], [420, 260])
    expect(frame).toEqual({ left: 100, top: 100, width: 320, height: 160 })
    expect(points).toEqual([[0, 0], [50, 0], [50, 100], [100, 100]])
    // 우→좌 드래그: 시작이 오른쪽 모서리
    expect(elbowFromDrag([420, 100], [100, 260]).points).toEqual([[100, 0], [50, 0], [50, 100], [0, 100]])
  })
  test('세로 우세 → V-H-V', () => {
    expect(elbowFromDrag([100, 100], [260, 420]).points).toEqual([[0, 0], [0, 50], [100, 50], [100, 100]])
  })
  test('퇴화 축(수평 드래그)은 8px·50%', () => {
    const { frame, points } = elbowFromDrag([100, 100], [420, 100])
    expect(frame.height).toBe(8)
    expect(points).toEqual([[0, 50], [50, 50], [50, 50], [100, 50]])
  })
  test('curveFromDrag: 4점·재정규화 완료(모든 점 0~100, frame=점 bbox)', () => {
    const { frame, points } = curveFromDrag([100, 300], [400, 300])
    expect(points).toHaveLength(4)
    expect(points[0]).toEqual([0, 100])
    expect(points[3]).toEqual([100, 100])
    // 아치 제어점(직선 길이 300의 25% = 75px 위)이 frame 안(0~100%)에 들어와 있다
    expect(frame).toEqual({ left: 100, top: 225, width: 300, height: 75 })
    expect(points[1]![1]).toBe(0)
    expect(points[2]![1]).toBe(0)
  })
  test('lineFromEndpoints: 중심·거리·각도 (9c 수학 동일)', () => {
    expect(lineFromEndpoints([100, 100], [100, 300], 8)).toEqual({
      frame: { left: 0, top: 196, width: 200, height: 8 },
      rotation: 90,
    })
  })
})
