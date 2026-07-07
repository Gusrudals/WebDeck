# WebDeck Plan 9c — 선 서식·드래그 그리기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** line/arrow 도형에 선 서식 4필드(굵기·대시·시작/끝 머리)와 속성 패널 "선" 섹션, 캔버스 드래그 그리기 모드를 추가한다.

**Architecture:** 서식은 `ShapeElement`의 1급 필드 + `.el-shape`의 선택 data 속성(`data-stroke-width`/`data-stroke-dash`/`data-head-start`/`data-head-end`) — kind 기본값과 다를 때만 직렬화 출력. 정준 SVG(`shapeSvg.ts`)가 파라미터를 받아 재생성하며 파서는 여전히 내부 마크업을 무시한다. 그리기 모드는 App 로컬 상태(`drawMode`) — 두 점을 중심점+길이+각도(frame+rotation)로 환산하므로 포맷·리듀서 무변경.

**Tech Stack:** React 19 + TypeScript strict + Vite 8, Vitest + happy-dom + RTL, node:test + node-html-parser (tools)

**스펙:** `docs/superpowers/specs/2026-07-07-webdeck-line-styling-design.md`

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess`, 상대 import는 `.ts`/`.tsx` 확장자 포함. 신규 의존성 금지. 리듀서(`state/store.ts`)·런타임·템플릿 무변경
- 선 서식 필드: `strokeWidth: number`(기본 2) / `strokeDash: 'solid' | 'dashed' | 'dotted'`(기본 solid) / `headStart: boolean` / `headEnd: boolean`. kind 기본값: line = start·end 모두 false, arrow = start false·end true. **기본값의 유일 원본은 `lineDefaults(kind)`**
- data 속성은 **kind 기본값과 다를 때만 출력** — 기본값 요소의 직렬화 출력은 기존과 동일(단, arrow의 정준 SVG marker 표기는 이번에 바뀐다 — 외형 동일·모델 왕복 무영향, 아래 Task 1)
- 파서는 무효 값을 무시하고 기본값 사용(관용), 검증기는 무효 값을 오류로(엄격) — 스펙 §7 역할 분담
- 무효 값 판정: `data-stroke-width`는 `/^[1-9][0-9]*$/`(양의 정수)만 유효, `data-stroke-dash`는 `dashed`/`dotted`만, `data-head-start`/`data-head-end`는 `0`/`1`만
- 대시 정준식(굵기 w): 파선 `stroke-dasharray="${w * 3} ${w * 2}"`, 점선 `stroke-dasharray="0 ${w * 2}"` + `stroke-linecap="round"`, 실선은 속성 없음
- marker 정준형: `markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto-start-reverse" markerUnits="strokeWidth"`, path `M0,0 L5,2.5 L0,5 Z` — 굵기 2에서 기존 userSpaceOnUse 10px 머리와 픽셀 동일(회귀 테스트로 고정). 머리가 하나도 없으면 defs 자체를 출력하지 않는다
- 1 조작 = 1 APPLY_DOC(undo 1스텝). drawMode는 App useState — 리듀서·문서 상태와 무관
- 문구 verbatim: 패널 섹션 제목 `선`, 컨트롤 라벨 `굵기`/`실선`/`파선`/`점선`/`시작 머리`/`끝 머리`, 행 라벨 `선 스타일`/`화살표 머리`
- 굵기 입력 클램프: 1~24 정수(`Math.min(24, Math.max(1, Math.round(v)))`)
- 그리기: Shift = 15° 스냅, 드래그 거리(문서 좌표) 8px 미만 = 클릭 폴백(기본 가로선 `LINEAR_INSERT_FRAME` 삽입), Esc·캔버스 밖 pointerdown = 모드 취소. 외부 클릭 리스너는 **캡처 단계**(요소 제스처 stopPropagation 면역 — 팝오버 교훈)
- 테스트: `cd editor && npx vitest run <파일>`, tools는 `cd tools && node --test`, 전체 `npm run test:all`(루트)

---

### Task 1: 모델 — 선 서식 필드·정준 SVG 파라미터화·파서/직렬화

**Files:**
- Modify: `editor/src/model/types.ts` (ShapeElement)
- Modify: `editor/src/model/shapeSvg.ts` (전면 개정)
- Modify: `editor/src/model/ops.ts:186-196` (createShape) + `LINEAR_INSERT_FRAME` 추가
- Modify: `editor/src/model/parse.ts:159-169` (el-shape 분기 + readLineStyle 헬퍼)
- Modify: `editor/src/model/serialize.ts:67-70` (shape 분기)
- Modify: `editor/src/canvas/ElementView.tsx:54` (shapeInnerHtml 시그니처 추종)
- Modify: `editor/src/model/shapes.test.ts` (기존 marker 픽스처 갱신 + 신규 테스트)
- Test: `editor/src/model/shapes.test.ts`, `editor/src/model/roundtrip.test.ts`

