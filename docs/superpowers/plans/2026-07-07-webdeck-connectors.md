# WebDeck Plan 9d — 꺾인 연결선·곡선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `data-shape` 2종(elbow 직교 폴리라인·curve 3차 베지어)과 경유점(`data-points` % 좌표) 모델, 드래그 그리기, 전용 핸들 편집(elbow 세그먼트·curve 제어점·line/arrow 끝점)을 추가한다.

**Architecture:** 경유점은 frame 기준 % 좌표로 저장(`points: Point[]` 필드 + `data-points` 필수 속성) — 리사이즈 자동 스케일, 불변량 "frame = 점 bbox"는 에디터 편집 연산이 재정규화로 유지. 정준 SVG는 직렬화·렌더 시점에 %→px 환산 재생성(polyline/path는 % 미지원). 경유점 순수 연산은 신규 `model/pathOps.ts`, 핸들은 SelectionOverlay에 점 핸들 레이어 추가(line/arrow는 8핸들·회전 핸들을 끝점 2개로 대체).

**Tech Stack:** React 19 + TypeScript strict + Vite 8, Vitest + happy-dom + RTL, node:test + node-html-parser (tools)

**스펙:** `docs/superpowers/specs/2026-07-07-webdeck-connectors-design.md`

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess`, 상대 import `.ts`/`.tsx` 확장자. 신규 의존성 금지. 리듀서(`state/store.ts`)·런타임·템플릿 무변경
- `ShapeKind` 7종: `'rect' | 'ellipse' | 'rounded' | 'line' | 'arrow' | 'elbow' | 'curve'`. `StrokeKind = 'line' | 'arrow' | 'elbow' | 'curve'`, `Point = [number, number]`(% 좌표)
- 승격 조건: elbow = data-points 파싱 성공 + 점 ≥ 2, curve = 정확히 4점. **위반(부재·형식 오류·개수) 시 opaque 강등**. % 좌표는 0~100 밖도 수용, elbow 직교성은 파서 비강제(편집 연산 유지·검증기 경고)
- 선 서식 4필드/4속성(9c)을 elbow/curve에 그대로 — `lineDefaults`는 StrokeKind 4종으로 확장(elbow/curve 기본 = 굵기 2·실선·머리 없음). 판별자: `isLinear`(line/arrow) 유지, `isStroke`(4종)·`isPath`(elbow/curve) 신설
- 정준 SVG: px = %/100 × frame 변, **소수 2자리 반올림**(결정적). polyline/path에 **`fill="none"` 필수**. 대시 정준식·marker 규격(5/2.5·strokeWidth 단위·auto-start-reverse)은 9c와 공유 — **기존 line/arrow 정준 출력 바이트 불변**(회귀 테스트 존재)
- `data-points` 직렬화: 좌표 소수 최대 2자리, `x,y` 쌍을 공백 구분. 항상 출력(필수 속성). 왕복 계약은 모델 동등성(checkRoundTrip)
- 재정규화: 점 px 절대좌표 bbox → 새 frame + 새 %. bbox 변 < 1px이면 해당 축 frame 8px·그 축 점들 50% (0 나눗셈 가드)
- 그리기: elbow는 |dx|≥|dy|면 H-V-H `[(sx,sy),(50,sy),(50,ey),(ex,ey)]` 아니면 V-H-V `[(sx,sy),(sx,50),(ex,50),(ex,ey)]` (sx/sy/ex/ey = p1·p2의 bbox 모서리 %, 퇴화 축은 50). curve = 1/3·2/3 지점 수직(px 공간) 오프셋 25% 아치 + 생성 직후 재정규화. 클릭 폴백(8px 미만) = `PATH_INSERT_FRAME = { left: 480, top: 280, width: 320, height: 160 }` + 기본 points(elbow `[[0,0],[50,0],[50,100],[100,100]]`, curve `[[0,100],[33.33,0],[66.67,0],[100,100]]`). Shift 15° 스냅은 line/arrow 전용
- 핸들: line/arrow = 끝점 2개가 8핸들·회전 핸들 **대체**(rotation ≠ 0에서도 동작, Shift 15°). elbow = 끝점 2 + 중간 세그먼트 중점 핸들(첫·끝 세그먼트 제외, H는 상하만·V는 좌우만, 직교 불변, 끝점 드래그 시 인접 꺾임점 공유 축 동기). curve = 끝점 2 + 제어점 2(끝점과 점선 가이드). elbow/curve 핸들은 rotation 0 전제, 8핸들 리사이즈는 유지. 그리기 모드 중 핸들 전체 비표시(9c 게이트)
- 1 조작 = 1 APPLY_DOC. 문구 verbatim: 도형 메뉴 `꺾인 연결선`/`곡선`
- 테스트: `cd editor && npx vitest run <파일>`, tools는 `cd tools && node --test`, 전체 `npm run test:all`(루트)

---

### Task 1: 모델 — kind 2종·points 필드·정준 SVG·파서/직렬화

**Files:**
- Modify: `editor/src/model/types.ts` (ShapeKind·Point·points 필드)
- Modify: `editor/src/model/shapeSvg.ts` (isStroke/isPath, lineDefaults 확장, strokeAttrs 헬퍼 추출, pathInnerHtml)
- Modify: `editor/src/model/parse.ts:17,160-171` (SHAPE_KINDS 7종, readPoints, elbow/curve 승격)
- Modify: `editor/src/model/serialize.ts:67-80` (isStroke 분기·data-points·pathInnerHtml)
- Modify: `editor/src/model/ops.ts` (createShape 기본 points, PATH_INSERT_FRAME)
- Modify: `editor/src/canvas/ElementView.tsx:49-59` (elbow/curve 렌더)
- Test: `editor/src/model/shapes.test.ts`, `editor/src/model/roundtrip.test.ts`

**Interfaces:**
- Produces (Task 2~6이 사용):
  - types.ts: `export type Point = [number, number]`, `ShapeKind` 7종, `ShapeElement.points: Point[]`(elbow/curve 외 `[]`)
  - shapeSvg.ts: `export type StrokeKind = 'line' | 'arrow' | 'elbow' | 'curve'`, `isStroke(shape: ShapeKind): shape is StrokeKind`, `isPath(shape: ShapeKind): shape is 'elbow' | 'curve'`, `lineDefaults(kind: StrokeKind): LineStyle`, `pathInnerHtml(kind: 'elbow' | 'curve', uid: string, style: LineStyle, points: Point[], frameW: number, frameH: number): string`
  - ops.ts: `PATH_INSERT_FRAME: Frame`, `createShape`가 elbow/curve에 기본 points를 채움(elbow `[[0,0],[50,0],[50,100],[100,100]]`, curve `[[0,100],[33.33,0],[66.67,0],[100,100]]`, extraStyle `{ color: '#374151' }`)

- [ ] **Step 1: 실패하는 테스트 작성** — `shapes.test.ts`에 추가:

```ts
import { isPath, isStroke, pathInnerHtml } from './shapeSvg.ts'

