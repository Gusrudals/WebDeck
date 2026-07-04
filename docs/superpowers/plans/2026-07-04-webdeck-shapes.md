# WebDeck Plan 9 — 도형 확장·회전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도형 5종(rect/ellipse/rounded/line/arrow)과 요소 회전(도형·텍스트·이미지 공통)을 포맷 v1.1 요소 확장 규율(검증기→파서/직렬화→렌더→에디터 UI)로 추가한다.

**Architecture:** 외형은 요소 인라인 스타일에 내장(타원=border-radius:50%, 회전=transform:rotate — 런타임·템플릿 무변경). 선·화살표는 퍼센트 좌표 정준 SVG(파서는 내부 무시, 직렬화가 항상 재생성). 회전은 1급 `rotation` 필드로 승격(정확한 `rotate(<n>deg)`만, 그 외 transform은 extraStyle 보존)하고, 회전된 요소는 드래그 리사이즈·스냅에서 제외해 기존 축 정렬 기하를 보존한다.

**Tech Stack:** React 19 + TypeScript strict + Vite 8, Vitest + happy-dom + RTL (에디터), node:test + node-html-parser (tools)

**스펙:** `docs/superpowers/specs/2026-07-04-webdeck-shapes-design.md`

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess`, 상대 import `.ts`/`.tsx` 확장자 필수. 신규 의존성 금지. `EditorState`/리듀서·템플릿·런타임 무변경
- `ShapeElement.shape: 'rect' | 'ellipse' | 'rounded' | 'line' | 'arrow'` 정확히 이 5종 — 그 외 data-shape 값은 파서 opaque 보존, 검증기 오류
- `rotation: number`는 [0,360) 정규화. 직렬화는 rotation ≠ 0일 때만 `transform:rotate(<n>deg);` 출력(frame 다음, extraStyle 앞). 파서는 값이 **정확히** `rotate(<수>deg)`일 때만 승격, 그 외 transform은 extraStyle 원문 보존
- line/arrow 정준 SVG(아래 Task 2의 상수가 유일 원본): viewBox 없음, `width="100%" height="100%"`, 퍼센트 좌표, `stroke="currentColor"`, `stroke-width="2"`, 화살표는 marker id `wd-arrow-head` + `markerUnits="userSpaceOnUse"`. 파서는 line/arrow 내부 마크업을 무시(자식 있어도 opaque 강등 없음), 직렬화가 항상 재생성
- `setElementRotation`은 extraStyle의 `transform` 키를 항상 제거 (중복 충돌 방지 — Plan 6 transition 잔재 제거와 동일 패턴)
- 회전 ≠ 0 요소: 리사이즈 핸들 미표시, 스냅 대상·이동 스냅 제외. 이동·정렬·분배·z순서·복제는 정상
- 1 조작 = 1 APPLY_DOC: 회전 드래그는 pointerup 1회, 패널 회전 입력은 드래프트 커밋, 같은 값 no-dispatch
- 삽입 기본: 도형 240×160(배경 `var(--wd-accent)`), 둥근 사각형 `border-radius:24px`, 타원 `border-radius:50%`, 선·화살표 320×8(`color:#374151`). 팝오버 라벨 verbatim: `사각형`/`둥근 사각형`/`타원`/`선`/`화살표`
- 테스트: `cd editor && npx vitest run <파일>`, 전체 `npm run test:all`(루트)

---

### Task 1: 회전 모델 — rotation 1급 필드

**Files:**
- Create: `editor/src/model/rotation.ts`
- Modify: `editor/src/model/types.ts` (ElementBase에 rotation), `editor/src/model/parse.ts` (승격), `editor/src/model/serialize.ts` (출력), `editor/src/model/ops.ts` (팩토리 rotation:0 + setElementRotation)
- Test: `editor/src/model/rotation.test.ts`, `editor/src/model/parse.test.ts`·`ops.test.ts` (추가)

**Interfaces:**
- Produces (Task 5·6·7이 사용):
  - `normalizeAngle(deg: number): number` — [0,360) (rotation.ts)
  - `KnownElement.rotation: number` (ElementBase 필드, 기본 0)
  - `setElementRotation(doc: DeckDoc, slideId: string, elementId: string, rotation: number): DeckDoc` — 정규화 + extraStyle transform 제거

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/rotation.test.ts`:

```ts
import { expect, test } from 'vitest'
import { normalizeAngle } from './rotation.ts'

test('normalizeAngle은 [0,360)으로 정규화한다', () => {
  expect(normalizeAngle(0)).toBe(0)
  expect(normalizeAngle(360)).toBe(0)
  expect(normalizeAngle(365)).toBe(5)
  expect(normalizeAngle(-15)).toBe(345)
  expect(normalizeAngle(-720)).toBe(0)
  expect(normalizeAngle(15.5)).toBe(15.5)
})
```

`editor/src/model/parse.test.ts` 끝에 추가 (기존 P6_WRAP류 래퍼가 있으면 재사용, 없으면 동일 형태로 지역 정의):

```ts
describe('요소 회전 (v1.1)', () => {
  const EL = (style: string) => P6_WRAP(`<section class="slide"><div class="el el-text" style="${style}"><p>x</p></div></section>`)

  test('정확한 rotate(n deg) transform은 1급 rotation으로 승격되고 extraStyle에서 제외된다', () => {
    const doc = parseWebdeck(EL('left:0px; top:0px; width:100px; height:50px; transform:rotate(15deg);'))
    const el = doc.slides[0]!.elements[0]!
    expect(el.type).toBe('text')
    if (el.type !== 'text') return
    expect(el.rotation).toBe(15)
    expect(el.extraStyle['transform']).toBeUndefined()
  })

  test('음수·소수 회전은 [0,360)으로 정규화된다', () => {
    const doc = parseWebdeck(EL('left:0px; top:0px; width:100px; height:50px; transform: rotate(-15.5deg);'))
    const el = doc.slides[0]!.elements[0]!
    if (el.type !== 'text') return
    expect(el.rotation).toBe(344.5)
  })

  test('비표준 transform(matrix·다중 함수)은 extraStyle에 원문 보존되고 rotation은 0', () => {
    const doc = parseWebdeck(EL('left:0px; top:0px; width:100px; height:50px; transform: rotate(10deg) scale(2);'))
    const el = doc.slides[0]!.elements[0]!
    if (el.type !== 'text') return
    expect(el.rotation).toBe(0)
    expect(el.extraStyle['transform']).toBe('rotate(10deg) scale(2)')
    expect(checkRoundTrip(doc)).toBeNull()
  })

  test('회전은 왕복 보존되고 0이면 transform을 출력하지 않는다', () => {
    const doc = parseWebdeck(EL('left:0px; top:0px; width:100px; height:50px; transform:rotate(30deg);'))
    expect(checkRoundTrip(doc)).toBeNull()
    expect(serializeWebdeck(doc)).toContain('transform:rotate(30deg);')
    const plain = parseWebdeck(EL('left:0px; top:0px; width:100px; height:50px;'))
    expect(serializeWebdeck(plain)).not.toContain('transform')
  })
})
```

`editor/src/model/ops.test.ts` 끝에 추가:

```ts
describe('setElementRotation', () => {
  test('정규화해 설정하고 extraStyle의 transform 잔재를 제거한다', () => {
    const doc = parseWebdeck(P6_WRAP('<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px; transform: rotate(5deg) scale(2);"><p>x</p></div></section>'))
    const id = doc.slides[0]!.elements[0]!.id
    const out = setElementRotation(doc, doc.slides[0]!.id, id, 370)
    const el = out.slides[0]!.elements[0]!
    if (el.type !== 'text') return
    expect(el.rotation).toBe(10)
    expect(el.extraStyle['transform']).toBeUndefined()
    expect(checkRoundTrip(out)).toBeNull()
    expect(serializeWebdeck(out).match(/transform/g)).toHaveLength(1)
  })
})
```

(래퍼 상수 이름이 파일마다 다르면 기존 것을 쓰고 참조만 맞출 것. import에 `setElementRotation`·`checkRoundTrip`·`serializeWebdeck`이 없으면 추가)

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/rotation.test.ts src/model/parse.test.ts src/model/ops.test.ts`
Expected: FAIL — rotation.ts 없음, rotation 필드 없음