**Interfaces:**
- Produces (Task 2·3·4가 사용):
  - types.ts: `StrokeDash = 'solid' | 'dashed' | 'dotted'`, `ShapeElement`에 `strokeWidth: number; strokeDash: StrokeDash; headStart: boolean; headEnd: boolean` 필수 필드 추가
  - shapeSvg.ts: `interface LineStyle { strokeWidth: number; strokeDash: StrokeDash; headStart: boolean; headEnd: boolean }`, `lineDefaults(kind: 'line' | 'arrow'): LineStyle`, `lineStyleOf(el: LineStyle): LineStyle`, `shapeInnerHtml(uid: string, style: LineStyle): string` — **kind 인자 제거**(출력이 style만으로 결정되므로; kind는 lineDefaults에서만 의미), 기존 `isLinear(shape: ShapeKind): boolean` 유지
  - ops.ts: `LINEAR_INSERT_FRAME: Frame` (= `{ left: 480, top: 356, width: 320, height: 8 }` — 툴바 클릭 삽입과 그리기 클릭 폴백이 공유), `createShape`는 새 필드를 `lineDefaults`로 채움(비선형 kind는 `lineDefaults('line')` 고정값)

- [ ] **Step 1: 실패하는 테스트 작성** — `shapes.test.ts`에 추가(기존 테스트 갱신 포함):

기존 테스트 갱신: `shapeInnerHtml('line', '무관')`/`shapeInnerHtml('arrow', el.id)` 호출들은 `shapeInnerHtml('무관', lineDefaults('line'))`/`shapeInnerHtml(el.id, lineDefaults('arrow'))`로, `markerUnits="userSpaceOnUse"` 단언은 `markerUnits="strokeWidth"`로 바꾼다.

```ts
import { lineDefaults, lineStyleOf, shapeInnerHtml } from './shapeSvg.ts'

describe('선 서식 — 정준 SVG (Plan 9c)', () => {
  test('기본 line 출력은 기존 정준형과 바이트 동일 (회귀)', () => {
    expect(shapeInnerHtml('x', lineDefaults('line'))).toBe(
      '<svg width="100%" height="100%" style="overflow: visible; display: block;"><line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" stroke-width="2"></line></svg>',
    )
  })
  test('기본 arrow: marker는 strokeWidth 단위 5/2.5 규격 + auto-start-reverse, marker-end만', () => {
    const html = shapeInnerHtml('abc', lineDefaults('arrow'))
    expect(html).toContain('markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto-start-reverse" markerUnits="strokeWidth"')
    expect(html).toContain('marker-end="url(#wd-arrow-head-abc)"')
    expect(html).not.toContain('marker-start')
  })
  test('대시 정준식은 굵기에 비례한다', () => {
    const dashed = shapeInnerHtml('x', { ...lineDefaults('line'), strokeWidth: 4, strokeDash: 'dashed' })
    expect(dashed).toContain('stroke-width="4"')
    expect(dashed).toContain('stroke-dasharray="12 8"')
    const dotted = shapeInnerHtml('x', { ...lineDefaults('line'), strokeDash: 'dotted' })
    expect(dotted).toContain('stroke-dasharray="0 4"')
    expect(dotted).toContain('stroke-linecap="round"')
  })
  test('시작 머리만 켜면 marker-start만, 머리가 없으면 defs도 없다', () => {
    const start = shapeInnerHtml('x', { ...lineDefaults('line'), headStart: true })
    expect(start).toContain('marker-start=')
    expect(start).not.toContain('marker-end=')
    expect(shapeInnerHtml('x', { ...lineDefaults('arrow'), headEnd: false })).not.toContain('<defs>')
  })
})

describe('선 서식 — 파서 승격/직렬화 (Plan 9c)', () => {
  const docOf = (attrs: string, kind = 'line') =>
    parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-shape" data-shape="${kind}"${attrs} style="left:0px; top:0px; width:320px; height:8px;"></div></section>
</main></body></html>`)
  const shapeOf = (doc: DeckDoc) => doc.slides[0]!.elements[0] as ShapeElement

  test('유효 속성은 필드로 승격되고 extraAttrs에 남지 않는다', () => {
    const el = shapeOf(docOf(' data-stroke-width="4" data-stroke-dash="dashed" data-head-start="1"'))
    expect(el.strokeWidth).toBe(4)
    expect(el.strokeDash).toBe('dashed')
    expect(el.headStart).toBe(true)
    expect(el.extraAttrs).toEqual({})
  })
  test('무효 값은 kind 기본값으로 (관용 수용, 스펙 §7)', () => {
    const el = shapeOf(docOf(' data-stroke-width="0" data-stroke-dash="wavy" data-head-end="yes"', 'arrow'))
    expect(el.strokeWidth).toBe(2)
    expect(el.strokeDash).toBe('solid')
    expect(el.headEnd).toBe(true) // arrow 기본
    expect(el.extraAttrs).toEqual({})
  })
  test('arrow의 data-head-end="0"은 끝 머리를 끈다', () => {
    expect(shapeOf(docOf(' data-head-end="0"', 'arrow')).headEnd).toBe(false)
  })
  test('rect에 붙은 동명 속성은 extraAttrs 보존 (기존 규칙)', () => {
    const el = shapeOf(docOf(' data-stroke-width="4"', 'rect'))
    expect(el.extraAttrs['data-stroke-width']).toBe('4')
  })
  test('직렬화는 기본값과 다른 필드만 출력한다', () => {
    const base = docOf('')
    expect(serializeWebdeck(base)).not.toContain('data-stroke-width')
    const styled = docOf(' data-stroke-width="4" data-head-end="1"')
    const html = serializeWebdeck(styled)
    expect(html).toContain('data-stroke-width="4"')
    expect(html).toContain('data-head-end="1"')
    expect(html).not.toContain('data-stroke-dash')
    expect(html).not.toContain('data-head-start')
  })
  test('서식 조합 왕복 동등 (checkRoundTrip)', () => {
    expect(checkRoundTrip(docOf(' data-stroke-width="6" data-stroke-dash="dotted" data-head-start="1" data-head-end="1"', 'arrow'))).toBeNull()
  })
})
```

(import는 파일 상단 기존 것에 `parseWebdeck`/`serializeWebdeck`/`checkRoundTrip`/`DeckDoc`/`ShapeElement`를 보태 맞춘다 — shapes.test.ts에 이미 있는 것 재사용.)

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/shapes.test.ts`
Expected: FAIL — `lineDefaults` export 없음 / shapeInnerHtml 인자 불일치