describe('경유점 도형 — 정준 SVG (Plan 9d)', () => {
  test('elbow: %→px 환산 polyline + fill none', () => {
    const html = pathInnerHtml('elbow', 'x', lineDefaults('elbow'), [[0, 0], [50, 0], [50, 100], [100, 100]], 320, 160)
    expect(html).toContain('<polyline points="0,0 160,0 160,160 320,160" fill="none" stroke="currentColor" stroke-width="2"')
    expect(html).not.toContain('<defs>')
  })
  test('curve: 4점 베지어 path + px 소수 2자리 반올림', () => {
    const html = pathInnerHtml('curve', 'x', lineDefaults('curve'), [[0, 100], [33.33, 0], [66.67, 0], [100, 100]], 300, 100)
    expect(html).toContain('<path d="M 0,100 C 99.99,0 200.01,0 300,100" fill="none"')
  })
  test('elbow의 대시·머리는 9c 정준식·marker 규격 공유', () => {
    const html = pathInnerHtml('elbow', 'abc', { strokeWidth: 4, strokeDash: 'dashed', headStart: false, headEnd: true }, [[0, 0], [100, 0]], 100, 8)
    expect(html).toContain('stroke-dasharray="12 8"')
    expect(html).toContain('markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto-start-reverse" markerUnits="strokeWidth"')
    expect(html).toContain('marker-end="url(#wd-arrow-head-abc)"')
  })
  test('line 정준 출력은 바이트 불변 (헬퍼 추출 회귀)', () => {
    expect(shapeInnerHtml('x', lineDefaults('line'))).toBe(
      '<svg width="100%" height="100%" style="overflow: visible; display: block;"><line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" stroke-width="2"></line></svg>',
    )
  })
  test('판별자: isStroke 4종·isPath 2종·lineDefaults elbow/curve 기본', () => {
    expect(isStroke('elbow') && isStroke('curve') && isStroke('line') && isStroke('arrow')).toBe(true)
    expect(isStroke('rect')).toBe(false)
    expect(isPath('elbow') && isPath('curve')).toBe(true)
    expect(isPath('line')).toBe(false)
    expect(lineDefaults('elbow')).toEqual({ strokeWidth: 2, strokeDash: 'solid', headStart: false, headEnd: false })
  })
})