- [ ] **Step 3: 구현**

`editor/src/model/rotation.ts`:

```ts
/** 각도를 [0,360) 범위로 정규화한다 */
export function normalizeAngle(deg: number): number {
  const n = deg % 360
  return n < 0 ? n + 360 : n
}

/** 정확한 rotate(<수>deg) 형태만 매칭 — 그 외 transform은 1급 승격하지 않는다 */
export const ROTATE_PATTERN = /^rotate\((-?\d+(?:\.\d+)?)deg\)$/
```

`editor/src/model/types.ts` — ElementBase에 추가 (frame 다음):

```ts
  /** 회전 각도(도, [0,360)). 0이면 직렬화 시 transform 미출력 */
  rotation: number
```

`editor/src/model/parse.ts` — import에 `ROTATE_PATTERN, normalizeAngle` 추가, `parseElement`에서 frame 파싱 성공 후:

```ts
  const rawTransform = style['transform']
  const rotateMatch = rawTransform !== undefined ? ROTATE_PATTERN.exec(rawTransform.trim()) : null
  const rotation = rotateMatch ? normalizeAngle(parseFloat(rotateMatch[1]!)) : 0
```

extraStyle 수집 루프에서 승격된 transform 제외:

```ts
  for (const [prop, value] of Object.entries(style)) {
    if ((FRAME_PROPS as readonly string[]).includes(prop)) continue
    if (prop === 'transform' && rotateMatch) continue
    extraStyle[prop] = value
  }
```

세 known 분기(text/image/shape) 리턴 객체에 `rotation,` 추가.

`editor/src/model/serialize.ts` — `elementStyle` 교체:

```ts
function elementStyle(el: KnownElement): string {
  const { left, top, width, height } = el.frame
  const frame = `left:${left}px; top:${top}px; width:${width}px; height:${height}px;`
  const rotate = el.rotation !== 0 ? ` transform:rotate(${el.rotation}deg);` : ''
  const extra = serializeInlineStyle(el.extraStyle)
  return `${frame}${rotate}${extra ? ` ${extra}` : ''}`
}
```

`editor/src/model/ops.ts` — 팩토리 3종(createTextElement/createShapeElement/createImageElement)의 리턴 객체에 `rotation: 0,` 추가하고, setElementStyle 아래에 추가 (import에 `normalizeAngle` 추가):

```ts
export function setElementRotation(doc: DeckDoc, slideId: string, elementId: string, rotation: number): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) => {
    // 비표준 transform 잔재를 제거 — 1급 rotation과의 중복 출력 방지
    const extraStyle = { ...el.extraStyle }
    delete extraStyle['transform']
    return { ...el, rotation: normalizeAngle(rotation), extraStyle }
  })
}
```

(ops.ts에 mapKnownElement가 없다면 setElementStyle이 쓰는 헬퍼 이름을 확인해 동일하게 사용)

- [ ] **Step 4: 통과 확인 + 전체**