- [ ] **Step 3: 구현**

`types.ts` — ShapeKind 아래:

```ts
export type StrokeDash = 'solid' | 'dashed' | 'dotted'

export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: ShapeKind
  /** 선 서식 — line/arrow에서만 의미(스펙 §2). 그 외 kind는 기본값 고정·직렬화 미출력 */
  strokeWidth: number
  strokeDash: StrokeDash
  headStart: boolean
  headEnd: boolean
}
```

`shapeSvg.ts` 전면 개정:

```ts
import type { ShapeKind, StrokeDash } from './types.ts'

export interface LineStyle {
  strokeWidth: number
  strokeDash: StrokeDash
  headStart: boolean
  headEnd: boolean
}

/** kind별 선 서식 기본값 — 파서 폴백·직렬화 생략 판정의 유일 원본 (스펙 §2) */
export function lineDefaults(kind: 'line' | 'arrow'): LineStyle {
  return { strokeWidth: 2, strokeDash: 'solid', headStart: false, headEnd: kind === 'arrow' }
}

/** ShapeElement(구조적 상위형)에서 선 서식 4필드만 추출 */
export function lineStyleOf(el: LineStyle): LineStyle {
  return { strokeWidth: el.strokeWidth, strokeDash: el.strokeDash, headStart: el.headStart, headEnd: el.headEnd }
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
  return `<svg width="100%" height="100%" style="overflow: visible; display: block;">${defs}<line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" stroke-width="${w}"${dash}${markers}></line></svg>`
}

export function isLinear(shape: ShapeKind): boolean {
  return shape === 'line' || shape === 'arrow'
}
```

`ops.ts` — createShape 교체 + 상수 추가 (import에 `isLinear`, `lineDefaults` 추가 — `./shapeSvg.ts`):

```ts
/** line/arrow 삽입 기본 frame — 툴바 클릭 삽입과 그리기 모드의 클릭 폴백이 공유 (스펙 §5) */
export const LINEAR_INSERT_FRAME: Frame = { left: 480, top: 356, width: 320, height: 8 }

/** 도형 삽입 팩토리 — kind별 기본 외형은 인라인 스타일에 내장 (런타임·CSS 무의존, 스펙 §2·§3) */
export function createShape(idGen: () => string, kind: ShapeKind, frame: Frame): ShapeElement {
  const extraStyle: Record<string, string> =
    kind === 'line' || kind === 'arrow'
      ? { color: '#374151' }
      : kind === 'ellipse'
        ? { background: 'var(--wd-accent)', 'border-radius': '50%' }
        : kind === 'rounded'
          ? { background: 'var(--wd-accent)', 'border-radius': '24px' }
          : { background: 'var(--wd-accent)' }
  const line = isLinear(kind) ? lineDefaults(kind as 'line' | 'arrow') : lineDefaults('line')
  return { type: 'shape', id: idGen(), frame: { ...frame }, rotation: 0, extraStyle, extraAttrs: {}, extraClasses: [], shape: kind, ...line }
}
```

`parse.ts` — import에 `lineDefaults` 추가(`./shapeSvg.ts`, 기존 isLinear import 옆), 파일 하단 헬퍼 추가 + el-shape 분기 교체:

```ts
const LINE_STYLE_ATTRS = ['data-stroke-width', 'data-stroke-dash', 'data-head-start', 'data-head-end']