describe('경유점 도형 — 파서/직렬화 (Plan 9d)', () => {
  const docOf = (kind: string, attrs: string) =>
    parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-shape" data-shape="${kind}"${attrs} style="left:0px; top:0px; width:320px; height:160px;"></div></section>
</main></body></html>`)
  const first = (doc: DeckDoc) => doc.slides[0]!.elements[0]!

  test('elbow: data-points 승격 + 선 서식 병행', () => {
    const el = first(docOf('elbow', ' data-points="0,0 50,0 50,100 100,100" data-stroke-dash="dotted"')) as ShapeElement
    expect(el.type).toBe('shape')
    expect(el.points).toEqual([[0, 0], [50, 0], [50, 100], [100, 100]])
    expect(el.strokeDash).toBe('dotted')
    expect(el.extraAttrs).toEqual({})
  })
  test('opaque 강등: 부재·형식 오류·개수 위반', () => {
    expect(first(docOf('elbow', '')).type).toBe('opaque')
    expect(first(docOf('elbow', ' data-points="0,0 abc,5"')).type).toBe('opaque')
    expect(first(docOf('elbow', ' data-points="0,0"')).type).toBe('opaque')
    expect(first(docOf('curve', ' data-points="0,0 50,0 100,100"')).type).toBe('opaque')
  })
  test('% 밖 좌표·비직교는 수용 (관용)', () => {
    const el = first(docOf('curve', ' data-points="0,100 33,-25 67,-25 100,100"')) as ShapeElement
    expect(el.type).toBe('shape')
    expect(el.points[1]).toEqual([33, -25])
    expect((first(docOf('elbow', ' data-points="0,0 70,30"')) as ShapeElement).type).toBe('shape')
  })
  test('직렬화: data-points 소수 2자리 + 왕복 동등', () => {
    const doc = docOf('curve', ' data-points="0,100 33.333,0 66.667,0 100,100" data-head-end="1"')
    const html = serializeWebdeck(doc)
    expect(html).toContain('data-points="0,100 33.33,0 66.67,0 100,100"')
    expect(html).toContain('data-head-end="1"')
    expect(html).toContain('<path d=')
    expect(checkRoundTrip(doc)).toBeNull()
  })
  test('createShape: elbow/curve 기본 points·색', () => {
    const el = createShape(() => 'e1', 'elbow', { left: 0, top: 0, width: 100, height: 100 })
    expect(el.points).toEqual([[0, 0], [50, 0], [50, 100], [100, 100]])
    expect(el.extraStyle['color']).toBe('#374151')
    expect(createShape(() => 'r1', 'rect', { left: 0, top: 0, width: 10, height: 10 }).points).toEqual([])
  })
})
```

(import는 파일 상단 기존 것에 추가. `docOf`/`first` 등 이름이 기존 픽스처와 충돌하면 describe 로컬로 유지.)

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/shapes.test.ts`
Expected: FAIL — isStroke/pathInnerHtml export 없음

- [ ] **Step 3: 구현**

`types.ts`:

```ts
export type ShapeKind = 'rect' | 'ellipse' | 'rounded' | 'line' | 'arrow' | 'elbow' | 'curve'

/** 경유점 % 좌표 (frame 기준, 0~100 밖 허용) */
export type Point = [number, number]

export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: ShapeKind
  strokeWidth: number
  strokeDash: StrokeDash
  headStart: boolean
  headEnd: boolean
  /** 경유점 — elbow(≥2)/curve(정확 4)에서만 의미, 그 외 kind는 [] (스펙 9d §2) */
  points: Point[]
}
```

`shapeSvg.ts` — lineDefaults 시그니처 확장, 대시/marker 헬퍼 추출(기존 line 출력 바이트 불변), pathInnerHtml 추가:

```ts
import type { Point, ShapeKind, StrokeDash } from './types.ts'

export type StrokeKind = 'line' | 'arrow' | 'elbow' | 'curve'

/** kind별 선 서식 기본값 — 파서 폴백·직렬화 생략 판정의 유일 원본 (스펙 §2) */
export function lineDefaults(kind: StrokeKind): LineStyle {
  return { strokeWidth: 2, strokeDash: 'solid', headStart: false, headEnd: kind === 'arrow' }
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
```

(주의: `common`에 markers가 polyline 속성으로 붙는다 — polyline/path 요소에 marker-start/end가 직접 붙는 것이 맞다. curve의 `abs[0]` 등은 noUncheckedIndexedAccess로 `abs[0]!` 필요.)

`parse.ts` — `SHAPE_KINDS`에 `'elbow', 'curve'` 추가, 하단에 readPoints 추가, el-shape 분기 교체:

```ts
const SHAPE_KINDS = ['rect', 'ellipse', 'rounded', 'line', 'arrow', 'elbow', 'curve'] as const

/**
 * data-points 파싱 — 형식 위반이면 null (호출부가 opaque 강등, 스펙 9d §2).
 * 좌표를 소수 2자리로 정준화한다 — 직렬화가 2자리로 출력하므로(serialize fmt), 파서도
 * 같은 정밀도로 맞추지 않으면 3자리 이상 좌표를 가진 AI 문서가 checkRoundTrip(모델 동등성)에
 * 걸려 편집 없이도 저장이 차단된다. round2는 멱등이라 파서·직렬화가 이후 항상 일치한다.
 */
function readPoints(el: Element): Point[] | null {
  const raw = el.getAttribute('data-points')
  if (raw === null || raw.trim() === '') return null
  const pts: Point[] = []
  for (const pair of raw.trim().split(/\s+/)) {
    const xy = pair.split(',')
    if (xy.length !== 2) return null
    const x = Number(xy[0])
    const y = Number(xy[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    pts.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100])
  }
  return pts
}
```

(정준화 결과, Step 1의 왕복 테스트가 `data-points="0,100 33.333,0 66.667,0 100,100"` 3자리 입력을 파서에서 33.33/66.67로 정규화 → 직렬화 출력·재파싱이 정확히 일치 → `checkRoundTrip` null. 세 문자열 단언과 checkRoundTrip 단언 모두 통과한다.)

el-shape 분기(현 160-171행)를 다음으로 교체:

```ts
  if (el.classList.contains('el-shape')) {
    const kind = el.getAttribute('data-shape') as (typeof SHAPE_KINDS)[number] | null
    if (kind === null || !SHAPE_KINDS.includes(kind)) return opaque()
    if (!isStroke(kind)) {
      const hasChildren = el.children.length > 0
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
      if (hasChildren || hasText) return opaque()
      return { type: 'shape', id, frame, rotation, extraStyle, extraAttrs, extraClasses, shape: kind, ...lineDefaults('line'), points: [] }
    }
    if (isPath(kind)) {
      const points = readPoints(el)
      // points는 형상 그 자체라 기본값이 없다 — 위반 시 opaque 보존 (스펙 9d §2)
      if (points === null || points.length < 2 || (kind === 'curve' && points.length !== 4)) return opaque()
      delete extraAttrs['data-points']
      return { type: 'shape', id, frame, rotation, extraStyle, extraAttrs, extraClasses, shape: kind, ...readLineStyle(el, kind, extraAttrs), points }
    }
    // line/arrow는 내부 마크업을 무시한다 — 직렬화가 정준 SVG를 재생성 (스펙 §3)
    return { type: 'shape', id, frame, rotation, extraStyle, extraAttrs, extraClasses, shape: kind, ...readLineStyle(el, kind, extraAttrs), points: [] }
  }
```

(`readLineStyle`의 kind 매개변수 타입을 `'line' | 'arrow'`에서 `StrokeKind`로 확장 — 본문 변경 없음. import에 `isStroke`, `isPath`, `Point` 추가.)

`serialize.ts` — shape 분기 교체 (현재 import `isLinear, lineDefaults, lineStyleOf, shapeInnerHtml`를 `isStroke, isPath, lineDefaults, lineStyleOf, shapeInnerHtml, pathInnerHtml`로 — isLinear는 새 분기가 안 쓰면 제거):

```ts
    case 'shape': {
      let lineAttrs = ''
      let inner = ''
      if (isStroke(el.shape)) {
        const d = lineDefaults(el.shape)
        if (el.strokeWidth !== d.strokeWidth) lineAttrs += ` data-stroke-width="${el.strokeWidth}"`
        if (el.strokeDash !== d.strokeDash) lineAttrs += ` data-stroke-dash="${el.strokeDash}"`
        if (el.headStart !== d.headStart) lineAttrs += ` data-head-start="${el.headStart ? '1' : '0'}"`
        if (el.headEnd !== d.headEnd) lineAttrs += ` data-head-end="${el.headEnd ? '1' : '0'}"`
        if (isPath(el.shape)) {
          const fmt = (v: number) => String(Math.round(v * 100) / 100)
          lineAttrs += ` data-points="${el.points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')}"`
          inner = pathInnerHtml(el.shape, el.id, lineStyleOf(el), el.points, el.frame.width, el.frame.height)
        } else {
          inner = shapeInnerHtml(el.id, lineStyleOf(el))
        }
      }
      return `<div class="${escapeAttr(elementClass(el))}" data-shape="${el.shape}"${lineAttrs} style="${escapeAttr(style)}"${attrs}>${inner}</div>`
    }
```

(기존 `isLinear` import가 더 이상 안 쓰이면 제거.)

`ops.ts` — createShape 확장 + 상수 (현재 import `isLinear, lineDefaults`에 `isStroke, isPath` 추가 + `Point`(type) 추가 — isLinear는 계속 쓰이면 유지):

```ts
/** elbow/curve 삽입 기본 frame — 그리기 모드의 클릭 폴백이 사용 (스펙 9d §4) */
export const PATH_INSERT_FRAME: Frame = { left: 480, top: 280, width: 320, height: 160 }

const DEFAULT_PATH_POINTS: Record<'elbow' | 'curve', Point[]> = {
  elbow: [[0, 0], [50, 0], [50, 100], [100, 100]],
  curve: [[0, 100], [33.33, 0], [66.67, 0], [100, 100]],
}
```

createShape에서: extraStyle 분기의 `kind === 'line' || kind === 'arrow'`를 `isStroke(kind)`로 바꿔 elbow/curve도 `{ color: '#374151' }`을 받게 하고, 반환을:

```ts
  const line = isStroke(kind) ? lineDefaults(kind) : lineDefaults('line')
  const points: Point[] = isPath(kind) ? DEFAULT_PATH_POINTS[kind].map(([x, y]) => [x, y] as Point) : []
  return { type: 'shape', id: idGen(), frame: { ...frame }, rotation: 0, extraStyle, extraAttrs: {}, extraClasses: [], shape: kind, ...line, points }
```

`ElementView.tsx` — shape 분기에서 isLinear 앞에 추가 (import에 `isPath`, `pathInnerHtml` 추가):

```tsx
    case 'shape':
      if (isPath(element.shape)) {
        return (
          <div
            className="el el-shape"
            style={styleFromModel(element.frame, element.extraStyle, element.rotation)}
            dangerouslySetInnerHTML={{
              __html: pathInnerHtml(element.shape, element.id, lineStyleOf(element), element.points, element.frame.width, element.frame.height),
            }}
            {...handlers}
          />
        )
      }
      if (isLinear(element.shape)) {
```

- [ ] **Step 4: 전체 테스트·타입 통과 확인**

Run: `cd editor && npx vitest run && npx tsc --noEmit`
Expected: PASS 전부 (기존 테스트 중 ShapeElement 리터럴을 직접 만드는 곳이 있으면 `points: []` 추가로 갱신 — createShape 경유 픽스처는 무변경)

- [ ] **Step 5: 커밋**

```bash
git add -A editor/src && git commit -m "feat(model): elbow/curve 경유점 도형 — data-points %좌표·정준 polyline/path (Plan 9d Task 1)"
```

---

### Task 2: 경유점 순수 연산 (`model/pathOps.ts`) + setShapePoints

**Files:**
- Create: `editor/src/model/pathOps.ts`
- Modify: `editor/src/model/ops.ts` (setShapePoints 추가)
- Test: `editor/src/model/pathOps.test.ts` (신규), `editor/src/model/ops.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Point`, `isPath`
- Produces (Task 4·5가 사용):
  - `absPointsOf(frame: Frame, points: Point[]): [number, number][]` — % → 문서 px 절대좌표
  - `normalizePoints(absPoints: [number, number][]): { frame: Frame; points: Point[] }` — bbox 재정규화(변 < 1px이면 그 축 frame 8px·점 50%)
  - `segmentAxis(a: Point, b: Point): 'h' | 'v' | null` — y 공유 = 'h', x 공유 = 'v'(둘 다면 'h'), 아니면 null
  - `moveElbowSegment(abs: [number, number][], seg: number, dx: number, dy: number): [number, number][]` — seg번째 세그먼트가 h면 양 끝 y += dy, v면 x += dx, null이면 원본 반환
  - `moveElbowEndpoint(abs: [number, number][], end: 'start' | 'end', to: [number, number]): [number, number][]` — 끝점 교체 + 인접 꺾임점의 공유 축 동기(인접 세그먼트가 h면 인접점 y = to.y, v면 x = to.x; 점 2개뿐이거나 비직교면 끝점만 교체)
  - `elbowFromDrag(p1: [number, number], p2: [number, number]): { frame: Frame; points: Point[] }` — H-V-H/V-H-V 초기 라우팅(Global Constraints 식)
  - `curveFromDrag(p1: [number, number], p2: [number, number]): { frame: Frame; points: Point[] }` — 아치 생성 + 재정규화 완료 상태 반환
  - `lineFromEndpoints(p1: [number, number], p2: [number, number], height: number): { frame: Frame; rotation: number }` — 9c beginDraw 수학의 추출(중심·거리·각도, Math.round·normalizeAngle 동일)
  - ops.ts: `setShapePoints(doc: DeckDoc, slideId: string, elementId: string, frame: Frame, points: Point[]): DeckDoc` — elbow/curve가 아니면 요소 무변경

- [ ] **Step 1: 실패하는 테스트 작성** — `pathOps.test.ts`:

```ts
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
```

`ops.test.ts`에 추가:

```ts
test('setShapePoints는 elbow/curve의 frame+points만 갱신한다', () => {
  const elbow = createShape(idGen, 'elbow', { left: 0, top: 0, width: 100, height: 100 })
  const doc = addElement(baseDoc, slideId, elbow)
  const next = setShapePoints(doc, slideId, elbow.id, { left: 10, top: 10, width: 50, height: 50 }, [[0, 0], [100, 100]])
  const el = next.slides[0]!.elements.find((e) => e.id === elbow.id) as ShapeElement
  expect(el.frame).toEqual({ left: 10, top: 10, width: 50, height: 50 })
  expect(el.points).toEqual([[0, 0], [100, 100]])
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/pathOps.test.ts src/model/ops.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `pathOps.ts`:

```ts
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
```

`ops.ts`:

```ts
/** 경유점·frame 동시 갱신 — 재정규화 결과 커밋용. elbow/curve 외에는 무변경 */
export function setShapePoints(doc: DeckDoc, slideId: string, elementId: string, frame: Frame, points: Point[]): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) =>
    el.type === 'shape' && isPath(el.shape) ? { ...el, frame: { ...frame }, points: points.map(([x, y]) => [x, y] as Point) } : el,
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/model/pathOps.test.ts src/model/ops.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add -A editor/src && git commit -m "feat(model): 경유점 연산 pathOps — 라우팅·재정규화·세그먼트/끝점 이동 (Plan 9d Task 2)"
```

---

### Task 3: 패널 isStroke 확장 + 검증기

**Files:**
- Modify: `editor/src/panels/PropertiesPanel.tsx:8,137-138` (allLinear → allStroke)
- Modify: `editor/src/model/ops.ts:2,209-212` (setShapeLineStyle 가드 isLinear → isStroke)
- Modify: `tools/lib/validate.mjs` (7종·data-points·비직교 경고·선 서식 검증 확장)
- Test: `editor/src/panels/PropertiesPanel.test.tsx`, `editor/src/model/ops.test.ts`, `tools/lib/validate.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `isStroke`
- Produces: `setShapeLineStyle`가 elbow/curve에도 서식을 패치(9c 시그니처 불변, 가드만 확장)

- [ ] **Step 1: 실패하는 테스트 작성**

`PropertiesPanel.test.tsx` — 기존 렌더 헬퍼 관례로:

```ts
test('elbow 단일 선택도 선 섹션이 보이고 테두리는 숨는다', () => {
  // data-shape="elbow" data-points="0,0 50,0 50,100 100,100" 문서 렌더 → 요소 선택
  // getByLabelText('파선') 존재, queryByLabelText('테두리 두께') null
})
test('curve 선택 시 채우기는 color에 매핑된다', () => {
  // 채우기 색 픽 → APPLY_DOC의 extraStyle['color'] 반영 (background 아님)
})
test('elbow의 파선 적용이 실제로 strokeDash를 바꾼다 (setShapeLineStyle 가드 회귀)', () => {
  // elbow 선택 → 선 섹션 '파선' 클릭 → APPLY_DOC doc의 elbow 요소 strokeDash === 'dashed'
  // (isLinear 가드였다면 no-op이라 solid로 남아 실패)
})
```

`ops.test.ts`:

```ts
test('setShapeLineStyle은 elbow/curve의 서식도 패치한다', () => {
  const elbow = createShape(idGen, 'elbow', { left: 0, top: 0, width: 100, height: 100 })
  const doc = addElement(baseDoc, slideId, elbow)
  const next = setShapeLineStyle(doc, slideId, elbow.id, { strokeWidth: 5, headEnd: true })
  const el = next.slides[0]!.elements.find((e) => e.id === elbow.id) as ShapeElement
  expect(el.strokeWidth).toBe(5)
  expect(el.headEnd).toBe(true)
})
```

`validate.test.mjs`:

```js
test('elbow/curve: data-points 필수·형식·개수 오류', () => {
  // elbow에 data-points 없음 → 오류 'data-points가 필요합니다'
  // curve에 data-points="0,0 1,1 2,2" (3점) → 오류 'curve의 data-points는 정확히 4점이어야 합니다'
  // elbow에 data-points="0,0 a,b" → 오류 '유한한 숫자 쌍'
})
test('elbow 비직교는 경고', () => {
  // data-points="0,0 70,30" → warnings에 '직교(수평/수직)가 아닙니다' 포함, errors 0
})
test('elbow의 선 서식 속성도 검증된다', () => {
  // elbow + data-points 정상 + data-stroke-dash="wavy" → 오류
})
test('정상 elbow/curve 통과', () => {
  // elbow Z자 + curve 4점 → errors 0
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/panels/PropertiesPanel.test.tsx` / `cd tools && node --test`
Expected: FAIL

- [ ] **Step 3: 구현**

`PropertiesPanel.tsx` — import를 `import { isStroke } from '../model/shapeSvg.ts'`로 바꾸고:

```ts
  /** 전부 stroke 계열(line/arrow/elbow/curve) 선택이면 채우기를 색(color)에 매핑하고 테두리·그림자를 숨긴다 */
  const allStroke = selectedKnown.length > 0 && selectedKnown.every((el) => el.type === 'shape' && isStroke(el.shape))
  const fillKey = allStroke ? 'color' : 'background'
```

이후 파일 내 `allLinear` 사용 3곳(선 섹션 조건 `{allLinear && …}`, `{!allLinear && …}`)을 전부 `allStroke`로 치환.

`ops.ts` — setShapeLineStyle 가드를 확장(import에 `isStroke` 추가 — 기존 `isLinear`도 createShape 등에서 계속 쓰이면 유지, 안 쓰이면 제거):

```ts
export function setShapeLineStyle(doc: DeckDoc, slideId: string, elementId: string, patch: Partial<LineStyle>): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) =>
    el.type === 'shape' && isStroke(el.shape) ? { ...el, ...patch } : el,
  )
}
```

(Task 1에서 이미 ops.ts import에 isStroke를 추가했다면 중복 추가하지 말 것 — createShape가 isStroke를 쓰므로 Task 1 시점에 이미 들어와 있다.)

`validate.mjs` — SHAPE_KINDS 7종으로 확장하고 el-shape 블록을 재구성:

```js
    if (type === 'el-shape') {
      const SHAPE_KINDS = ['rect', 'ellipse', 'rounded', 'line', 'arrow', 'elbow', 'curve']
      const STROKE_KINDS = ['line', 'arrow', 'elbow', 'curve']
      const kind = el.getAttribute('data-shape')
      if (!SHAPE_KINDS.includes(kind)) {
        errors.push(`${label}: el-shape의 data-shape는 rect/ellipse/rounded/line/arrow/elbow/curve만 지원합니다 (v1.1)`)
      } else if (STROKE_KINDS.includes(kind)) {
        const kids = el.childNodes.filter((n) => n.nodeType === 1)
        if (kids.length > 1 || (kids.length === 1 && kids[0].rawTagName.toLowerCase() !== 'svg')) {
          errors.push(`${label}: ${kind} 도형의 자식은 svg 1개만 허용됩니다`)
        }
        const w = el.getAttribute('data-stroke-width')
        if (w != null && !/^[1-9][0-9]*$/.test(w)) {
          errors.push(`${label}: data-stroke-width는 양의 정수여야 합니다`)
        }
        const dash = el.getAttribute('data-stroke-dash')
        if (dash != null && dash !== 'dashed' && dash !== 'dotted') {
          errors.push(`${label}: data-stroke-dash는 dashed/dotted만 지원합니다`)
        }
        for (const name of ['data-head-start', 'data-head-end']) {
          const v = el.getAttribute(name)
          if (v != null && v !== '0' && v !== '1') {
            errors.push(`${label}: ${name}는 0 또는 1이어야 합니다`)
          }
        }
        if (kind === 'elbow' || kind === 'curve') {
          const raw = el.getAttribute('data-points')
          if (raw == null || raw.trim() === '') {
            errors.push(`${label}: ${kind}에는 data-points가 필요합니다`)
          } else {
            const pts = []
            let bad = false
            for (const pair of raw.trim().split(/\s+/)) {
              const xy = pair.split(',')
              if (xy.length !== 2 || !Number.isFinite(Number(xy[0])) || !Number.isFinite(Number(xy[1]))) {
                bad = true
                break
              }
              pts.push([Number(xy[0]), Number(xy[1])])
            }
            if (bad) {
              errors.push(`${label}: data-points는 "x,y x,y ..." 형식의 유한한 숫자 쌍이어야 합니다`)
            } else if (kind === 'curve' && pts.length !== 4) {
              errors.push(`${label}: curve의 data-points는 정확히 4점이어야 합니다`)
            } else if (kind === 'elbow' && pts.length < 2) {
              errors.push(`${label}: elbow의 data-points는 점 2개 이상이어야 합니다`)
            } else if (kind === 'elbow') {
              const nonOrtho = pts.some((p, i) => i > 0 && p[0] !== pts[i - 1][0] && p[1] !== pts[i - 1][1])
              if (nonOrtho) {
                warnings.push(`${label}: elbow의 연속 점이 직교(수평/수직)가 아닙니다 — 에디터 세그먼트 편집이 제한됩니다`)
              }
            }
          }
        }
      }
    }
```

(기존 line/arrow 전용 블록의 자식 svg 검사·선 서식 검사가 이 재구성에 흡수된다 — 기존 오류 문구는 그대로 유지하되 data-shape 5종 문구만 7종으로 갱신. 기존 테스트 중 5종 문구를 단언하는 게 있으면 갱신.)

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/panels/PropertiesPanel.test.tsx && cd ../tools && node --test`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add -A editor/src tools && git commit -m "feat: 패널 stroke 4종 확장 + elbow/curve 검증 (Plan 9d Task 3)"
```

---

### Task 4: 드래그 그리기 확장 (elbow/curve)

**Files:**
- Modify: `editor/src/App.tsx:37` (drawMode 타입)
- Modify: `editor/src/panels/Toolbar.tsx` (메뉴 2항목·타입·분기)
- Modify: `editor/src/canvas/CanvasArea.tsx` (beginDraw 분기·프리뷰)
- Test: `editor/src/canvas/CanvasArea.test.tsx`, `editor/src/panels/Toolbar.test.tsx`

**Interfaces:**
- Consumes: Task 1 `PATH_INSERT_FRAME`·`createShape`(기본 points), Task 2 `elbowFromDrag`/`curveFromDrag`/`lineFromEndpoints`
- Produces: `drawMode` 타입이 `StrokeKind | null`로 확장(App·Toolbar·CanvasArea 3곳 시그니처 일치 — `import type { StrokeKind } from './model/shapeSvg.ts'` 경로는 파일 위치에 맞게)

- [ ] **Step 1: 실패하는 테스트 작성**

`Toolbar.test.tsx`:

```ts
test('꺾인 연결선/곡선 메뉴는 그리기 모드에 진입한다', () => {
  // 도형 → '꺾인 연결선' 클릭: setDrawMode('elbow'), APPLY_DOC 미발생. '곡선' → 'curve'
})
```

`CanvasArea.test.tsx` (그리기 describe에 추가 — happy-dom에서 clientX/Y = 문서 좌표):

```ts
test('elbow 드래그: 가로 우세 H-V-H 생성', () => {
  // drawMode='elbow', (100,100)→(420,260) 드래그
  // APPLY_DOC 요소: shape 'elbow', frame {100,100,320,160}, points [[0,0],[50,0],[50,100],[100,100]], rotation 0
})
test('curve 드래그: 4점 아치 + frame = 점 bbox', () => {
  // drawMode='curve', (100,300)→(400,300) 드래그
  // frame {100,225,300,75}, points[0]=[0,100], points[3]=[100,100]
})
test('elbow 클릭 폴백: PATH_INSERT_FRAME + 기본 Z자', () => {
  // 제자리 클릭 → frame {480,280,320,160}, points [[0,0],[50,0],[50,100],[100,100]]
})
test('elbow 드래그에서 Shift는 스냅하지 않는다', () => {
  // (100,100)→(420,270) shiftKey → frame height 170 그대로 (15° 재투영 없음)
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/canvas/CanvasArea.test.tsx src/panels/Toolbar.test.tsx`
Expected: FAIL

- [ ] **Step 3: 구현**

`App.tsx`: `const [drawMode, setDrawMode] = useState<StrokeKind | null>(null)` (+ `import type { StrokeKind } from './model/shapeSvg.ts'`).

`Toolbar.tsx`: props 타입 `drawMode: StrokeKind | null`, `setDrawMode: (m: StrokeKind | null) => void`. SHAPE_MENU에 추가:

```ts
    { kind: 'elbow', label: '꺾인 연결선' },
    { kind: 'curve', label: '곡선' },
```

메뉴 클릭 분기를 `if (isStroke(s.kind)) setDrawMode(s.kind); else insertShapeKind(s.kind)`로 (import에 `isStroke`).

`CanvasArea.tsx`: props 타입 동일 확장. beginDraw의 onMove에서 Shift 스냅을 `if (ev.shiftKey && (kind === 'line' || kind === 'arrow'))`로 제한. onUp을 분기:

```ts
    const onUp = () => {
      cleanup()
      setDrawMode(null)
      const p1: [number, number] = [x1, y1]
      const p2: [number, number] = [current.x2, current.y2]
      const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
      if (dist < DRAW_MIN_DIST) {
        // 클릭 폴백 — 기본 도형 삽입 (스펙 §5·9d §4)
        const el = isPath(kind)
          ? createShape(idGen, kind, PATH_INSERT_FRAME)
          : createShape(idGen, kind, LINEAR_INSERT_FRAME)
        dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
        return
      }
      if (isPath(kind)) {
        const { frame, points } = kind === 'elbow' ? elbowFromDrag(p1, p2) : curveFromDrag(p1, p2)
        const el = { ...createShape(idGen, kind, frame), points }
        dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
        return
      }
      const { frame, rotation } = lineFromEndpoints(p1, p2, LINEAR_INSERT_FRAME.height)
      const el = { ...createShape(idGen, kind, frame), rotation }
      dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
    }
```

(기존 인라인 중심·각도 수학을 `lineFromEndpoints` 호출로 대체 — 9c 테스트 기대값 동일. import에 `elbowFromDrag`, `curveFromDrag`, `lineFromEndpoints`(pathOps), `isPath`(shapeSvg), `PATH_INSERT_FRAME`(ops) 추가.)

프리뷰(drawDraft 렌더)를 kind별 실형상으로:

```tsx
              {drawDraft && (
                <svg className="draw-preview" width={doc.slideWidth} height={doc.slideHeight}>
                  {(() => {
                    const p1: [number, number] = [drawDraft.x1, drawDraft.y1]
                    const p2: [number, number] = [drawDraft.x2, drawDraft.y2]
                    const common = { stroke: '#374151', strokeWidth: 2, strokeDasharray: '4 3', fill: 'none' } as const
                    if (drawMode === 'elbow') {
                      const { frame, points } = elbowFromDrag(p1, p2)
                      const abs = absPointsOf(frame, points)
                      return <polyline points={abs.map(([x, y]) => `${x},${y}`).join(' ')} {...common} />
                    }
                    if (drawMode === 'curve') {
                      const { frame, points } = curveFromDrag(p1, p2)
                      const [a, b, c, d] = absPointsOf(frame, points)
                      if (!a || !b || !c || !d) return null
                      return <path d={`M ${a[0]},${a[1]} C ${b[0]},${b[1]} ${c[0]},${c[1]} ${d[0]},${d[1]}`} {...common} />
                    }
                    return <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} {...common} />
                  })()}
                </svg>
              )}
```

(import에 `absPointsOf` 추가.)

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run && npx tsc --noEmit`
Expected: PASS 전부 (기존 line/arrow 그리기 테스트 무변경 통과 — lineFromEndpoints 수학 동일)

- [ ] **Step 5: 커밋**

```bash
git add -A editor/src && git commit -m "feat(editor): elbow/curve 드래그 그리기 — 자동 라우팅·아치·실형상 프리뷰 (Plan 9d Task 4)"
```

---

### Task 5: 전용 핸들 편집 (SelectionOverlay 점 핸들 + 제스처)

**Files:**
- Modify: `editor/src/canvas/SelectionOverlay.tsx` (점 핸들 레이어)
- Modify: `editor/src/canvas/CanvasArea.tsx` (핸들 계산·points/lineend 제스처·line 8핸들 대체)
- Modify: `editor/src/app.css` (.point-handle/.point-guide)
- Test: `editor/src/canvas/CanvasArea.test.tsx`

**Interfaces:**
- Consumes: Task 2 전부(`absPointsOf`/`normalizePoints`/`moveElbowSegment`/`moveElbowEndpoint`/`segmentAxis`/`lineFromEndpoints`), `setShapePoints`(ops)
- Produces: SelectionOverlay 신규 prop:

```ts
export interface PointHandleSpec {
  key: string                       // 'pt-0'(끝점/제어점 = points 인덱스) | 'seg-1'(세그먼트 인덱스)
  x: number                         // 문서 px (slide 좌표)
  y: number
  cursor: 'move' | 'ns-resize' | 'ew-resize'
}
export interface PointsInteraction {
  guides: { x1: number; y1: number; x2: number; y2: number }[]   // curve 제어점 점선
  handles: PointHandleSpec[]
  onPointerDown: (e: ReactPointerEvent, key: string) => void
}
// SelectionOverlay props: points?: PointsInteraction
```

- [ ] **Step 1: 실패하는 테스트 작성** — `CanvasArea.test.tsx`:

```ts
describe('전용 핸들 (Plan 9d)', () => {
  // 픽스처: data-shape="elbow" data-points="0,0 50,0 50,100 100,100" frame 100,100,320,160 문서 → 요소 선택
  test('elbow 선택: 끝점 2 + 중간 세그먼트 핸들 1 (Z자), 8핸들도 유지', () => {
    // .point-handle 3개 (pt-0, pt-3, seg-1), .handle 9개(리사이즈8+회전)
    // seg-1 핸들 위치 = 세그먼트 중점 (260, 180) — abs (260,100)~(260,260)의 중점
  })
  test('elbow 세그먼트 드래그: V 세그먼트는 좌우로만, 커밋 1회 + 재정규화', () => {
    // seg-1 핸들 (260,180) → (300,999)로 드래그: x만 반영
    // APPLY_DOC 1회, 요소 points [[0,0],[62.5,0],[62.5,100],[100,100]] (frame 불변 — bbox 동일)
  })
  test('elbow 끝점 드래그: 인접 축 동기 + frame 재정규화', () => {
    // pt-0 (100,100) → (60,140): points/frame이 normalizePoints([[60,140],[260,140],[260,260],[420,260]]) 결과와 일치
  })
  test('curve 선택: 끝점 2 + 제어점 2 + 가이드 2', () => {
    // data-points="0,100 33.33,0 66.67,0 100,100" → .point-handle 4개, .point-guide 2개
  })
  test('line 선택: 끝점 2개만, 8핸들·회전 핸들 없음', () => {
    // line rotation 0 선택 → .point-handle 2개, .handle 0개
  })
  test('line 끝점 드래그: frame+rotation 재계산 1 APPLY_DOC', () => {
    // frame {300,296,200,8} 가로선(pt-0=(300,300), pt-1=(500,300))의 pt-1을 (300,500)로 드래그.
    // fixed=pt-0=(300,300), moving=(300,500) → lineFromEndpoints([300,300],[300,500],8)
    //   = frame {left:200, top:396, width:200, height:8}, rotation 90. APPLY_DOC 1회.
  })
  test('회전된 elbow는 점 핸들 없음 (패널 수치로)', () => {
    // transform:rotate(30deg) elbow → .point-handle 0개
  })
  test('그리기 모드 중에는 점 핸들도 비표시', () => {
    // elbow 선택 + drawMode='line' → .point-handle 0개 (9c 게이트 회귀)
  })
})
```

(각 테스트의 정확한 기대 좌표는 pathOps 함수를 테스트 안에서 직접 호출해 산출해도 된다 — 구현·기대의 이중 산식 방지.)

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/canvas/CanvasArea.test.tsx`
Expected: FAIL

- [ ] **Step 3: 구현**

`SelectionOverlay.tsx` — props에 `points?: PointsInteraction` 추가(인터페이스는 위 Produces 정의 그대로 이 파일에서 export). selection-box 루프 바깥, guides 렌더 앞에:

```tsx
      {points && (
        <>
          {points.guides.map((g, i) => (
            <svg key={`pg-${i}`} className="point-guide-svg">
              <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} className="point-guide" />
            </svg>
          ))}
          {points.handles.map((h) => (
            <div
              key={h.key}
              className="point-handle"
              role="button"
              aria-label={`점 핸들 ${h.key}`}
              style={{ left: h.x, top: h.y, cursor: h.cursor }}
              onPointerDown={(e) => points.onPointerDown(e, h.key)}
            />
          ))}
        </>
      )}
```

line/arrow의 8핸들·회전 핸들 대체는 CanvasArea가 resize prop을 안 넘기는 방식으로 (SelectionOverlay 변경 불필요).

`app.css` 끝에:

```css
.point-handle { position: absolute; width: 11px; height: 11px; border-radius: 50%; background: #fff; border: 2px solid var(--wd-primary, #1a56db); transform: translate(-50%, -50%); pointer-events: auto; }
.point-guide-svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.point-guide { stroke: var(--wd-primary, #1a56db); stroke-width: 1; stroke-dasharray: 3 3; }
```

`CanvasArea.tsx`:

1. Gesture 유니언에 추가:

```ts
interface PointsGesture { kind: 'points'; slideId: string; id: string; frame: Frame; points: Point[]; changed: boolean }
interface LineEndGesture { kind: 'lineend'; slideId: string; id: string; frame: Frame; rotation: number; changed: boolean }
```

previewDoc에 분기 추가:

```ts
    if (gesture.kind === 'points') {
      if (!gesture.changed) return doc
      return setShapePoints(doc, gesture.slideId, gesture.id, gesture.frame, gesture.points)
    }
    if (gesture.kind === 'lineend') {
      if (!gesture.changed) return doc
      return setElementRotation(setElementFrame(doc, gesture.slideId, gesture.id, gesture.frame), gesture.slideId, gesture.id, gesture.rotation)
    }
```

2. 핸들 스펙 계산. **선언 순서 주의(TDZ)**: `pointsInteraction` IIFE가 `beginPointDrag`를 참조하므로 `beginPointDrag`·`toDocPoint`·`attachDrag`(아래 3·헬퍼)를 이 계산보다 **텍스트상 먼저** 선언해야 한다 — `const` TDZ로 인해 렌더 중 IIFE 평가 시점에 `beginPointDrag`가 아직 초기화 전이면 stroke 도형 선택 시마다 크래시한다. 권장 배치: `beginPointDrag`·`toDocPoint`·`attachDrag`를 다른 `begin*` 핸들러(beginMove/beginResize 등) 사이에 두고, 그 다음에 `previewSlide`·`singleSelected`·아래 `strokeSel`/`pointsInteraction`을 계산한다. (아래 코드 블록은 논리 순서로 제시하지만 파일에서는 3의 함수들이 먼저 와야 한다.)

```ts
  const strokeSel =
    singleSelected && singleSelected.type === 'shape' && isStroke(singleSelected.shape) && !drawMode && editingTextId === null
      ? singleSelected
      : undefined
  // 제스처 미리보기 중에는 미리보기 요소 기준으로 핸들 위치 갱신
  const strokePreview =
    strokeSel && previewSlide.elements.filter(isKnownElement).find((el): el is ShapeElement => el.id === strokeSel.id && el.type === 'shape')
  const pointsInteraction: PointsInteraction | undefined = (() => {
    const el = strokePreview
    if (!el) return undefined
    if (isPath(el.shape)) {
      if (el.rotation !== 0) return undefined
      const abs = absPointsOf(el.frame, el.points)
      const handles: PointHandleSpec[] = []
      const first = abs[0]
      const last = abs[abs.length - 1]
      if (!first || !last) return undefined
      handles.push({ key: 'pt-0', x: first[0], y: first[1], cursor: 'move' })
      handles.push({ key: `pt-${abs.length - 1}`, x: last[0], y: last[1], cursor: 'move' })
      const guides: PointsInteraction['guides'] = []
      if (el.shape === 'curve') {
        const c1 = abs[1]
        const c2 = abs[2]
        if (c1 && c2) {
          handles.push({ key: 'pt-1', x: c1[0], y: c1[1], cursor: 'move' })
          handles.push({ key: 'pt-2', x: c2[0], y: c2[1], cursor: 'move' })
          guides.push({ x1: first[0], y1: first[1], x2: c1[0], y2: c1[1] })
          guides.push({ x1: last[0], y1: last[1], x2: c2[0], y2: c2[1] })
        }
      } else {
        for (let s = 1; s < abs.length - 2; s++) {
          const a = abs[s]
          const b = abs[s + 1]
          if (!a || !b) continue
          const axis = segmentAxis([a[0], a[1]], [b[0], b[1]])
          if (axis === null) continue // 비직교 세그먼트는 핸들 미제공 (스펙 9d §7)
          handles.push({
            key: `seg-${s}`,
            x: (a[0] + b[0]) / 2,
            y: (a[1] + b[1]) / 2,
            cursor: axis === 'h' ? 'ns-resize' : 'ew-resize',
          })
        }
      }
      return { guides, handles, onPointerDown: beginPointDrag }
    }
    // line/arrow — 회전 반영 끝점 (rotation ≠ 0에서도 동작, 스펙 9d §5)
    const cx = el.frame.left + el.frame.width / 2
    const cy = el.frame.top + el.frame.height / 2
    const rad = (el.rotation * Math.PI) / 180
    const hx = (el.frame.width / 2) * Math.cos(rad)
    const hy = (el.frame.width / 2) * Math.sin(rad)
    return {
      guides: [],
      handles: [
        { key: 'pt-0', x: cx - hx, y: cy - hy, cursor: 'move' },
        { key: 'pt-1', x: cx + hx, y: cy + hy, cursor: 'move' },
      ],
      onPointerDown: beginPointDrag,
    }
  })()
```

3. 제스처:

```ts
  const beginPointDrag = (e: ReactPointerEvent, key: string) => {
    e.stopPropagation()
    e.preventDefault()
    const el = strokeSel
    if (!el) return
    const docAtStart = doc
    if (!isPath(el.shape)) {
      // line/arrow 끝점: 반대 끝 고정, frame+rotation 재계산 (9c 수학 = lineFromEndpoints)
      const cx = el.frame.left + el.frame.width / 2
      const cy = el.frame.top + el.frame.height / 2
      const rad = (el.rotation * Math.PI) / 180
      const hx = (el.frame.width / 2) * Math.cos(rad)
      const hy = (el.frame.width / 2) * Math.sin(rad)
      const movingStart = key === 'pt-0'
      const fixed: [number, number] = movingStart ? [cx + hx, cy + hy] : [cx - hx, cy - hy]
      const g: LineEndGesture = { kind: 'lineend', slideId: slide.id, id: el.id, frame: el.frame, rotation: el.rotation, changed: false }
      const onMove = (ev: PointerEvent) => {
        let [mx, my] = toDocPoint(ev)
        if (ev.shiftKey) {
          const dist = Math.hypot(mx - fixed[0], my - fixed[1])
          const snapped = ((Math.round((Math.atan2(my - fixed[1], mx - fixed[0]) * 180) / Math.PI / 15) * 15) * Math.PI) / 180
          mx = fixed[0] + dist * Math.cos(snapped)
          my = fixed[1] + dist * Math.sin(snapped)
        }
        const moving: [number, number] = [mx, my]
        const { frame, rotation } = movingStart
          ? lineFromEndpoints(moving, fixed, el.frame.height)
          : lineFromEndpoints(fixed, moving, el.frame.height)
        g.frame = frame
        g.rotation = rotation
        g.changed = true
        setGesture({ ...g })
      }
      attachDrag(onMove, () => {
        if (g.changed) {
          dispatch({
            type: 'APPLY_DOC',
            doc: setElementRotation(setElementFrame(docAtStart, g.slideId, g.id, g.frame), g.slideId, g.id, g.rotation),
          })
        }
        setGesture(null)
      })
      return
    }
    const absStart = absPointsOf(el.frame, el.points)
    const startPointer = toDocPoint(e.nativeEvent)
    const g: PointsGesture = { kind: 'points', slideId: slide.id, id: el.id, frame: el.frame, points: el.points, changed: false }
    const onMove = (ev: PointerEvent) => {
      const [mx, my] = toDocPoint(ev)
      let abs = absStart
      if (key === 'pt-0' || key === `pt-${absStart.length - 1}`) {
        if (el.shape === 'elbow') {
          abs = moveElbowEndpoint(absStart, key === 'pt-0' ? 'start' : 'end', [mx, my])
        } else {
          abs = absStart.map((p, i) => (i === (key === 'pt-0' ? 0 : absStart.length - 1) ? [mx, my] as [number, number] : p))
        }
      } else if (key.startsWith('pt-')) {
        const idx = Number(key.slice(3))
        abs = absStart.map((p, i) => (i === idx ? [mx, my] as [number, number] : p))
      } else {
        const seg = Number(key.slice(4))
        abs = moveElbowSegment(absStart, seg, mx - startPointer[0], my - startPointer[1])
      }
      const norm = normalizePoints(abs)
      g.frame = norm.frame
      g.points = norm.points
      g.changed = true
      setGesture({ ...g })
    }
    attachDrag(onMove, () => {
      if (g.changed) dispatch({ type: 'APPLY_DOC', doc: setShapePoints(docAtStart, g.slideId, g.id, g.frame, g.points) })
      setGesture(null)
    })
  }
```

공용 헬퍼 2개(파일 내):

```ts
  const toDocPoint = (ev: { clientX: number; clientY: number }): [number, number] => {
    const stage = ref.current?.querySelector('.slide-stage')
    const rect = stage?.getBoundingClientRect() ?? { left: 0, top: 0 }
    return [(ev.clientX - rect.left) / scaleRef.current, (ev.clientY - rect.top) / scaleRef.current]
  }

  const attachDrag = (onMove: (ev: PointerEvent) => void, onEnd: () => void) => {
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      onEnd()
    }
    const onCancel = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      setGesture(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }
```

4. SelectionOverlay 호출부: `points={pointsInteraction}` 추가, resize 조건에 line/arrow 제외 추가:

```tsx
                resize={
                  !drawMode && singleSelected && editingTextId !== singleSelected.id &&
                  !(singleSelected.type === 'shape' && isLinear(singleSelected.shape))
                    ? { elementId: singleSelected.id, onHandlePointerDown: beginResize, onRotatePointerDown: beginRotate }
                    : undefined
                }
```

(import 추가: `isStroke`/`isPath`/`isLinear`(shapeSvg), `absPointsOf`/`moveElbowEndpoint`/`moveElbowSegment`/`normalizePoints`/`segmentAxis`/`lineFromEndpoints`(pathOps), `setShapePoints`(ops), `Point`/`ShapeElement`(types), `PointHandleSpec`/`PointsInteraction`(SelectionOverlay). 기존 line/arrow 8핸들 렌더를 단언하던 테스트가 있으면 "끝점 핸들 2개·8핸들 없음"으로 갱신 — 대체가 스펙이다.)

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run && npx tsc --noEmit`
Expected: PASS 전부

- [ ] **Step 5: 커밋**

```bash
git add -A editor/src && git commit -m "feat(editor): 경유점 전용 핸들 — elbow 세그먼트·curve 제어점·line 끝점(8핸들 대체) (Plan 9d Task 5)"
```

---

### Task 6: AI 가이드·스펙 이력·로드맵

**Files:**
- Modify: `docs/ai-guide.md` (규칙 12 갱신·예시 추가)
- Modify: `docs/superpowers/specs/2026-07-02-webdeck-design.md` (§12 이력 1줄)
- Modify: `docs/roadmap.md` (Plan 9d 완료 표시)

**Interfaces:** 없음 (문서만)

- [ ] **Step 1: ai-guide 규칙 12에 덧붙임** — 기존 문장 끝에 추가:

```
elbow(직교 폴리라인)/curve(3차 베지어)는 `data-points="x,y x,y ..."`(frame 기준 % 좌표) 필수 — elbow는 점 2개 이상(연속 점은 수평/수직 정렬 권장), curve는 정확히 4점(시작·제어1·제어2·끝). 선 서식 속성은 line/arrow와 동일하게 적용된다
```

도형 예시 블록에 추가:

```html
<div class="el el-shape" data-shape="elbow" data-points="0,0 50,0 50,100 100,100" data-head-end="1" style="left:96px; top:520px; width:320px; height:120px; color:#374151;"></div>
<div class="el el-shape" data-shape="curve" data-points="0,100 33.33,0 66.67,0 100,100" style="left:456px; top:520px; width:320px; height:120px; color:#1a56db;"></div>
```

- [ ] **Step 2: 마스터 스펙 §12 끝에 이력 1줄**

```
- 2026-07-07 Plan 9d: elbow(직교 폴리라인)·curve(3차 베지어) — data-points % 경유점(필수, 위반 시 opaque), 전용 핸들 편집(세그먼트/제어점/line·arrow 끝점 — line/arrow는 8핸들 대체), 드래그 그리기 자동 라우팅. 상세: specs/2026-07-07-webdeck-connectors-design.md
```

- [ ] **Step 3: roadmap.md** — Plan 9d 절을 완료로:

```
### Plan 9d — 꺾인 연결선·곡선 ✅ (완료)
ㄱ자 연결선(elbow)·곡선 — 경유점(data-points % 좌표) 모델, 드래그 그리기 자동 라우팅, 전용 핸들(세그먼트·제어점·끝점 — line/arrow 8핸들 대체 포함).

— 2026-07-07 완료. 독립 도형으로 구현(도형에 붙어 따라다니는 "연결" 추종은 요구 확인 시 Plan 9e).
```

- [ ] **Step 4: 전체 확인 후 커밋**

Run: 루트에서 `npm run test:all`
Expected: PASS

```bash
git add docs && git commit -m "docs: Plan 9d 문서 — ai-guide elbow/curve·스펙 이력·로드맵 (Plan 9d Task 6)"
```

---

## 최종 게이트 — fable 실브라우저 리뷰 (스펙 §8)

Task 1~6 완료 후, 머지 전 반드시 fable 모델로 실브라우저(Playwright) 최종 리뷰를 수행한다(태스크 아님 — 컨트롤러 프로세스 단계, 9c와 동일). 통과 기준 = 스펙 §8 마지막 항목의 체크리스트:

- 그리기 4방향(H-V-H/V-H-V × 좌우상하) + curve 아치, 실측 라우팅
- 세그먼트 핸들(직교 유지)·curve 제어점 핸들·line/arrow 끝점 핸들(8핸들 대체·회전 사선 재조정) 실조작
- 화살표 머리 orient가 polyline/path 끝 세그먼트 접선을 실제로 추적하는지 실측
- 서식 조합 저장 왕복(저장 중단 오류 없음) + 재오픈 서식 유지
- 저장 html을 file://로 단독 렌더 — 굵은 파선 elbow + 양쪽 머리가 에디터와 동일
- **Ready to merge: Yes** 판정 시에만 main ff-머지·GitHub 푸시