Run: `cd editor && npx vitest run src/model/ && npm test && npm run typecheck`
Expected: 전부 PASS. typecheck에서 KnownElement 리터럴을 만드는 다른 코드/테스트가 깨지면 `rotation: 0,`만 추가 (로직 변경 금지)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/
git commit -m "feat(model): 요소 회전 1급 필드 — rotate(n deg) 승격·왕복·setElementRotation"
```

---

### Task 2: 도형 모델 — shape 5종·정준 SVG

**Files:**
- Create: `editor/src/model/shapeSvg.ts`
- Modify: `editor/src/model/types.ts` (ShapeKind), `editor/src/model/parse.ts` (5종·line/arrow 내부 무시), `editor/src/model/serialize.ts` (data-shape·SVG 재생성), `editor/src/model/ops.ts` (createShape 팩토리)
- Test: `editor/src/model/shapes.test.ts` (신규)

**Interfaces:**
- Consumes: Task 1의 rotation 필드(리터럴에 포함)
- Produces (Task 4·5가 사용):
  - `type ShapeKind = 'rect' | 'ellipse' | 'rounded' | 'line' | 'arrow'` (types.ts), `ShapeElement.shape: ShapeKind`
  - `SHAPE_INNER_HTML: Record<'line' | 'arrow', string>` — 정준 SVG (shapeSvg.ts, 직렬화·에디터 렌더의 유일 원본)
  - `isLinear(shape: ShapeKind): boolean` — line/arrow 판별 (shapeSvg.ts)
  - `createShape(idGen: () => string, kind: ShapeKind, frame: Frame): ShapeElement` — kind별 기본 스타일 (ops.ts)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/shapes.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'
import { addElement, createShape } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'
import { serializeWebdeck } from './serialize.ts'
import { SHAPE_INNER_HTML, isLinear } from './shapeSvg.ts'

const WRAP = (inner: string) => `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">${inner}</section>
</main></body></html>`

const SHAPE = (kind: string, inner = '') =>
  WRAP(`<div class="el el-shape" data-shape="${kind}" style="left:10px; top:10px; width:200px; height:100px;">${inner}</div>`)

describe('도형 5종 파싱·왕복', () => {
  test.each(['rect', 'ellipse', 'rounded'] as const)('%s 는 ShapeElement로 파싱되고 왕복한다', (kind) => {
    const doc = parseWebdeck(SHAPE(kind))
    const el = doc.slides[0]!.elements[0]!
    expect(el.type).toBe('shape')
    if (el.type !== 'shape') return
    expect(el.shape).toBe(kind)
    expect(checkRoundTrip(doc)).toBeNull()
    expect(serializeWebdeck(doc)).toContain(`data-shape="${kind}"`)
  })

  test('미지원 data-shape 값은 opaque로 보존된다 (회귀)', () => {
    const doc = parseWebdeck(SHAPE('star'))
    expect(doc.slides[0]!.elements[0]!.type).toBe('opaque')
    expect(checkRoundTrip(doc)).toBeNull()
  })

  test('rect류에 자식이 있으면 opaque (기존 규칙 유지)', () => {
    const doc = parseWebdeck(SHAPE('ellipse', '<p>x</p>'))
    expect(doc.slides[0]!.elements[0]!.type).toBe('opaque')
  })
})

describe('line·arrow 정준 SVG', () => {
  test('내부 마크업이 무엇이든 파싱되고 직렬화가 정준 SVG로 재생성한다', () => {
    const doc = parseWebdeck(SHAPE('arrow', '<svg><circle r="1"></circle></svg><b>쓰레기</b>'))
    const el = doc.slides[0]!.elements[0]!
    expect(el.type).toBe('shape')
    if (el.type !== 'shape') return
    expect(el.shape).toBe('arrow')
    const html = serializeWebdeck(doc)
    expect(html).toContain(SHAPE_INNER_HTML.arrow)
    expect(html).not.toContain('쓰레기')
  })

  test('직렬화는 정준적이다 — 재파싱 후 재직렬화가 동일하다', () => {
    const doc = parseWebdeck(SHAPE('line'))
    const once = serializeWebdeck(doc)
    const twice = serializeWebdeck(parseWebdeck(once))
    expect(twice).toBe(once)
    expect(once).toContain(SHAPE_INNER_HTML.line)
  })

  test('정준 SVG 규약: 퍼센트 좌표·currentColor·stroke-width 2·화살표 marker', () => {
    expect(SHAPE_INNER_HTML.line).toContain('y1="50%"')
    expect(SHAPE_INNER_HTML.line).toContain('x2="100%"')
    expect(SHAPE_INNER_HTML.line).toContain('stroke="currentColor"')
    expect(SHAPE_INNER_HTML.line).toContain('stroke-width="2"')
    expect(SHAPE_INNER_HTML.line).not.toContain('viewBox')
    expect(SHAPE_INNER_HTML.arrow).toContain('wd-arrow-head')
    expect(SHAPE_INNER_HTML.arrow).toContain('markerUnits="userSpaceOnUse"')
    expect(isLinear('line')).toBe(true)
    expect(isLinear('arrow')).toBe(true)
    expect(isLinear('rect')).toBe(false)
  })
})

describe('createShape 팩토리', () => {
  const BASE = parseWebdeck(WRAP(''))

  test('kind별 기본 스타일 — ellipse/rounded는 border-radius, line/arrow는 color', () => {
    const g = createIdGen('s')
    expect(createShape(g, 'ellipse', { left: 0, top: 0, width: 240, height: 160 }).extraStyle['border-radius']).toBe('50%')
    expect(createShape(g, 'rounded', { left: 0, top: 0, width: 240, height: 160 }).extraStyle['border-radius']).toBe('24px')
    expect(createShape(g, 'rect', { left: 0, top: 0, width: 240, height: 160 }).extraStyle['background']).toBe('var(--wd-accent)')
    const line = createShape(g, 'line', { left: 0, top: 0, width: 320, height: 8 })
    expect(line.extraStyle['color']).toBe('#374151')
    expect(line.extraStyle['background']).toBeUndefined()
  })

  test('삽입 후 왕복을 통과한다 (5종)', () => {
    const g = createIdGen('i')
    let doc = BASE
    for (const kind of ['rect', 'ellipse', 'rounded', 'line', 'arrow'] as const) {
      doc = addElement(doc, doc.slides[0]!.id, createShape(g, kind, { left: 20, top: 20, width: 240, height: 160 }))
    }
    expect(doc.slides[0]!.elements).toHaveLength(5)
    expect(checkRoundTrip(doc)).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/shapes.test.ts`
Expected: FAIL — shapeSvg.ts 없음

- [ ] **Step 3: 구현**

`editor/src/model/types.ts`:

```ts
export type ShapeKind = 'rect' | 'ellipse' | 'rounded' | 'line' | 'arrow'
```

`ShapeElement.shape: 'rect'` → `shape: ShapeKind`.

`editor/src/model/shapeSvg.ts`:

```ts
import type { ShapeKind } from './types.ts'

/**
 * line/arrow의 정준 내부 SVG — 직렬화·에디터 렌더의 유일 원본.
 * viewBox 없이 퍼센트 좌표라 상자 비율 왜곡이 없고, 화살표 머리는 userSpaceOnUse marker로 고정 픽셀 크기.
 * marker id는 상수 — 문서 내 중복돼도 모든 정의가 동일해 렌더 무해.
 */
export const SHAPE_INNER_HTML = {
  line: '<svg width="100%" height="100%" style="overflow: visible; display: block;"><line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" stroke-width="2"></line></svg>',
  arrow: '<svg width="100%" height="100%" style="overflow: visible; display: block;"><defs><marker id="wd-arrow-head" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 Z" fill="currentColor"></path></marker></defs><line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" stroke-width="2" marker-end="url(#wd-arrow-head)"></line></svg>',
} as const

export function isLinear(shape: ShapeKind): boolean {
  return shape === 'line' || shape === 'arrow'
}
```

`editor/src/model/parse.ts` — import에 `isLinear` 추가, el-shape 분기 교체:

```ts
  const SHAPE_KINDS = ['rect', 'ellipse', 'rounded', 'line', 'arrow'] as const
```

(파일 상단 상수로) 그리고:

```ts
  if (el.classList.contains('el-shape')) {
    const kind = el.getAttribute('data-shape') as (typeof SHAPE_KINDS)[number] | null
    if (kind === null || !SHAPE_KINDS.includes(kind)) return opaque()
    if (!isLinear(kind)) {
      const hasChildren = el.children.length > 0
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
      if (hasChildren || hasText) return opaque()
    }
    // line/arrow는 내부 마크업을 무시한다 — 직렬화가 정준 SVG를 재생성 (스펙 §3)
    return { type: 'shape', id, frame, rotation, extraStyle, extraAttrs, extraClasses, shape: kind }
  }
```