/** 선 서식 속성 승격 — 유효한 값만, 무효 값은 kind 기본값(관용, 스펙 §7). extraAttrs에서 소비한다 */
function readLineStyle(el: Element, kind: 'line' | 'arrow', extraAttrs: Record<string, string>): LineStyle {
  const d = lineDefaults(kind)
  const w = el.getAttribute('data-stroke-width')
  const dash = el.getAttribute('data-stroke-dash')
  const hs = el.getAttribute('data-head-start')
  const he = el.getAttribute('data-head-end')
  for (const a of LINE_STYLE_ATTRS) delete extraAttrs[a]
  return {
    strokeWidth: w !== null && /^[1-9][0-9]*$/.test(w) ? Number(w) : d.strokeWidth,
    strokeDash: dash === 'dashed' || dash === 'dotted' ? dash : d.strokeDash,
    headStart: hs === '1' ? true : hs === '0' ? false : d.headStart,
    headEnd: he === '1' ? true : he === '0' ? false : d.headEnd,
  }
}
```

el-shape 분기(parse.ts:159-169)는 다음으로 교체:

```ts
  if (el.classList.contains('el-shape')) {
    const kind = el.getAttribute('data-shape') as (typeof SHAPE_KINDS)[number] | null
    if (kind === null || !SHAPE_KINDS.includes(kind)) return opaque()
    if (!isLinear(kind)) {
      const hasChildren = el.children.length > 0
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
      if (hasChildren || hasText) return opaque()
      return { type: 'shape', id, frame, rotation, extraStyle, extraAttrs, extraClasses, shape: kind, ...lineDefaults('line') }
    }
    // line/arrow는 내부 마크업을 무시한다 — 직렬화가 정준 SVG를 재생성 (스펙 §3)
    return { type: 'shape', id, frame, rotation, extraStyle, extraAttrs, extraClasses, shape: kind, ...readLineStyle(el, kind, extraAttrs) }
  }
```

(`LineStyle` 타입 import 필요 — `import type { LineStyle } from './shapeSvg.ts'`.)

`serialize.ts` — shape 분기(67-70) 교체 (import에 `lineDefaults`, `lineStyleOf` 추가):

```ts
    case 'shape': {
      let lineAttrs = ''
      let inner = ''
      if (isLinear(el.shape)) {
        const kind = el.shape as 'line' | 'arrow'
        const d = lineDefaults(kind)
        if (el.strokeWidth !== d.strokeWidth) lineAttrs += ` data-stroke-width="${el.strokeWidth}"`
        if (el.strokeDash !== d.strokeDash) lineAttrs += ` data-stroke-dash="${el.strokeDash}"`
        if (el.headStart !== d.headStart) lineAttrs += ` data-head-start="${el.headStart ? '1' : '0'}"`
        if (el.headEnd !== d.headEnd) lineAttrs += ` data-head-end="${el.headEnd ? '1' : '0'}"`
        inner = shapeInnerHtml(el.id, lineStyleOf(el))
      }
      return `<div class="${escapeAttr(elementClass(el))}" data-shape="${el.shape}"${lineAttrs} style="${escapeAttr(style)}"${attrs}>${inner}</div>`
    }
```

`ElementView.tsx:54` — `shapeInnerHtml(element.id, lineStyleOf(element))` (import에 `lineStyleOf` 추가, `isLinear`만 element.shape 판별에 유지).

- [ ] **Step 4: 전체 테스트·타입 통과 확인**

Run: `cd editor && npx vitest run && npx tsc --noEmit`
Expected: PASS 전부 (shapes/parse/serialize/roundtrip/preservation/ElementView 포함 — 실패하면 남은 marker 픽스처를 정준형에 맞춰 갱신)

- [ ] **Step 5: 커밋**

```bash
git add -A editor/src && git commit -m "feat(model): 선 서식 4필드(굵기·대시·머리) + 정준 SVG 파라미터화 (Plan 9c Task 1)"
```

---

### Task 2: setShapeLineStyle 연산 + 속성 패널 "선" 섹션

**Files:**
- Modify: `editor/src/model/ops.ts` (setShapeLineStyle 추가)
- Modify: `editor/src/panels/PropertiesPanel.tsx` (선 섹션 — TableSection 블록과 `{first && (` 스타일 섹션 사이에 삽입)
- Modify: `editor/src/app.css` (aria-pressed 눌림 표시)
- Test: `editor/src/model/ops.test.ts`, `editor/src/panels/PropertiesPanel.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `LineStyle`/`lineDefaults`/`isLinear`, `ShapeElement` 새 필드
- Produces: `setShapeLineStyle(doc: DeckDoc, slideId: string, elementId: string, patch: Partial<LineStyle>): DeckDoc` — line/arrow가 아니면 요소 무변경

- [ ] **Step 1: 실패하는 테스트 작성**

`ops.test.ts`:

```ts
test('setShapeLineStyle은 line/arrow의 서식만 패치한다', () => {
  const line = createShape(idGen, 'line', { left: 0, top: 0, width: 320, height: 8 })
  const rect = createShape(idGen, 'rect', { left: 0, top: 0, width: 100, height: 100 })
  const doc = addElement(addElement(baseDoc, slideId, line), slideId, rect)
  const next = setShapeLineStyle(doc, slideId, line.id, { strokeWidth: 6, headStart: true })
  const patched = next.slides[0]!.elements.find((e) => e.id === line.id) as ShapeElement
  expect(patched.strokeWidth).toBe(6)
  expect(patched.headStart).toBe(true)
  expect(patched.strokeDash).toBe('solid')
  const same = setShapeLineStyle(doc, slideId, rect.id, { strokeWidth: 6 })
  expect((same.slides[0]!.elements.find((e) => e.id === rect.id) as ShapeElement).strokeWidth).toBe(2)
})
```

(기존 ops.test.ts의 baseDoc/idGen/slideId 픽스처 관례를 재사용한다.)

`PropertiesPanel.test.tsx` — 기존 렌더 헬퍼 관례 재사용:

```ts
test('line 단일 선택이면 선 섹션이 보인다 (rect는 아님)', () => { /* '선' 섹션·'굵기'·'파선' 존재 / rect 문서에선 queryByLabelText('파선') null */ })
test('파선 클릭은 strokeDash를 패치한 APPLY_DOC 1회', () => { /* dispatch 1회, doc의 요소 strokeDash === 'dashed' */ })
test('현재 값과 같은 버튼 클릭은 dispatch하지 않는다', () => { /* 실선 클릭 → dispatch 미호출 */ })
test('굵기 커밋은 1~24 정수로 클램프', () => { /* '99' 입력+blur → strokeWidth 24 */ })
test('arrow의 끝 머리 토글: aria-pressed true → 클릭 → headEnd false', () => {})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/ops.test.ts src/panels/PropertiesPanel.test.tsx`
Expected: FAIL — setShapeLineStyle 없음 / 선 섹션 없음

- [ ] **Step 3: 구현**

`ops.ts` (import에 `LineStyle` 타입 추가):

```ts
/** 선 서식 패치 — line/arrow 외에는 무변경. 호출부가 값 비교로 no-op dispatch를 막는다(회전 관례) */
export function setShapeLineStyle(doc: DeckDoc, slideId: string, elementId: string, patch: Partial<LineStyle>): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) =>
    el.type === 'shape' && isLinear(el.shape) ? { ...el, ...patch } : el,
  )
}
```

`PropertiesPanel.tsx` — import에 `setShapeLineStyle`(ops), `LineStyle`(shapeSvg, type), `ShapeElement`(types, type) 추가. `{selectedKnown.length === 1 && selectedKnown[0]!.type === 'table' && (...)}` 블록 뒤에 삽입:

```tsx
      {allLinear && (() => {
        const shapes = selectedKnown.filter((el): el is ShapeElement => el.type === 'shape')
        const firstShape = shapes[0]!
        const applyLine = (patch: Partial<LineStyle>) => {
          const changed = shapes.some(
            (el) =>
              (patch.strokeWidth !== undefined && el.strokeWidth !== patch.strokeWidth) ||
              (patch.strokeDash !== undefined && el.strokeDash !== patch.strokeDash) ||
              (patch.headStart !== undefined && el.headStart !== patch.headStart) ||
              (patch.headEnd !== undefined && el.headEnd !== patch.headEnd),
          )
          if (!changed) return
          let d = doc
          for (const el of shapes) d = setShapeLineStyle(d, slide.id, el.id, patch)
          dispatch({ type: 'APPLY_DOC', doc: d })
        }
        return (
          <section aria-label="선">
            <h2>선</h2>
            <NumberField
              key={`${firstShape.id}-sw`}
              label="굵기"
              value={firstShape.strokeWidth}
              onCommit={(v) => applyLine({ strokeWidth: Math.min(24, Math.max(1, Math.round(v))) })}
            />
            <div className="prop-row">
              선 스타일
              <span className="btn-row">
                <button type="button" aria-label="실선" aria-pressed={firstShape.strokeDash === 'solid'} onClick={() => applyLine({ strokeDash: 'solid' })}>실선</button>
                <button type="button" aria-label="파선" aria-pressed={firstShape.strokeDash === 'dashed'} onClick={() => applyLine({ strokeDash: 'dashed' })}>파선</button>
                <button type="button" aria-label="점선" aria-pressed={firstShape.strokeDash === 'dotted'} onClick={() => applyLine({ strokeDash: 'dotted' })}>점선</button>
              </span>
            </div>
            <div className="prop-row">
              화살표 머리
              <span className="btn-row">
                <button type="button" aria-label="시작 머리" aria-pressed={firstShape.headStart} onClick={() => applyLine({ headStart: !firstShape.headStart })}>시작 머리</button>
                <button type="button" aria-label="끝 머리" aria-pressed={firstShape.headEnd} onClick={() => applyLine({ headEnd: !firstShape.headEnd })}>끝 머리</button>
              </span>
            </div>
          </section>
        )
      })()}
```

`app.css` 끝에 눌림 상태 표시(패널·기존 관례에 없으면):

```css
.props [aria-pressed="true"] { background: #dbeafe; border-color: #93c5fd; }
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/model/ops.test.ts src/panels/PropertiesPanel.test.tsx && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add -A editor/src && git commit -m "feat(editor): 속성 패널 선 섹션 — 굵기·대시·화살표 머리 (Plan 9c Task 2)"
```

---

### Task 3: 드래그 그리기 모드

**Files:**
- Modify: `editor/src/App.tsx` (drawMode 상태 + props 배선)
- Modify: `editor/src/panels/Toolbar.tsx` (선/화살표 → 모드 진입, 도형 버튼 활성 표시, LINEAR_INSERT_FRAME 사용)
- Modify: `editor/src/canvas/CanvasArea.tsx` (그리기 제스처 + 프리뷰 + 취소)
- Modify: `editor/src/app.css` (crosshair·active·프리뷰)
- Test: `editor/src/canvas/CanvasArea.test.tsx`, `editor/src/panels/Toolbar.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `createShape`(새 필드 포함)·`LINEAR_INSERT_FRAME`, `normalizeAngle`(`model/rotation.ts`, 기존)
- Produces: `CanvasAreaProps`에 `drawMode: 'line' | 'arrow' | null; setDrawMode: (m: 'line' | 'arrow' | null) => void; idGen: () => string` 추가, `Toolbar` props에 `drawMode`/`setDrawMode` 추가 — App이 `useState`로 소유(TableSel 선례)

- [ ] **Step 1: 실패하는 테스트 작성**

`CanvasArea.test.tsx` — renderCanvas 헬퍼에 새 props 기본값(`drawMode: null`, `setDrawMode: vi.fn()`, `idGen: createIdGen('d')`)을 추가하고, drawMode 지정 가능한 오버로드로 확장한다. 신규 테스트(happy-dom에서 stage rect는 0,0·scale 1이므로 clientX/Y가 곧 문서 좌표):

```ts
describe('드래그 그리기 모드 (Plan 9c)', () => {
  test('드래그로 두 점을 찍으면 중심+길이+각도의 선이 생성된다', () => {
    // drawMode='line'로 렌더 → .canvas-area pointerDown(100,100) → window pointermove(100,300) → pointerup
    // APPLY_DOC의 새 요소: shape 'line', width 200, rotation 90, frame.left 0, frame.top 196, height 8
    // setDrawMode(null) 호출됨
  })
  test('Shift 드래그는 각도를 15° 단위로 스냅한다', () => {
    // (0,100)→(200,110) shiftKey → rotation 0, width 200 (거리 유지·정수 반올림)
  })
  test('8px 미만 드래그(클릭)는 기본 가로선 폴백', () => {
    // pointerDown(100,100) → pointerup(102,101) → frame이 LINEAR_INSERT_FRAME과 동일
  })
  test('드래그 중 Esc는 생성 없이 모드를 끝낸다', () => {
    // pointerDown → pointermove → keydown Escape → pointerup: APPLY_DOC 미발생, setDrawMode(null)
  })
  test('모드 중 캔버스 밖 pointerdown은 모드를 취소한다 (캡처 — stopPropagation 면역)', () => {
    // body에 stopPropagation하는 외부 div 만들고 fireEvent.pointerDown → setDrawMode(null)
  })
  test('모드 중에는 요소 클릭이 선택을 바꾸지 않는다', () => {
    // drawMode에서 .el pointerdown → SELECT_ELEMENTS 미발생 (interaction 미전달)
  })
})
```

`Toolbar.test.tsx` — 렌더 헬퍼에 `drawMode: null`/`setDrawMode: vi.fn()` 추가:

```ts
test('도형 메뉴에서 선을 고르면 삽입 대신 그리기 모드에 진입한다', () => {
  // 도형 → 선 클릭: setDrawMode('line') 호출, APPLY_DOC 미발생
})
test('사각형은 여전히 즉시 삽입된다', () => { /* APPLY_DOC 발생, setDrawMode 미호출 */ })
test('그리기 모드면 도형 버튼에 active 클래스', () => { /* drawMode='line' 렌더 → 도형 버튼 classList에 active */ })
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/canvas/CanvasArea.test.tsx src/panels/Toolbar.test.tsx`
Expected: FAIL — props 없음/모드 미구현

- [ ] **Step 3: 구현**

`App.tsx` — tableSel 옆에 상태 추가·배선:

```ts
const [drawMode, setDrawMode] = useState<'line' | 'arrow' | null>(null)
```

`<Toolbar state={state} dispatch={dispatch} idGen={idGenRef.current} drawMode={drawMode} setDrawMode={setDrawMode} />`, `<CanvasArea ... drawMode={drawMode} setDrawMode={setDrawMode} idGen={idGenRef.current} />`. 문서가 없어지면 모드 해제: 기존 tableSel 초기화 useEffect에 `if (state.doc === null) setDrawMode(null)` 한 줄을 같이 두거나 별도 effect.

`Toolbar.tsx` — props에 `drawMode: 'line' | 'arrow' | null`, `setDrawMode: (m: 'line' | 'arrow' | null) => void` 추가. `insertShapeKind`의 line/arrow frame 리터럴을 `LINEAR_INSERT_FRAME`(ops import)으로 교체. 도형 버튼·메뉴:

```tsx
<button type="button" disabled={!hasDoc} className={drawMode ? 'active' : undefined} onClick={() => setShapeOpen((o) => !o)}>도형</button>
...
<button key={s.kind} type="button" role="menuitem" onClick={() => {
  setShapeOpen(false)
  if (s.kind === 'line' || s.kind === 'arrow') setDrawMode(s.kind)
  else insertShapeKind(s.kind)
}}>
```

`CanvasArea.tsx` — 상단에 `const DRAW_MIN_DIST = 8`. import 추가: `addElement`, `createShape`, `LINEAR_INSERT_FRAME`(ops), `normalizeAngle`(rotation). props·상태:

```ts
const [drawDraft, setDrawDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
```

모드 취소 effect (기존 effect들 옆):

```ts
useEffect(() => {
  if (!drawMode) return
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setDrawMode(null)
  }
  const onOutside = (e: PointerEvent) => {
    // 툴바·패널 등 캔버스 밖 조작 = 모드 취소 (스펙 §5). 캡처 — 요소 제스처 stopPropagation 면역
    if (!(e.target as HTMLElement | null)?.closest?.('.canvas-area')) setDrawMode(null)
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('pointerdown', onOutside, true)
  return () => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('pointerdown', onOutside, true)
  }
}, [drawMode, setDrawMode])
```

그리기 제스처 (beginMove 등의 옆):

```ts
const beginDraw = (e: ReactPointerEvent) => {
  const kind = drawMode
  if (!kind) return
  e.preventDefault()
  const stage = ref.current?.querySelector('.slide-stage')
  if (!stage) return
  const rect = stage.getBoundingClientRect()
  const toDoc = (cx: number, cy: number) =>
    [(cx - rect.left) / scaleRef.current, (cy - rect.top) / scaleRef.current] as const
  const [x1, y1] = toDoc(e.clientX, e.clientY)
  const current = { x1, y1, x2: x1, y2: y1 }
  setDrawDraft({ ...current })
  const onMove = (ev: PointerEvent) => {
    let [x2, y2] = toDoc(ev.clientX, ev.clientY)
    if (ev.shiftKey) {
      // Shift = 15° 각도 스냅 — 끝점을 스냅 각도 방향으로 같은 거리에 재투영
      const dist = Math.hypot(x2 - x1, y2 - y1)
      const snapped = ((Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI / 15) * 15) * Math.PI) / 180
      x2 = x1 + dist * Math.cos(snapped)
      y2 = y1 + dist * Math.sin(snapped)
    }
    current.x2 = x2
    current.y2 = y2
    setDrawDraft({ ...current })
  }
  const cleanup = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKey)
    setDrawDraft(null)
  }
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      cleanup()
      setDrawMode(null)
    }
  }
  const onUp = () => {
    cleanup()
    setDrawMode(null)
    const dx = current.x2 - x1
    const dy = current.y2 - y1
    const dist = Math.hypot(dx, dy)
    if (dist < DRAW_MIN_DIST) {
      // 클릭 폴백 — 툴바 클릭 삽입과 동일한 기본 가로선 (스펙 §5)
      const el = createShape(idGen, kind, LINEAR_INSERT_FRAME)
      dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
      return
    }
    const rotation = normalizeAngle(Math.round((Math.atan2(dy, dx) * 180) / Math.PI))
    const height = LINEAR_INSERT_FRAME.height
    const frame = {
      left: Math.round((x1 + current.x2) / 2 - dist / 2),
      top: Math.round((y1 + current.y2) / 2 - height / 2),
      width: Math.round(dist),
      height,
    }
    const el = { ...createShape(idGen, kind, frame), rotation }
    dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
  }
  const onCancel = () => {
    cleanup()
    setDrawMode(null)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey)
}
```

렌더 변경 3곳:

```tsx
<main
  className={drawMode ? 'canvas-area drawing' : 'canvas-area'}
  onPointerDown={(e) => {
    if (drawMode) {
      beginDraw(e)
      return
    }
    if (!editingTextId) dispatch({ type: 'CLEAR_SELECTION' })
  }}