`editor/src/model/serialize.ts` — import에 `SHAPE_INNER_HTML, isLinear` 추가, shape case 교체:

```ts
    case 'shape': {
      const inner = isLinear(el.shape) ? SHAPE_INNER_HTML[el.shape as 'line' | 'arrow'] : ''
      return `<div class="${escapeAttr(elementClass(el))}" data-shape="${el.shape}" style="${escapeAttr(style)}"${attrs}>${inner}</div>`
    }
```

`editor/src/model/ops.ts` — import에 `ShapeKind` 추가, 팩토리 섹션에 추가:

```ts
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
  return { type: 'shape', id: idGen(), frame, rotation: 0, extraStyle, extraAttrs: {}, extraClasses: [], shape: kind }
}
```

(기존 `createShapeElement`는 유지 — 레이아웃·툴바 rect 경로 하위 호환. 내부에서 `createShape(idGen, 'rect', frame)`에 background만 덮어쓰는 식으로 위임해도 좋다)

- [ ] **Step 4: 통과 확인 + 전체**

Run: `cd editor && npx vitest run src/model/ && npm test && npm run typecheck`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/
git commit -m "feat(model): 도형 5종 확장 — data-shape 값·정준 SVG(line/arrow)·createShape"
```

---

### Task 3: 검증기 확장 + AI 가이드

**Files:**
- Modify: `tools/lib/validate.mjs`, `docs/ai-guide.md`
- Test: `tools/lib/validate.test.mjs` (추가)

**Interfaces:** 없음 (독립)

- [ ] **Step 1: 실패하는 테스트 작성**

`tools/lib/validate.test.mjs`에 추가 (기존 관례: node:test + assert, 문서 래퍼 헬퍼 재사용):

```js
test('data-shape는 5종을 허용하고 그 외는 오류다', () => {
  const wrap = (el) => `<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">${el}</section></main></body></html>`
  for (const kind of ['rect', 'ellipse', 'rounded', 'line', 'arrow']) {
    const r = validateWebdeck(wrap(`<div class="el el-shape" data-shape="${kind}" style="left:0px; top:0px; width:100px; height:50px;"></div>`))
    assert.deepStrictEqual(r.errors, [], kind)
  }
  const bad = validateWebdeck(wrap('<div class="el el-shape" data-shape="star" style="left:0px; top:0px; width:100px; height:50px;"></div>'))
  assert.ok(bad.errors.some((e) => e.includes('data-shape')))
})

test('line/arrow는 svg 자식 1개만 허용한다', () => {
  const wrap = (el) => `<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">${el}</section></main></body></html>`
  const ok = validateWebdeck(wrap('<div class="el el-shape" data-shape="line" style="left:0px; top:0px; width:100px; height:8px;"><svg></svg></div>'))
  assert.deepStrictEqual(ok.errors, [])
  const bad = validateWebdeck(wrap('<div class="el el-shape" data-shape="arrow" style="left:0px; top:0px; width:100px; height:8px;"><svg></svg><p>x</p></div>'))
  assert.ok(bad.errors.some((e) => e.includes('svg')))
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` (루트). Expected: 신규 2개 FAIL

- [ ] **Step 3: 검증기 구현**

`tools/lib/validate.mjs`의 기존 el-shape 검사(`data-shape="rect"만 지원`) 교체:

```js
    if (type === 'el-shape') {
      const SHAPE_KINDS = ['rect', 'ellipse', 'rounded', 'line', 'arrow']
      const kind = el.getAttribute('data-shape')
      if (!SHAPE_KINDS.includes(kind)) {
        errors.push(`${label}: el-shape의 data-shape는 ${SHAPE_KINDS.join('/')}만 지원합니다 (v1.1)`)
      } else if (kind === 'line' || kind === 'arrow') {
        const kids = el.childNodes.filter((n) => n.nodeType === 1)
        if (kids.length > 1 || (kids.length === 1 && kids[0].rawTagName.toLowerCase() !== 'svg')) {
          errors.push(`${label}: line/arrow 도형의 자식은 svg 1개만 허용됩니다`)
        }
      }
    }
```

- [ ] **Step 4: AI 가이드 갱신**

`docs/ai-guide.md`:

(1) 필수 규칙 12번 교체: `12. el-shape는 data-shape="rect"만 지원 (v1) (오류)` →

```markdown
12. `el-shape`의 `data-shape`는 `rect`/`ellipse`/`rounded`/`line`/`arrow` 5종 (v1.1) — line/arrow의 자식은 `<svg>` 1개만 허용 (오류)
```

(2) "요소 레시피"의 도형 항목 뒤에 추가:

```markdown
**도형 변형·회전 (v1.1)** — 타원·둥근 사각형은 인라인 `border-radius`를 함께 지정하고, 회전은 `transform: rotate(<n>deg)`(정확히 이 형태)로 지정한다. 선·화살표의 내부 SVG는 에디터가 정준형으로 재생성하므로 비워 두거나 임의로 넣어도 된다:

```html
<div class="el el-shape" data-shape="ellipse" style="left:96px; top:200px; width:240px; height:160px; background:var(--wd-accent); border-radius:50%;"></div>
<div class="el el-shape" data-shape="rounded" style="left:96px; top:200px; width:240px; height:160px; background:var(--wd-accent); border-radius:24px;"></div>
<div class="el el-shape" data-shape="arrow" style="left:96px; top:400px; width:320px; height:8px; color:#374151; transform:rotate(45deg);"></div>
```
```

(3) "문서 골격" 섹션의 배경 문장(`슬라이드 배경은 data-bg="#ffffff" 속성으로 지정한다.`) 뒤에 추가 (Plan 7 백로그 해소):

```markdown
배경은 단색 외에 규약 형태의 그라데이션·이미지도 지원한다 — `data-bg="linear-gradient(180deg, #1a56db, #e8f0fe)"`(각도는 0/90/180/270deg, 색은 #rrggbb 2개) 또는 `data-bg="url(data:image/png;base64,...) center / cover no-repeat"`. 이 정확한 형태여야 에디터 배경 UI에서 편집 가능하다(다른 형태는 보존만 됨).
```

- [ ] **Step 5: 통과 확인** — Run: `npm test`. Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add tools/lib/validate.mjs tools/lib/validate.test.mjs docs/ai-guide.md
git commit -m "feat(tools): data-shape 5종 검증·AI 가이드 도형/회전/배경 레시피"
```

---

### Task 4: 에디터 렌더 — 회전·도형 SVG

**Files:**
- Modify: `editor/src/canvas/styleFromModel.ts` (rotation 파라미터), `editor/src/canvas/ElementView.tsx` (rotation 전달·line/arrow SVG), `editor/src/app.css`
- Test: `editor/src/canvas/ElementView.test.tsx` (기존 파일에 추가 — 없으면 신규)

**Interfaces:**
- Consumes: Task 1 `rotation`, Task 2 `SHAPE_INNER_HTML`/`isLinear`
- Produces: `styleFromModel(frame, extraStyle, rotation = 0)` — 셋째 인자 추가(기존 호출 하위 호환)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/ElementView.test.tsx`에 추가 (파일이 없으면 아래 import·헬퍼 포함 신규 작성, 있으면 관례 재사용):

```tsx
import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createIdGen } from '../model/id.ts'
import { createShape, createTextElement } from '../model/ops.ts'
import { ElementView } from './ElementView.tsx'

test('회전된 요소는 transform rotate로 렌더된다', () => {
  const el = { ...createTextElement(createIdGen('t'), { left: 0, top: 0, width: 100, height: 50 }, '<p>x</p>'), rotation: 30 }
  const { container } = render(<ElementView element={el} />)
  const div = container.firstElementChild as HTMLElement
  expect(div.style.transform).toBe('rotate(30deg)')
})

test('rotation 0이면 transform이 없다', () => {
  const el = createTextElement(createIdGen('t'), { left: 0, top: 0, width: 100, height: 50 }, '<p>x</p>')
  const { container } = render(<ElementView element={el} />)
  expect((container.firstElementChild as HTMLElement).style.transform).toBe('')
})

test('line/arrow 도형은 정준 SVG를 렌더한다', () => {
  const el = createShape(createIdGen('s'), 'arrow', { left: 0, top: 0, width: 320, height: 8 })
  const { container } = render(<ElementView element={el} />)
  expect(container.querySelector('svg line')).toBeTruthy()
  expect(container.querySelector('marker#wd-arrow-head')).toBeTruthy()
})

test('rect 도형은 자식 없이 렌더된다 (회귀)', () => {
  const el = createShape(createIdGen('s'), 'rect', { left: 0, top: 0, width: 240, height: 160 })
  const { container } = render(<ElementView element={el} />)
  expect(container.querySelector('svg')).toBeNull()
})
```

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/canvas/ElementView.test.tsx`. Expected: FAIL

- [ ] **Step 3: 구현**

`editor/src/canvas/styleFromModel.ts` — `styleFromModel` 교체:

```ts
export function styleFromModel(frame: Frame, extraStyle: Record<string, string>, rotation = 0): CSSProperties {
  return {
    position: 'absolute',
    left: `${frame.left}px`,
    top: `${frame.top}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    ...(rotation !== 0 ? { transform: `rotate(${rotation}deg)` } : {}),
    ...toReactKeys(extraStyle),
  } as CSSProperties
}
```

`editor/src/canvas/ElementView.tsx` — 모든 known 분기의 `styleFromModel(element.frame, element.extraStyle)`을 `styleFromModel(element.frame, element.extraStyle, element.rotation)`으로 교체하고, shape case 교체 (import에 `SHAPE_INNER_HTML, isLinear` 추가):

```tsx
    case 'shape':
      if (isLinear(element.shape)) {
        return (
          <div
            className="el el-shape"
            style={styleFromModel(element.frame, element.extraStyle, element.rotation)}
            dangerouslySetInnerHTML={{ __html: SHAPE_INNER_HTML[element.shape as 'line' | 'arrow'] }}
            {...handlers}
          />
        )
      }
      return <div className="el el-shape" style={styleFromModel(element.frame, element.extraStyle, element.rotation)} {...handlers} />