>
```

SlideView는 `interaction={drawMode ? undefined : { selectedIds, editingTextId, ... }}` — 모드 중 요소 핸들러(stopPropagation 포함)를 제거해 pointerdown이 캔버스로 버블되게 한다. SelectionOverlay 다음에 프리뷰:

```tsx
{drawDraft && (
  <svg className="draw-preview" width={doc.slideWidth} height={doc.slideHeight}>
    <line x1={drawDraft.x1} y1={drawDraft.y1} x2={drawDraft.x2} y2={drawDraft.y2} stroke="#374151" strokeWidth={2} strokeDasharray="4 3" />
  </svg>
)}
```

`app.css` 끝에:

```css
.toolbar button.active { background: #dbeafe; border-color: #93c5fd; }
.canvas-area.drawing, .canvas-area.drawing .slide-view .el { cursor: crosshair; }
.draw-preview { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run && npx tsc --noEmit`
Expected: PASS 전부 (기존 CanvasArea/Toolbar 테스트는 헬퍼 기본값으로 무변경 통과)

- [ ] **Step 5: 커밋**

```bash
git add -A editor/src && git commit -m "feat(editor): 선/화살표 드래그 그리기 모드 — 15° 스냅·클릭 폴백·Esc 취소 (Plan 9c Task 3)"
```

---

### Task 4: 검증기·AI 가이드·스펙 이력

**Files:**
- Modify: `tools/lib/validate.mjs` (el-shape 블록의 line/arrow 분기)
- Modify: `tools/lib/validate.test.mjs`
- Modify: `docs/ai-guide.md` (규칙 12 + 도형 예시)
- Modify: `docs/superpowers/specs/2026-07-02-webdeck-design.md` (§12 이력 1줄)

**Interfaces:**
- Consumes: Global Constraints의 무효 값 판정 규칙 (에디터 파서와 동일 기준, 단 검증기는 오류로)

- [ ] **Step 1: 실패하는 테스트 작성** — `validate.test.mjs`에 추가 (기존 makeDoc 픽스처 관례로 el-shape 요소 주입):

```js
test('line의 무효 선 서식 속성은 오류', () => {
  // data-stroke-width="0" → 오류 'data-stroke-width는 양의 정수여야 합니다' 포함
  // data-stroke-dash="wavy" → 오류 'data-stroke-dash는 dashed/dotted만 지원합니다' 포함
  // data-head-end="yes" → 오류 'data-head-end는 0 또는 1이어야 합니다' 포함
})
test('유효한 선 서식 속성 조합은 통과', () => {
  // data-stroke-width="4" data-stroke-dash="dotted" data-head-start="1" data-head-end="0" → errors 0
})
test('속성이 없으면 통과 (전부 선택 속성)', () => {})
```

- [ ] **Step 2: 실패 확인**

Run: `cd tools && node --test`
Expected: FAIL — 새 오류 미생성

- [ ] **Step 3: 구현** — validate.mjs의 `else if (kind === 'line' || kind === 'arrow')` 블록에 기존 svg 자식 검사 뒤 추가:

```js
        const w = el.getAttribute('data-stroke-width')
        if (w !== null && !/^[1-9][0-9]*$/.test(w)) {
          errors.push(`${label}: data-stroke-width는 양의 정수여야 합니다`)
        }
        const dash = el.getAttribute('data-stroke-dash')
        if (dash !== null && dash !== 'dashed' && dash !== 'dotted') {
          errors.push(`${label}: data-stroke-dash는 dashed/dotted만 지원합니다`)
        }
        for (const name of ['data-head-start', 'data-head-end']) {
          const v = el.getAttribute(name)
          if (v !== null && v !== '0' && v !== '1') {
            errors.push(`${label}: ${name}는 0 또는 1이어야 합니다`)
          }
        }
```

`docs/ai-guide.md` — 규칙 12를 다음으로 교체:

```
12. `el-shape`의 `data-shape`는 `rect`/`ellipse`/`rounded`/`line`/`arrow` 5종 (v1.1) — line/arrow의 자식은 `<svg>` 1개만 허용 (오류). line/arrow는 선택 속성으로 선 서식 지원: `data-stroke-width`(양의 정수 px, 기본 2), `data-stroke-dash`(`dashed`/`dotted`, 생략 = 실선), `data-head-start`/`data-head-end`(`0`/`1` — 기본: line은 머리 없음, arrow는 끝 머리). 내부 SVG는 에디터가 정준형으로 재생성하므로 이 속성들이 서식의 단일 원본이다
```

도형 예시 블록(87행 arrow 예시 뒤)에 추가:

```html
<div class="el el-shape" data-shape="arrow" data-stroke-width="4" data-stroke-dash="dashed" style="left:96px; top:440px; width:320px; height:8px; color:#dc2626;"></div>
<div class="el el-shape" data-shape="line" data-head-start="1" data-head-end="1" style="left:96px; top:480px; width:320px; height:8px; color:#374151;"></div>
```

마스터 스펙 `2026-07-02-webdeck-design.md` §12 끝에:

```
- 2026-07-07 Plan 9c: line/arrow 선 서식(굵기·파선/점선·시작/끝 머리 — 선택 data 속성, 기본값 생략)·속성 패널 선 섹션·드래그 그리기 모드. 상세: specs/2026-07-07-webdeck-line-styling-design.md
```

- [ ] **Step 4: 통과 확인**

Run: `cd tools && node --test` 후 루트에서 `npm run test:all`
Expected: PASS 전부

- [ ] **Step 5: 커밋**

```bash
git add -A tools docs && git commit -m "feat(tools): 선 서식 속성 검증 + ai-guide·스펙 이력 (Plan 9c Task 4)"
```