```

- [ ] **Step 4: 통과 확인** — Run: `cd editor && npm test && npm run typecheck`. Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add editor/src/canvas/styleFromModel.ts editor/src/canvas/ElementView.tsx editor/src/canvas/ElementView.test.tsx
git commit -m "feat(editor): 회전·선/화살표 SVG 캔버스 렌더"
```

---

### Task 5: 툴바 도형 팝오버

**Files:**
- Modify: `editor/src/panels/Toolbar.tsx` (도형 버튼 → 팝오버 5종), `editor/src/app.css` (기존 .layout-popover 재사용 — 추가 규칙 불필요 시 무변경)
- Test: `editor/src/panels/Toolbar.test.tsx` (추가·기존 도형 테스트 갱신)

**Interfaces:**
- Consumes: Task 2 `createShape`, `ShapeKind`
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/Toolbar.test.tsx`에 추가 (기존 렌더 헬퍼·dispatch 검사 관례 재사용. 기존에 '도형' 버튼 클릭이 즉시 삽입을 기대하는 테스트가 있으면 팝오버 경유로 갱신하되 단언은 유지):

```tsx
test('도형 버튼은 팝오버를 열고 5종을 보여준다', () => {
  const { getByRole, getAllByRole, queryByRole } = renderToolbar()  // 파일의 기존 헬퍼 사용
  expect(queryByRole('menu')).toBeNull()
  fireEvent.click(getByRole('button', { name: '도형' }))
  expect(getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['사각형', '둥근 사각형', '타원', '선', '화살표'])
})

test('타원 선택은 border-radius 50% 도형을 1 APPLY_DOC으로 삽입한다', () => {
  const { dispatch, getByRole } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '도형' }))
  fireEvent.click(getByRole('menuitem', { name: '타원' }))
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const doc = applies[0]![0].doc as DeckDoc
  const added = doc.slides[0]!.elements.at(-1)!
  expect(added.type).toBe('shape')
  if (added.type !== 'shape') return
  expect(added.shape).toBe('ellipse')
  expect(added.extraStyle['border-radius']).toBe('50%')
})

test('선 선택은 320×8 선을 삽입한다', () => {
  const { dispatch, getByRole } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '도형' }))
  fireEvent.click(getByRole('menuitem', { name: '선' }))
  const doc = (dispatch.mock.calls.find(([a]) => a?.type === 'APPLY_DOC')![0]).doc as DeckDoc
  const added = doc.slides[0]!.elements.at(-1)!
  if (added.type !== 'shape') return
  expect(added.shape).toBe('line')
  expect(added.frame.width).toBe(320)
  expect(added.frame.height).toBe(8)
})
```

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/panels/Toolbar.test.tsx`. Expected: 신규 FAIL

- [ ] **Step 3: 구현**

`editor/src/panels/Toolbar.tsx`:

1. import에 `createShape`(ops)·`ShapeKind`(types) 추가, `useEffect`/`useRef` 필요 시 추가
2. 팝오버 상태 (SlidePanel의 레이아웃 팝오버와 동일 패턴):

```tsx
  const [shapeOpen, setShapeOpen] = useState(false)
  const shapeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!shapeOpen) return
    const onOutside = (e: PointerEvent) => {
      if (shapeRef.current && !shapeRef.current.contains(e.target as Node)) setShapeOpen(false)
    }
    window.addEventListener('pointerdown', onOutside)
    return () => window.removeEventListener('pointerdown', onOutside)
  }, [shapeOpen])

  const SHAPE_MENU: { kind: ShapeKind; label: string }[] = [
    { kind: 'rect', label: '사각형' },
    { kind: 'rounded', label: '둥근 사각형' },
    { kind: 'ellipse', label: '타원' },
    { kind: 'line', label: '선' },
    { kind: 'arrow', label: '화살표' },
  ]

  const insertShapeKind = (kind: ShapeKind) => {
    const slide = state.doc?.slides[state.currentSlideIndex]
    if (!state.doc || !slide) return
    const frame = kind === 'line' || kind === 'arrow'
      ? { left: 480, top: 356, width: 320, height: 8 }
      : { left: 520, top: 280, width: 240, height: 160 }
    const el = createShape(idGen, kind, frame)
    dispatch({ type: 'APPLY_DOC', doc: addElement(state.doc, slide.id, el), select: [el.id] })
  }
```

(기존 `insertShape`가 쓰는 doc/slide 접근·addElement·select 관례를 먼저 읽고 동일하게 맞출 것 — 위 코드는 형태 예시이며 기존 insertText/insertShape의 실제 시그니처를 따른다. 기존 `insertShape` 함수와 `도형` 단일 버튼은 제거)

3. 툴바 마크업의 `<button ...>도형</button>`을 교체:

```tsx
        <div className="layout-popover-root" ref={shapeRef}>
          <button type="button" disabled={!hasDoc} onClick={() => setShapeOpen((o) => !o)}>도형</button>
          {shapeOpen && (
            <div className="layout-popover" role="menu">
              {SHAPE_MENU.map((s) => (
                <button key={s.kind} type="button" role="menuitem" onClick={() => { setShapeOpen(false); insertShapeKind(s.kind) }}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 4: 통과 확인** — Run: `cd editor && npm test && npm run typecheck`. Expected: 전부 PASS (기존 도형 삽입 테스트는 팝오버 경유로 갱신, 단언 유지)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/panels/Toolbar.tsx editor/src/panels/Toolbar.test.tsx editor/src/app.css
git commit -m "feat(editor): 도형 삽입 팝오버 5종"
```

---

### Task 6: 회전 제스처 — 핸들·스냅 제외

**Files:**
- Modify: `editor/src/canvas/geometry.ts` (angleFromCenter·snapAngle), `editor/src/canvas/SelectionOverlay.tsx` (회전 핸들·박스 회전·핸들 숨김), `editor/src/canvas/CanvasArea.tsx` (RotateGesture·스냅 제외), `editor/src/app.css`
- Test: `editor/src/canvas/geometry.test.ts` (추가), `editor/src/canvas/CanvasArea.test.tsx` (추가)

**Interfaces:**
- Consumes: Task 1 `setElementRotation`·`normalizeAngle`(model/rotation.ts), Task 4 렌더
- Produces: `angleFromCenter(cx, cy, px, py): number`(12시=0°, 시계방향), `snapAngle(deg, step = 15): number` (geometry.ts)

**동작 계약:** ① 단일 선택 시 선택 박스 상단 중앙 위에 회전 핸들(클래스 `handle-rotate`, aria-label `회전`) ② 드래그 = 중심 기준 자유 회전(정수 반올림), Shift = 15° 스냅, pointerup 1 APPLY_DOC(변화 없으면 no-dispatch) ③ 선택 박스는 요소 rotation을 따라 회전 ④ rotation ≠ 0이면 리사이즈 핸들 미표시 ⑤ rotation ≠ 0 요소는 buildSnapTargets 대상·자신의 이동 스냅에서 제외.

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/geometry.test.ts`에 추가:

```ts
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
```

`editor/src/canvas/CanvasArea.test.tsx`에 추가 (파일의 기존 렌더 헬퍼·문서 픽스처 관례 재사용):

```tsx
test('회전 핸들 드래그는 pointerup에 1회 APPLY_DOC으로 회전을 커밋한다', () => {
  const { dispatch, container } = renderCanvasWithSelection()  // 단일 요소 선택 상태 헬퍼 — 기존 리사이즈 테스트의 준비 코드 재사용
  const handle = container.querySelector('.handle-rotate')!
  fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
  fireEvent.pointerUp(window)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const el = (applies[0]![0].doc as DeckDoc).slides[0]!.elements[0]!
  if (el.type === 'opaque') return
  expect(el.rotation).not.toBe(0)
})

test('회전된 요소는 리사이즈 핸들이 표시되지 않고 회전 핸들만 남는다', () => {
  const { container } = renderCanvasWithRotatedSelection()  // rotation 30 요소 선택 픽스처
  expect(container.querySelector('.handle-rotate')).toBeTruthy()
  expect(container.querySelector('.handle-se')).toBeNull()
})
```

주의: 두 헬퍼는 CanvasArea.test.tsx의 기존 준비 코드(문서 파싱→render→요소 선택)를 함수로 추출해 만든다. 회전 픽스처는 `transform:rotate(30deg)` 스타일을 문서 문자열에 넣으면 된다. pointer 이벤트 좌표·스케일은 기존 리사이즈 테스트 관례를 따르되, 회전 각도의 정확한 값 단언은 하지 않는다(스테이지 rect 의존) — "0이 아니게 변했고 1회 커밋"만 단언.

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/canvas/geometry.test.ts src/canvas/CanvasArea.test.tsx`. Expected: 신규 FAIL

- [ ] **Step 3: geometry 구현**

`editor/src/canvas/geometry.ts` (import에 `normalizeAngle` — `../model/rotation.ts`):

```ts
/** 중심(cx,cy) 기준 포인터(px,py)의 각도 — 12시 방향 0°, 시계방향 [0,360) */
export function angleFromCenter(cx: number, cy: number, px: number, py: number): number {
  return normalizeAngle((Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90)
}

export function snapAngle(deg: number, step = 15): number {
  return normalizeAngle(Math.round(deg / step) * step)
}
```

- [ ] **Step 4: SelectionOverlay 구현**

`editor/src/canvas/SelectionOverlay.tsx`:

1. `ResizeInteraction`에 `onRotatePointerDown: (e: ReactPointerEvent) => void` 추가
2. selection-box에 회전 반영·핸들 조건 교체:

```tsx
        <div
          key={el.id}
          className="selection-box"
          style={{
            left: el.frame.left,
            top: el.frame.top,
            width: el.frame.width,
            height: el.frame.height,
            transform: el.rotation !== 0 ? `rotate(${el.rotation}deg)` : undefined,
          }}
        >
          {resize?.elementId === el.id && (
            <>
              {el.rotation === 0 &&
                RESIZE_HANDLES.map((h) => (
                  <div key={h} className={`handle handle-${h}`} style={HANDLE_POS[h]} onPointerDown={(e) => resize.onHandlePointerDown(e, h)} />
                ))}
              <div
                className="handle handle-rotate"
                role="button"
                aria-label="회전"
                onPointerDown={(e) => resize.onRotatePointerDown(e)}
              />
            </>
          )}
        </div>
```

`editor/src/app.css`에 추가:

```css
.handle-rotate { position: absolute; left: 50%; top: -24px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: #fff; border: 1px solid var(--wd-primary, #1a56db); cursor: grab; }
```

- [ ] **Step 5: CanvasArea 구현**

`editor/src/canvas/CanvasArea.tsx`:

1. import 추가: `setElementRotation`(ops), `angleFromCenter, snapAngle`(geometry)
2. Gesture 유니언에 추가:

```tsx
interface RotateGesture {
  kind: 'rotate'
  slideId: string
  id: string
  rotation: number
  rotated: boolean
}

type Gesture = MoveGesture | ResizeGesture | RotateGesture
```

3. previewDoc에 rotate 분기 추가 (resize 분기 앞):

```tsx
    if (gesture.kind === 'rotate') {
      if (!gesture.rotated) return doc
      return setElementRotation(doc, gesture.slideId, gesture.id, gesture.rotation)
    }
```

(previewDoc의 마지막 `if (!gesture.resized)` 부분은 kind 좁히기가 유지되도록 기존 구조에 맞춰 배치)

4. `beginRotate` 추가 (beginResize 아래):

```tsx
  const beginRotate = (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const known = slide.elements.filter(isKnownElement)
    const el = known.find((k) => k.id === selectedIds[0])
    if (!el) return
    const stage = (e.currentTarget as HTMLElement).closest('.slide-stage')
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const cx = el.frame.left + el.frame.width / 2
    const cy = el.frame.top + el.frame.height / 2
    const docAtStart = doc
    const g: RotateGesture = { kind: 'rotate', slideId: slide.id, id: el.id, rotation: el.rotation, rotated: false }
    const onMove = (ev: PointerEvent) => {
      const px = (ev.clientX - rect.left) / scaleRef.current
      const py = (ev.clientY - rect.top) / scaleRef.current
      const raw = angleFromCenter(cx, cy, px, py)
      g.rotation = ev.shiftKey ? snapAngle(raw) : Math.round(raw)
      g.rotated = true
      setGesture({ ...g })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (g.rotated && g.rotation !== el.rotation) {
        dispatch({ type: 'APPLY_DOC', doc: setElementRotation(docAtStart, g.slideId, g.id, g.rotation) })
      }
      setGesture(null)
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

5. 스냅 제외 — beginMove의 targets 계산에서 회전 요소 제외 + 자신이 회전이면 스냅 없음:

```tsx
    const targets: SnapTargets | null =
      single && single.rotation === 0
        ? buildSnapTargets(doc.slideWidth, doc.slideHeight, known.filter((el) => el.id !== single.id && el.rotation === 0).map((el) => el.frame))
        : null
```

beginResize의 targets도 동일하게 `known.filter((k) => k.id !== el.id && k.rotation === 0)`로.

6. SelectionOverlay resize prop에 `onRotatePointerDown: beginRotate` 추가.

- [ ] **Step 6: 통과 확인** — Run: `cd editor && npm test && npm run typecheck`. Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add editor/src/canvas/ editor/src/app.css
git commit -m "feat(editor): 회전 핸들 제스처 — Shift 15° 스냅·회전 요소 리사이즈/스냅 제외"
```

---

### Task 7: 속성 패널 — 회전 입력·선 색 매핑

**Files:**
- Modify: `editor/src/panels/PropertiesPanel.tsx`
- Test: `editor/src/panels/PropertiesPanel.test.tsx` (추가)

**Interfaces:**
- Consumes: Task 1 `setElementRotation`, Task 2 `isLinear`

**동작 계약:** ① 단일 선택 위치·크기 섹션에 `회전` NumberField(기존 드래프트 패턴·per-element key) — 커밋 시 setElementRotation([0,360) 정규화), 같은 값 no-dispatch ② 선택이 전부 line/arrow면: 채우기 ColorPopover의 onPick이 `background` 대신 `color`를 패치하고 표시값도 extraStyle color에서 읽으며, 테두리·그림자 UI를 숨긴다 ③ 혼합 선택이면 기존 동작(background) 유지.

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/PropertiesPanel.test.tsx`에 추가 (기존 renderPanel/appliedDoc 헬퍼 재사용, line 요소 픽스처는 DOC 문자열에 `<div class="el el-shape" data-shape="line" style="left:10px; top:10px; width:320px; height:8px; color:#374151;"></div>` 추가 또는 전용 문서 파싱):

```tsx
test('회전 입력은 blur에서 1회 커밋하고 [0,360)으로 정규화한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_TEXT] })
  const input = getByLabelText('회전')
  fireEvent.change(input, { target: { value: '370' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.blur(input)
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements.find((e) => e.id === EL_TEXT)!
  if (el.type === 'opaque') return
  expect(el.rotation).toBe(10)
})

test('같은 회전 값 커밋은 디스패치하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_TEXT] })
  const input = getByLabelText('회전')
  fireEvent.change(input, { target: { value: '0' } })
  fireEvent.blur(input)
  expect(dispatch).not.toHaveBeenCalled()
})

test('선 요소 선택 시 채우기는 color를 패치하고 테두리·그림자는 숨긴다', () => {
  const { dispatch, getByText, queryByText } = renderLinePanel()  // line 요소 단일 선택 픽스처 헬퍼
  expect(queryByText('테두리')).toBeNull()
  expect(queryByText('그림자')).toBeNull()
  fireEvent.click(getByText('채우기'))
  fireEvent.click(getAllByLabelText(/색상 /)[0]!)  // 스와치 클릭 — 기존 ColorPopover 테스트 관례의 스와치 셀렉터를 따를 것
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  if (el.type === 'opaque') return
  expect(el.extraStyle['color']).toBeTruthy()
  expect(el.extraStyle['background']).toBeUndefined()
})
```

주의: 세 번째 테스트의 스와치 클릭 셀렉터는 ColorPopover.test.tsx의 기존 관례(스와치 버튼 aria-label)를 먼저 읽고 동일하게 맞춘다. 채우기 트리거 라벨도 기존 패널 마크업을 확인해 맞출 것 — 단언(색이 color 키로 감)은 유지.

- [ ] **Step 2: 실패 확인** — Run: `cd editor && npx vitest run src/panels/PropertiesPanel.test.tsx`. Expected: 신규 FAIL

- [ ] **Step 3: 구현**

`editor/src/panels/PropertiesPanel.tsx`:

1. import 추가: `setElementRotation`(ops), `isLinear`(model/shapeSvg.ts), `normalizeAngle`(model/rotation.ts)
2. 단일 선택 위치·크기 섹션(NumberField들 옆)에 회전 필드 추가 — 기존 NumberField 컴포넌트·per-element key 관례 그대로:

```tsx
          <NumberField
            key={`${el.id}-rot`}
            label="회전"
            value={el.rotation}
            onCommit={(v) => {
              const next = normalizeAngle(v)
              if (next !== el.rotation) {
                dispatch({ type: 'APPLY_DOC', doc: setElementRotation(doc, slide.id, el.id, next) })
              }
            }}
          />
```

(NumberField의 실제 props 시그니처를 먼저 읽고 맞출 것 — 위는 형태 예시. 파싱 실패 시 이전 값 복원·Escape 취소는 NumberField가 이미 제공)

3. 채우기/테두리/그림자 분기:

```tsx
  const allLinear = selectedKnown.length > 0 && selectedKnown.every((el) => el.type === 'shape' && isLinear(el.shape))
```

- 채우기 ColorPopover: 표시값을 `allLinear ? first.extraStyle['color'] : first.extraStyle['background']`에서 읽고, onPick을 `applyStyle({ [allLinear ? 'color' : 'background']: c })`로. "채우기 없음"(onClear)도 같은 키로 null 패치
- 테두리·그림자 섹션 JSX를 `{!allLinear && (...)}`로 감싼다

- [ ] **Step 4: 통과 확인** — Run: `cd editor && npm test && npm run typecheck`. Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add editor/src/panels/PropertiesPanel.tsx editor/src/panels/PropertiesPanel.test.tsx
git commit -m "feat(editor): 패널 회전 입력·선/화살표 색 매핑"
```

---

### Task 8: 문서 갱신과 최종 검증

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-webdeck-design.md` (§12), `README.md`, `docs/roadmap.md`

- [ ] **Step 1: 마스터 스펙 §12 목록 끝(Plan 7 항목 다음)에 추가**

```markdown
- **Plan 9 — 도형 확장·회전 (2026-07-04)**: 포맷 v1.1 요소 확장 — data-shape 5종(rect/ellipse/rounded/line/arrow, 외형은 인라인 스타일 내장·line/arrow는 퍼센트 좌표 정준 SVG를 직렬화가 재생성), 요소 회전 1급 rotation 필드(정확한 rotate(n deg)만 승격, 그 외 transform은 extraStyle 보존, 저장은 인라인 transform). 에디터: 도형 팝오버 삽입, 회전 핸들(Shift 15° 스냅)+패널 수치, 회전 요소는 드래그 리사이즈·스냅 제외. 검증기 5종 허용·ai-guide 도형/회전/배경 레시피. 표 편집기는 Plan 9b로 분리. 상세: `2026-07-04-webdeck-shapes-design.md`
```

- [ ] **Step 2: README 갱신**

"현재 제공"의 "테마·템플릿" 항목 다음에 추가:

```markdown
- **도형·회전** — 도형 5종(사각형/둥근 사각형/타원/선/화살표) 삽입과 요소 회전(핸들 드래그·Shift 15° 스냅·수치 입력). 회전·도형 외형은 문서 인라인 스타일이라 브라우저·인쇄에서 그대로 렌더
```

"## 로드맵" 완료 줄의 `~~Plan 7: 테마·레이아웃·템플릿~~ (완료)` 를 `~~Plan 7: 테마·레이아웃·템플릿~~ · ~~Plan 9: 도형·회전~~ (완료)` 로 교체하고, "이후 계획" 줄을 `- 이후 계획: \`docs/roadmap.md\` (표 편집기 9b, 배포, AI 연동 — Plan 8은 맨 마지막)` 로 교체.

- [ ] **Step 3: roadmap.md 갱신**

`### Plan 9 — 큰 요소 타입` 제목을 `### Plan 9 — 큰 요소 타입 ✅ (도형·회전 완료, 표는 9b)` 로 바꾸고 문단 끝에 추가:

```markdown
— 2026-07-04 도형 5종·회전 완료. 표 편집기(el-table)는 Plan 9b로 분리(미착수). 회전 요소의 드래그 리사이즈는 제한(패널 수치로).
```

- [ ] **Step 4: 전체 검증** — Run (루트): `npm run test:all && cd editor && npm run typecheck && npm run build`. Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add docs/superpowers/specs/2026-07-02-webdeck-design.md README.md docs/roadmap.md
git commit -m "docs: Plan 9 이력·README·로드맵 갱신"
```

---

## 알려진 한계 (스펙 §7)

- 회전 요소는 드래그 리사이즈·스냅 제외 (패널 수치로 조정)
- 선 기울기는 회전으로만, 굵기 고정 2px
- line/arrow 내부는 저장 시 정준형으로 정규화 (원문 보존 비목표)
- 화살표 marker id 중복은 동일 정의라 렌더 무해
- v1 검증기·구버전은 신규 도형을 오류/opaque 취급 (렌더는 인라인 스타일이라 정상)

## 수동 확인 (사람 확인 — 머지 후)

1. 도형 팝오버로 5종 삽입 → 타원·둥근 사각형 모서리, 선·화살표(머리 무왜곡) 확인
2. 회전 핸들 드래그(Shift 15° 스냅)·패널 수치 입력 → Ctrl+Z 1스텝 복원, 회전 요소의 리사이즈 핸들 사라짐 확인
3. 선 색을 채우기 팝오버로 변경 → 선·화살표 머리 색이 함께 바뀜
4. 저장 → `node tools/validate-webdeck.mjs` 통과 → 브라우저·발표 모드에서 도형·회전 렌더 확인
5. AI 문서에 `transform: rotate(10deg) scale(2)` 같은 비표준 transform이 있는 요소가 그대로 보존되는지 (열기→저장→비교)
