# Plan 5: 서식·속성 심화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebDeck 에디터에 속성 패널(수치·스타일), 텍스트 서식 심화(폰트/크기/색/목록/줄간격/세로정렬), 조작 개선(분배/비율 리사이즈/리사이즈 스냅/수동 줌)을 추가한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-03-webdeck-formatting-design.md` 기준. 모든 신규 스타일은 기존 모델의 `extraStyle`(요소 인라인 스타일)로 저장되어 **포맷 v1 확장 없이** 왕복 계약을 유지한다. UI는 우측 속성 패널(신규 `PropertiesPanel`)과 기존 툴바 확장으로 구성한다. 텍스트 도구 중 포커스를 받는 컨트롤(입력·드롭다운)은 `data-text-tool` 속성 + 셀렉션 저장/복원 유틸로 contentEditable 편집 세션을 유지한다.

**Tech Stack:** React 19 + TypeScript strict, Vite 8, Vitest + happy-dom(globals) + React Testing Library. Node 22+, ESM.

## Global Constraints

- 런타임 의존성은 `react`, `react-dom` 2개뿐 — 새 패키지 추가 금지
- TS strict + `noUncheckedIndexedAccess`, 모든 상대 import에 `.ts`/`.tsx` 확장자 필수
- UI 문구는 전부 한국어
- **1 사용자 조작 = 1 APPLY_DOC** (undo 1스텝). 연속 발화 입력(컬러 피커·슬라이더·텍스트 입력)은 드래프트 로컬 상태 후 blur/Enter/pointerup에서 1회 커밋
- 포맷 v1 확장 금지 — 문서에 새 클래스/속성/데이터 속성을 도입하지 않는다. 요소 스타일은 `extraStyle`로만
- 편집 포커스 규칙: 버튼형 텍스트 도구는 `onPointerDown={keepFocus}`(preventDefault), 포커스가 필요한 텍스트 도구(input/select)는 `data-text-tool="1"` + 셀렉션 저장/복원 (Task 8 인프라)
- 테스트: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run <파일>` (전체: `npm test`). 커밋 전 태스크 관련 파일 테스트 + 타입체크(`npm run typecheck`) 통과 필수
- `git add`는 명시된 파일/디렉터리만 (예: `git add src/...`) — `out/` 등 잡파일 유입 금지
- 기존 테스트를 깨뜨리는 변경 금지 — 태스크 완료 시점에 전체 스위트 그린

## 파일 구조

| 파일 | 역할 | 태스크 |
|---|---|---|
| `editor/src/canvas/geometry.ts` (수정) | 분배·비율 리사이즈·리사이즈 스냅 순수 함수 | 1 |
| `editor/src/model/ops.ts` (수정) | `setElementStyle` — extraStyle 패치 커맨드 | 2 |
| `editor/src/panels/ColorPopover.tsx` (신규) | 공용 색 선택 팝오버 (스와치 12 + hex) | 3 |
| `editor/src/panels/PropertiesPanel.tsx` (신규) | 우측 속성 패널 (슬라이드/단일/다중 모드) | 4, 5, 6, 7 |
| `editor/src/App.tsx`, `editor/src/app.css` (수정) | 3열 그리드 레이아웃 + 패널 장착 | 4 |
| `editor/src/panels/Toolbar.tsx` (수정) | 배경색 제거(4), 텍스트 서식 확장(9, 10, 11), 세로정렬·분배(12) | 4, 9~12 |
| `editor/src/panels/format.ts` (수정) | 폰트 목록·셀렉션 저장/복원·목록·줄간격 유틸 | 8~11 |
| `editor/src/canvas/TextEditable.tsx` (수정) | `data-text-tool` blur 가드 | 8 |
| `editor/src/canvas/CanvasArea.tsx` (수정) | 리사이즈 제스처 확장(13), 수동 줌(14) | 13, 14 |

태스크 순서는 의존 순서다: 1~3(순수 함수·공용 컴포넌트) → 4~7(패널) → 8~11(텍스트 서식) → 12(툴바 조작) → 13~14(캔버스) → 15(문서).

---

### Task 1: geometry 확장 — 분배·비율 리사이즈·리사이즈 스냅

**Files:**
- Modify: `editor/src/canvas/geometry.ts`
- Test: `editor/src/canvas/geometry.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: 기존 `Frame`, `ResizeHandle`, `SnapTargets`, `Guide`, `MIN_SIZE`, `SNAP_THRESHOLD`, 내부 `bestOffset`
- Produces (이후 태스크가 사용):
  - `resizeFrame(orig: Frame, handle: ResizeHandle, dx: number, dy: number, lockAspect?: boolean): Frame` — 기존 시그니처에 5번째 옵션 인자 추가 (기본 false, 기존 호출부 무변경)
  - `distributeFrames(frames: Frame[], axis: 'x' | 'y'): Frame[]` — 입력 순서 유지, 첫/끝 고정 균등 분배
  - `snapResize(orig: Frame, handle: ResizeHandle, dx: number, dy: number, targets: SnapTargets): { frame: Frame; guides: Guide[] }`

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/geometry.test.ts` 끝에 추가:

```ts
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
```

import 줄에 `distributeFrames`, `snapResize`를 추가한다. `describe`는 기존 파일이 vitest globals를 쓰므로 그대로 사용 가능.

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/canvas/geometry.test.ts`
Expected: FAIL — `distributeFrames`/`snapResize` export 없음, lockAspect 인자 무시로 비율 테스트 실패

- [ ] **Step 3: 구현**

`editor/src/canvas/geometry.ts`의 `resizeFrame`을 다음으로 교체:

```ts
export function resizeFrame(orig: Frame, handle: ResizeHandle, dx: number, dy: number, lockAspect = false): Frame {
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
  // 모서리 핸들 + 비율 고정: 상대 변화가 큰 축을 기준으로 다른 축을 맞추고, 반대쪽 모서리를 고정한다
  if (lockAspect && handle.length === 2 && orig.width > 0 && orig.height > 0) {
    const ratio = orig.width / orig.height
    if (width / orig.width >= height / orig.height) height = Math.max(MIN_SIZE, width / ratio)
    else width = Math.max(MIN_SIZE, height * ratio)
    if (handle.includes('w')) left = right - width
    if (handle.includes('n')) top = bottom - height
  }
  return { left, top, width, height }
}
```

파일 끝에 추가:

```ts
/** 3개 이상 frame을 축 방향으로 균등 분배 — 좌표순 첫/끝 고정, 반환은 입력 순서 유지 */
export function distributeFrames(frames: Frame[], axis: 'x' | 'y'): Frame[] {
  if (frames.length <= 2) return frames.map((f) => ({ ...f }))
  const pos = axis === 'x' ? ('left' as const) : ('top' as const)
  const size = axis === 'x' ? ('width' as const) : ('height' as const)
  const order = frames.map((_, i) => i).sort((a, b) => frames[a]![pos] - frames[b]![pos])
  const first = frames[order[0]!]!
  const last = frames[order[order.length - 1]!]!
  const span = last[pos] + last[size] - first[pos]
  const total = order.reduce((n, i) => n + frames[i]![size], 0)
  const gap = (span - total) / (frames.length - 1)
  const out = frames.map((f) => ({ ...f }))
  let cursor = first[pos]
  for (const i of order) {
    out[i]![pos] = cursor
    cursor += frames[i]![size] + gap
  }
  return out
}

/** 리사이즈 중 스냅: 움직이는 변만 대상 라인에 흡착 (반대쪽 변 고정) */
export function snapResize(
  orig: Frame,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  targets: SnapTargets,
): { frame: Frame; guides: Guide[] } {
  const frame = resizeFrame(orig, handle, dx, dy)
  const guides: Guide[] = []
  if (handle.includes('e')) {
    const b = bestOffset([frame.left + frame.width], targets.xs)
    if (b && frame.width + b.offset >= MIN_SIZE) {
      frame.width += b.offset
      guides.push({ axis: 'x', position: b.target })
    }
  }
  if (handle.includes('w')) {
    const b = bestOffset([frame.left], targets.xs)
    if (b && frame.width - b.offset >= MIN_SIZE) {
      frame.left += b.offset
      frame.width -= b.offset
      guides.push({ axis: 'x', position: b.target })
    }
  }
  if (handle.includes('s')) {
    const b = bestOffset([frame.top + frame.height], targets.ys)
    if (b && frame.height + b.offset >= MIN_SIZE) {
      frame.height += b.offset
      guides.push({ axis: 'y', position: b.target })
    }
  }
  if (handle.includes('n')) {
    const b = bestOffset([frame.top], targets.ys)
    if (b && frame.height - b.offset >= MIN_SIZE) {
      frame.top += b.offset
      frame.height -= b.offset
      guides.push({ axis: 'y', position: b.target })
    }
  }
  return { frame, guides }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/canvas/geometry.test.ts`
Expected: PASS (기존 테스트 포함 전부)

- [ ] **Step 5: 전체 확인 + 커밋**

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npm test && npm run typecheck
cd /Users/hyunkyungmin/Developer/Home/webdeck && git add editor/src/canvas/geometry.ts editor/src/canvas/geometry.test.ts
git commit -m "feat: geometry 확장 — 간격 분배·비율 리사이즈·리사이즈 스냅 순수 함수"
```

---

### Task 2: 모델 커맨드 — setElementStyle

**Files:**
- Modify: `editor/src/model/ops.ts`
- Test: `editor/src/model/ops.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: 기존 `mapKnownElement`(모듈 내부), `DeckDoc`
- Produces: `setElementStyle(doc: DeckDoc, slideId: string, elementId: string, patch: Record<string, string | null>): DeckDoc` — extraStyle에 patch 병합, 값 `null`은 키 삭제. Task 6, 7, 12가 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/ops.test.ts`에 추가 (기존 테스트 파일의 doc 생성 헬퍼를 그대로 사용 — 파일 상단에 이미 parseWebdeck 기반 DOC 픽스처가 있다면 재사용, 없으면 아래처럼 로컬 픽스처 작성):

```ts
describe('setElementStyle', () => {
  test('새 키를 추가하고 기존 키와 순서를 유지한다', () => {
    const doc = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:10px; height:10px; background:red;"></div></section>
</main></body></html>`)
    const slide = doc.slides[0]!
    const el = slide.elements[0]!
    const out = setElementStyle(doc, slide.id, el.id, { border: '1px solid #000' })
    const outEl = out.slides[0]!.elements[0]!
    if (outEl.type === 'opaque') throw new Error('unexpected')
    expect(outEl.extraStyle).toEqual({ background: 'red', border: '1px solid #000' })
    expect(Object.keys(outEl.extraStyle)).toEqual(['background', 'border'])
  })

  test('null 값은 키를 삭제한다', () => {
    const doc = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:10px; height:10px; background:red;"></div></section>
</main></body></html>`)
    const slide = doc.slides[0]!
    const el = slide.elements[0]!
    const out = setElementStyle(doc, slide.id, el.id, { background: null })
    const outEl = out.slides[0]!.elements[0]!
    if (outEl.type === 'opaque') throw new Error('unexpected')
    expect(outEl.extraStyle).toEqual({})
  })

  test('원본 doc는 불변이다', () => {
    const doc = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:10px; height:10px;"></div></section>
</main></body></html>`)
    const slide = doc.slides[0]!
    const el = slide.elements[0]!
    setElementStyle(doc, slide.id, el.id, { opacity: '0.5' })
    if (el.type === 'opaque') throw new Error('unexpected')
    expect(el.extraStyle).toEqual({})
  })
})
```

import에 `setElementStyle` 추가. 기존 ops.test.ts에 opaque 요소 조작 시 throw를 검증하는 테스트가 이미 있으므로(`mapKnownElement` 경유) 중복 작성하지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/model/ops.test.ts`
Expected: FAIL — `setElementStyle` export 없음

- [ ] **Step 3: 구현**

`editor/src/model/ops.ts`의 `setTextHtml` 아래에 추가:

```ts
/** extraStyle 패치 — 값 null은 해당 속성 제거. frame 속성(left/top/width/height)은 다루지 않는다 */
export function setElementStyle(
  doc: DeckDoc,
  slideId: string,
  elementId: string,
  patch: Record<string, string | null>,
): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) => {
    const extraStyle: Record<string, string> = { ...el.extraStyle }
    for (const [prop, value] of Object.entries(patch)) {
      if (value === null) delete extraStyle[prop]
      else extraStyle[prop] = value
    }
    return { ...el, extraStyle }
  })
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/model/ops.test.ts`
Expected: PASS

- [ ] **Step 5: 왕복 회귀 확인 + 커밋**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npm test && npm run typecheck`
Expected: 전부 PASS (extraStyle은 직렬화가 이미 보존하므로 왕복 테스트 그린)

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck && git add editor/src/model/ops.ts editor/src/model/ops.test.ts
git commit -m "feat: setElementStyle — 요소 extraStyle 패치 커맨드"
```

---

### Task 3: 공용 색 팝오버 — ColorPopover

**Files:**
- Create: `editor/src/panels/ColorPopover.tsx`
- Modify: `editor/src/app.css` (팝오버 스타일 추가)
- Test: `editor/src/panels/ColorPopover.test.tsx` (신규)

**Interfaces:**
- Consumes: 없음 (독립 컴포넌트)
- Produces (Task 6, 7, 10이 사용):
  - `PALETTE: string[]` — 스와치 12색
  - `ColorPopover(props: ColorPopoverProps)` — props: `{ label: string; value?: string; disabled?: boolean; onPick: (color: string) => void; textTool?: boolean; onActivate?: () => void; onHexBlur?: (e: FocusEvent<HTMLInputElement>) => void; showHex?: boolean; clearLabel?: string; onClear?: () => void }`
  - `textTool` 모드: 트리거/스와치/적용/초기화 버튼이 `pointerdown preventDefault`로 편집 포커스를 유지하고, 트리거 열기·hex 포커스 시 `onActivate`(셀렉션 저장) 호출, hex 입력에 `data-text-tool="1"` 부여

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/ColorPopover.test.tsx` 신규:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ColorPopover, PALETTE } from './ColorPopover.tsx'

test('트리거 클릭으로 열리고 스와치 12종이 렌더링된다', () => {
  const { getByRole, getAllByRole } = render(<ColorPopover label="채우기 색" onPick={vi.fn()} />)
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  expect(getAllByRole('button', { name: /^색 #/ })).toHaveLength(12)
})

test('스와치 클릭은 onPick 호출 후 팝오버를 닫는다', () => {
  const onPick = vi.fn()
  const { getByRole, queryByRole } = render(<ColorPopover label="채우기 색" onPick={onPick} />)
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  fireEvent.click(getByRole('button', { name: `색 ${PALETTE[0]}` }))
  expect(onPick).toHaveBeenCalledWith(PALETTE[0])
  expect(queryByRole('dialog')).toBeNull()
})

test('유효한 hex 입력 + Enter는 onPick을 호출한다', () => {
  const onPick = vi.fn()
  const { getByRole, getByLabelText } = render(<ColorPopover label="글자색" onPick={onPick} />)
  fireEvent.click(getByRole('button', { name: '글자색' }))
  const input = getByLabelText('글자색 hex')
  fireEvent.change(input, { target: { value: '#ff8800' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onPick).toHaveBeenCalledWith('#ff8800')
})

test('3자리 hex는 6자리로 확장된다', () => {
  const onPick = vi.fn()
  const { getByRole, getByLabelText } = render(<ColorPopover label="글자색" onPick={onPick} />)
  fireEvent.click(getByRole('button', { name: '글자색' }))
  fireEvent.change(getByLabelText('글자색 hex'), { target: { value: '#f80' } })
  fireEvent.click(getByRole('button', { name: '적용' }))
  expect(onPick).toHaveBeenCalledWith('#ff8800')
})

test('잘못된 hex는 무시한다', () => {
  const onPick = vi.fn()
  const { getByRole, getByLabelText } = render(<ColorPopover label="글자색" onPick={onPick} />)
  fireEvent.click(getByRole('button', { name: '글자색' }))
  fireEvent.change(getByLabelText('글자색 hex'), { target: { value: 'red' } })
  fireEvent.click(getByRole('button', { name: '적용' }))
  expect(onPick).not.toHaveBeenCalled()
})

test('clearLabel 지정 시 초기화 버튼이 onClear를 호출한다', () => {
  const onClear = vi.fn()
  const { getByRole } = render(
    <ColorPopover label="채우기 색" onPick={vi.fn()} clearLabel="채우기 없음" onClear={onClear} />,
  )
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  fireEvent.click(getByRole('button', { name: '채우기 없음' }))
  expect(onClear).toHaveBeenCalled()
})

test('showHex=false면 hex 입력이 없다', () => {
  const { getByRole, queryByLabelText } = render(<ColorPopover label="테두리 색" onPick={vi.fn()} showHex={false} />)
  fireEvent.click(getByRole('button', { name: '테두리 색' }))
  expect(queryByLabelText('테두리 색 hex')).toBeNull()
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/ColorPopover.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`editor/src/panels/ColorPopover.tsx` 신규:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, PointerEvent as ReactPointerEvent } from 'react'

export const PALETTE = [
  '#000000', '#1f2937', '#6b7280', '#d1d5db', '#ffffff', '#1a56db',
  '#60a5fa', '#dc2626', '#16a34a', '#d97706', '#eab308', '#7c3aed',
]

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function normalizeHex(raw: string): string | null {
  const v = raw.trim()
  if (!HEX_PATTERN.test(v)) return null
  if (v.length === 4) return `#${[...v.slice(1)].map((c) => c + c).join('')}`.toLowerCase()
  return v.toLowerCase()
}

export interface ColorPopoverProps {
  label: string
  value?: string
  disabled?: boolean
  onPick: (color: string) => void
  /** 텍스트 편집 도구 모드 — 버튼이 편집 포커스를 뺏지 않게 하고 hex에 data-text-tool 부여 */
  textTool?: boolean
  /** 트리거 열기(textTool)·hex 포커스 시 호출 — 편집 셀렉션 저장용 */
  onActivate?: () => void
  /** hex 입력 blur 핸들러 — 편집 종료 폴백용 (textTool 컨텍스트) */
  onHexBlur?: (e: FocusEvent<HTMLInputElement>) => void
  showHex?: boolean
  clearLabel?: string
  onClear?: () => void
}

export function ColorPopover({
  label, value, disabled, onPick, textTool, onActivate, onHexBlur, showHex = true, clearLabel, onClear,
}: ColorPopoverProps) {
  const [open, setOpen] = useState(false)
  const [hexDraft, setHexDraft] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const keep = textTool ? (e: ReactPointerEvent) => e.preventDefault() : undefined

  useEffect(() => {
    if (!open) return
    const onOutside = (e: globalThis.PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onOutside)
    return () => window.removeEventListener('pointerdown', onOutside)
  }, [open])

  const pick = (color: string) => {
    onPick(color)
    setOpen(false)
    setHexDraft('')
  }

  const applyHex = () => {
    const hex = normalizeHex(hexDraft)
    if (hex) pick(hex)
  }

  return (
    <div className="color-popover-root" ref={rootRef}>
      <button
        type="button"
        className="color-trigger"
        aria-label={label}
        title={label}
        disabled={disabled}
        onPointerDown={(e) => {
          if (textTool) {
            e.preventDefault()
            onActivate?.()
          }
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="color-chip" style={{ background: value ?? 'transparent' }} />
        {label}
      </button>
      {open && (
        <div className="color-popover" role="dialog" aria-label={`${label} 선택`}>
          <div className="color-grid">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className="swatch"
                aria-label={`색 ${c}`}
                title={c}
                style={{ background: c }}
                onPointerDown={keep}
                onClick={() => pick(c)}
              />
            ))}
          </div>
          {showHex && (
            <div className="color-hex">
              <input
                aria-label={`${label} hex`}
                placeholder="#rrggbb"
                value={hexDraft}
                data-text-tool={textTool ? '1' : undefined}
                onFocus={textTool ? onActivate : undefined}
                onBlur={onHexBlur}
                onChange={(e) => setHexDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyHex()
                  }
                }}
              />
              <button type="button" onPointerDown={keep} onClick={applyHex}>적용</button>
            </div>
          )}
          {clearLabel && onClear && (
            <button
              type="button"
              className="color-clear"
              onPointerDown={keep}
              onClick={() => {
                onClear()
                setOpen(false)
              }}
            >
              {clearLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

`editor/src/app.css` 끝에 추가:

```css
.color-popover-root { position: relative; display: inline-flex; }
.color-trigger { display: inline-flex; align-items: center; gap: 5px; }
.color-chip { width: 14px; height: 14px; border: 1px solid #d1d5db; border-radius: 3px; display: inline-block; }
.color-popover { position: absolute; top: calc(100% + 4px); left: 0; z-index: 30; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12); width: 168px; }
.color-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-bottom: 6px; }
.color-popover .swatch { width: 22px; height: 22px; padding: 0; border: 1px solid #d1d5db; border-radius: 3px; cursor: pointer; }
.color-hex { display: flex; gap: 4px; }
.color-hex input { width: 90px; font: inherit; font-size: 12px; padding: 2px 6px; border: 1px solid #d1d5db; border-radius: 4px; }
.color-hex button, .color-clear { font: inherit; font-size: 12px; padding: 2px 8px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; cursor: pointer; }
.color-clear { margin-top: 6px; width: 100%; }
```

- [ ] **Step 4: 통과 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/ColorPopover.test.tsx`
Expected: PASS (7개)

- [ ] **Step 5: 전체 확인 + 커밋**

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npm test && npm run typecheck
git add editor/src/panels/ColorPopover.tsx editor/src/panels/ColorPopover.test.tsx editor/src/app.css
git commit -m "feat: ColorPopover — 스와치 12종+hex 공용 색 선택 팝오버"
```

---

### Task 4: 3열 레이아웃 + 속성 패널 뼈대 + 슬라이드 배경색 이전

**Files:**
- Create: `editor/src/panels/PropertiesPanel.tsx`
- Create: `editor/src/panels/PropertiesPanel.test.tsx`
- Modify: `editor/src/App.tsx` (패널 장착)
- Modify: `editor/src/app.css` (3열 그리드 + 패널 스타일)
- Modify: `editor/src/panels/Toolbar.tsx` (슬라이드 배경색 그룹 제거)
- Modify: `editor/src/panels/Toolbar.test.tsx` (배경색 테스트 제거 — 패널 테스트로 이전)

**Interfaces:**
- Consumes: `EditorState`/`EditorAction`/`isDirty` 패턴(store.ts), `setSlideBg`(ops.ts), `isKnownElement`(types.ts)
- Produces (Task 5~7이 이 파일에 섹션을 추가):
  - `PropertiesPanel({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> })` — doc 없으면 빈 `<aside className="props">`, 선택 없으면 슬라이드 모드(배경색), 선택 있으면 요소 모드(헤딩만; 섹션은 후속 태스크)
  - 패널 내부에서 쓸 공통 파생값: `selectedKnown: KnownElement[]` (현재 슬라이드에서 선택된 known 요소들)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/PropertiesPanel.test.tsx` 신규:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { DeckDoc } from '../model/types.ts'
import { parseWebdeck } from '../model/parse.ts'
import { editorReducer, initialEditorState } from '../state/store.ts'
import type { EditorState } from '../state/store.ts'
import { PropertiesPanel } from './PropertiesPanel.tsx'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide" data-bg="#ffffff">
<div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>제목</p></div>
<div class="el el-shape" data-shape="rect" style="left:300px; top:300px; width:80px; height:80px; background:red;"></div>
</section>
</main></body></html>`)

const EL_TEXT = DOC.slides[0]!.elements[0]!.id
const EL_SHAPE = DOC.slides[0]!.elements[1]!.id

function makeState(over: Partial<EditorState> = {}): EditorState {
  const opened = editorReducer(initialEditorState, {
    type: 'OPEN_SUCCESS',
    doc: DOC,
    fileName: 't.html',
    fileHandle: null,
  })
  return { ...opened, ...over }
}

function renderPanel(over: Partial<EditorState> = {}) {
  const dispatch = vi.fn()
  const utils = render(<PropertiesPanel state={makeState(over)} dispatch={dispatch} />)
  return { dispatch, ...utils }
}

function appliedDoc(dispatch: ReturnType<typeof vi.fn>): DeckDoc | null {
  const action = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  return action ? (action.doc as DeckDoc) : null
}

test('선택이 없으면 슬라이드 모드 — 배경색 입력을 보여준다', () => {
  const { getByText, getByLabelText } = renderPanel()
  expect(getByText('슬라이드')).toBeTruthy()
  expect(getByLabelText('배경색')).toBeTruthy()
})

test('배경색 변경은 blur 시 1회만 APPLY_DOC 한다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  const input = getByLabelText('배경색')
  fireEvent.change(input, { target: { value: '#ff0000' } })
  fireEvent.change(input, { target: { value: '#00ff00' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.blur(input)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.bg).toBe('#00ff00')
})

test('배경색을 바꾸지 않고 blur하면 dispatch하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  fireEvent.blur(getByLabelText('배경색'))
  expect(dispatch).not.toHaveBeenCalled()
})

test('요소 선택 시 요소 모드 헤딩을 보여주고 배경색 입력은 없다', () => {
  const { getByText, queryByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  expect(getByText('요소')).toBeTruthy()
  expect(queryByLabelText('배경색')).toBeNull()
})

test('다중 선택 시 개수를 표시한다', () => {
  const { getByText } = renderPanel({ selectedIds: [EL_TEXT, EL_SHAPE] })
  expect(getByText('요소 2개')).toBeTruthy()
})

test('doc이 없으면 빈 패널을 렌더링한다', () => {
  const dispatch = vi.fn()
  const { container, queryByText } = render(<PropertiesPanel state={initialEditorState} dispatch={dispatch} />)
  expect(container.querySelector('.props')).toBeTruthy()
  expect(queryByText('슬라이드')).toBeNull()
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/PropertiesPanel.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: PropertiesPanel 구현**

`editor/src/panels/PropertiesPanel.tsx` 신규:

```tsx
import { useState } from 'react'
import type { Dispatch } from 'react'
import { setSlideBg } from '../model/ops.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction, EditorState } from '../state/store.ts'

export function PropertiesPanel({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const { doc, currentSlideIndex, selectedIds } = state
  /** 배경색 피커 조작 중 임시값 — OS 피커 드래그 동안 onChange가 연속 발화하므로 blur 시 1회만 커밋 */
  const [bgDraft, setBgDraft] = useState<string | null>(null)
  const slide = doc?.slides[currentSlideIndex] ?? null
  if (!doc || !slide) return <aside className="props" aria-label="속성" />
  const selectedKnown = slide.elements.filter(isKnownElement).filter((el) => selectedIds.includes(el.id))

  if (selectedKnown.length === 0) {
    const bgValue = slide.bg && /^#[0-9a-fA-F]{6}$/.test(slide.bg) ? slide.bg : '#ffffff'
    return (
      <aside className="props" aria-label="속성">
        <h2>슬라이드</h2>
        <label className="prop-row">
          배경색
          <input
            type="color"
            aria-label="배경색"
            value={bgDraft ?? bgValue}
            onChange={(e) => setBgDraft(e.target.value)}
            onBlur={() => {
              if (bgDraft !== null && bgDraft !== bgValue) {
                dispatch({ type: 'APPLY_DOC', doc: setSlideBg(doc, slide.id, bgDraft) })
              }
              setBgDraft(null)
            }}
          />
        </label>
      </aside>
    )
  }

  return (
    <aside className="props" aria-label="속성">
      <h2>{selectedKnown.length === 1 ? '요소' : `요소 ${selectedKnown.length}개`}</h2>
      {/* 위치·크기(Task 5), 스타일(Task 6~7) 섹션이 여기에 추가된다 */}
    </aside>
  )
}
```

- [ ] **Step 4: App 장착 + 레이아웃 CSS**

`editor/src/App.tsx`:
- import 추가: `import { PropertiesPanel } from './panels/PropertiesPanel.tsx'` (panels 그룹, SlidePanel 앞 알파벳 순)
- JSX에서 `{state.doc ? (<CanvasArea ... />) : (<StartScreen ... />)}` **바로 뒤**(같은 `.app` div 안, 닫는 태그 직전)에 한 줄 추가:

```tsx
      <PropertiesPanel state={state} dispatch={dispatch} />
```

`editor/src/app.css` 수정:

```css
/* 변경: 2열 → 3열 */
.app { display: grid; grid-template-rows: 48px 44px 1fr; grid-template-columns: 208px 1fr 232px; height: 100vh; }
.topbar { grid-column: 1 / 4; /* 나머지 기존 속성 유지 */ }
.toolbar { grid-column: 1 / 4; /* 나머지 기존 속성 유지 */ }
```

(기존 `.topbar`/`.toolbar` 규칙에서 `grid-column: 1 / 3`만 `1 / 4`로 바꾼다.)

끝에 추가:

```css
.props { background: #fff; border-left: 1px solid #e5e7eb; overflow-y: auto; padding: 12px; }
.props h2 { margin: 0 0 10px; font-size: 13px; color: #374151; }
.props section { margin-bottom: 14px; }
.prop-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: #374151; margin-bottom: 8px; }
.prop-row input.num { width: 64px; font: inherit; font-size: 13px; padding: 3px 6px; border: 1px solid #d1d5db; border-radius: 4px; }
.prop-note { font-size: 12px; color: #92400e; margin: 4px 0; }
```

- [ ] **Step 5: Toolbar에서 배경색 제거 + 테스트 이전**

`editor/src/panels/Toolbar.tsx`:
- `<div className="group" aria-label="슬라이드">…</div>` 블록 전체 삭제
- `bgDraft` state, `changeBg`, `bgValue` 삭제, import에서 `setSlideBg`와 (다른 사용처가 없어졌으면) `useState` 삭제

`editor/src/panels/Toolbar.test.tsx`: 배경색 관련 테스트(테스트 이름에 '배경' 포함) 삭제 — 동등한 커버리지는 Step 1의 PropertiesPanel 테스트가 대신한다.

`editor/src/app.css`: `.bg-label` 규칙 삭제.

- [ ] **Step 6: 통과 확인 + 전체 스위트**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/PropertiesPanel.test.tsx src/panels/Toolbar.test.tsx src/App.test.tsx`
Expected: PASS. 이후 `npm test && npm run typecheck` 전부 PASS

- [ ] **Step 7: 커밋**

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck && git add editor/src/panels/PropertiesPanel.tsx editor/src/panels/PropertiesPanel.test.tsx editor/src/panels/Toolbar.tsx editor/src/panels/Toolbar.test.tsx editor/src/App.tsx editor/src/app.css
git commit -m "feat: 우측 속성 패널 뼈대 — 3열 레이아웃, 슬라이드 배경색 이전"
```

---

### Task 5: 속성 패널 — 위치·크기 수치 입력

**Files:**
- Modify: `editor/src/panels/PropertiesPanel.tsx`
- Test: `editor/src/panels/PropertiesPanel.test.tsx` (추가)

**Interfaces:**
- Consumes: Task 4의 `PropertiesPanel`/`selectedKnown`, `setElementFrame`(ops.ts), `MIN_SIZE`(canvas/geometry.ts), `Frame`(types.ts)
- Produces: 단일 선택 시 `X`/`Y`/`너비`/`높이` 수치 입력 (aria-label 동일). 내부 `NumberField` 컴포넌트 — blur/Enter 커밋, Escape 취소, 소수 첫째 자리 반올림 표시

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/PropertiesPanel.test.tsx`에 추가:

```tsx
test('단일 선택 시 X 입력 + Enter는 left를 갱신한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const input = getByLabelText('X')
  fireEvent.change(input, { target: { value: '50' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[1]!).toMatchObject({ frame: { left: 50, top: 300, width: 80, height: 80 } })
})

test('너비는 최소 8로 클램프된다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const input = getByLabelText('너비')
  fireEvent.change(input, { target: { value: '3' } })
  fireEvent.blur(input)
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[1]!).toMatchObject({ frame: { width: 8 } })
})

test('숫자가 아닌 입력은 커밋하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const input = getByLabelText('X')
  fireEvent.change(input, { target: { value: 'abc' } })
  fireEvent.blur(input)
  expect(dispatch).not.toHaveBeenCalled()
})

test('값이 그대로면 dispatch하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const input = getByLabelText('X')
  fireEvent.change(input, { target: { value: '300' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(dispatch).not.toHaveBeenCalled()
})

test('Escape는 드래프트를 버린다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const input = getByLabelText('X') as HTMLInputElement
  fireEvent.change(input, { target: { value: '999' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  fireEvent.blur(input)
  expect(dispatch).not.toHaveBeenCalled()
  expect(input.value).toBe('300')
})

test('다중 선택 시 위치·크기 섹션은 없다', () => {
  const { queryByLabelText } = renderPanel({ selectedIds: [EL_TEXT, EL_SHAPE] })
  expect(queryByLabelText('X')).toBeNull()
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/PropertiesPanel.test.tsx`
Expected: 신규 6개 FAIL (X 입력 없음)

- [ ] **Step 3: 구현**

`editor/src/panels/PropertiesPanel.tsx`:

import 추가:

```ts
import { MIN_SIZE } from '../canvas/geometry.ts'
import { setElementFrame, setSlideBg } from '../model/ops.ts'
import type { Frame } from '../model/types.ts'
```

파일 하단에 `NumberField` 추가:

```tsx
function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(Math.round(value * 10) / 10)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    setDraft(null)
    if (draft.trim() === '' || !Number.isFinite(n)) return
    onCommit(n)
  }
  return (
    <label className="prop-row">
      {label}
      <input
        className="num"
        aria-label={label}
        inputMode="decimal"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(null)
          }
        }}
      />
    </label>
  )
}
```

요소 모드 return의 `{/* 위치·크기 ... */}` 주석 자리에 추가:

```tsx
      {selectedKnown.length === 1 && (() => {
        const el = selectedKnown[0]!
        const commitFrame = (patch: Partial<Frame>) => {
          const next = { ...el.frame, ...patch }
          next.width = Math.max(MIN_SIZE, next.width)
          next.height = Math.max(MIN_SIZE, next.height)
          if (
            next.left === el.frame.left && next.top === el.frame.top &&
            next.width === el.frame.width && next.height === el.frame.height
          ) return
          dispatch({ type: 'APPLY_DOC', doc: setElementFrame(doc, slide.id, el.id, next) })
        }
        return (
          <section aria-label="위치와 크기">
            <NumberField label="X" value={el.frame.left} onCommit={(v) => commitFrame({ left: v })} />
            <NumberField label="Y" value={el.frame.top} onCommit={(v) => commitFrame({ top: v })} />
            <NumberField label="너비" value={el.frame.width} onCommit={(v) => commitFrame({ width: v })} />
            <NumberField label="높이" value={el.frame.height} onCommit={(v) => commitFrame({ height: v })} />
          </section>
        )
      })()}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/PropertiesPanel.test.tsx && npm run typecheck`
Expected: PASS

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck && git add editor/src/panels/PropertiesPanel.tsx editor/src/panels/PropertiesPanel.test.tsx
git commit -m "feat: 속성 패널 위치·크기 수치 입력 — blur/Enter 커밋, Escape 취소, 최소 크기 클램프"
```

---

### Task 6: 속성 패널 — 채우기·테두리

**Files:**
- Modify: `editor/src/panels/PropertiesPanel.tsx`
- Test: `editor/src/panels/PropertiesPanel.test.tsx` (추가)

**Interfaces:**
- Consumes: `setElementStyle`(Task 2), `ColorPopover`(Task 3), Task 4~5의 패널 구조
- Produces:
  - 요소 모드(단일·다중 공통) `스타일` 섹션 — 채우기 ColorPopover(`채우기 색`/`채우기 없음`), 테두리 두께 select(`테두리 두께`: 없음/1/2/4px), 테두리 스타일 select(`테두리 스타일`: 실선/점선), 테두리 색 ColorPopover(`테두리 색`)
  - 컴포넌트 본문 공용 헬퍼 `applyStyle(patch: Record<string, string | null>)` — 선택 요소 전체에 patch 적용 후 **1회** APPLY_DOC (Task 7이 재사용)
  - border 합성 규칙: `` `${width}px ${style} ${color}` ``, 두께 0 = `border` 키 삭제. 인식 불가 값은 보존 + "사용자 지정" 안내

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/PropertiesPanel.test.tsx`에 픽스처 1개와 테스트를 추가:

```tsx
const DOC_STYLED = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-shape" data-shape="rect" style="left:10px; top:10px; width:50px; height:50px; border:1px solid #000000; box-shadow:0 2px 6px rgba(0,0,0,0.25); opacity:0.5;"></div>
<div class="el el-shape" data-shape="rect" style="left:100px; top:10px; width:50px; height:50px; border:3px double red;"></div>
</section>
</main></body></html>`)

const EL_BORDERED = DOC_STYLED.slides[0]!.elements[0]!.id
const EL_CUSTOM_BORDER = DOC_STYLED.slides[0]!.elements[1]!.id

test('채우기 색 선택은 선택 요소 전체에 1회 커밋으로 적용된다', () => {
  const { dispatch, getByRole } = renderPanel({ selectedIds: [EL_TEXT, EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  fireEvent.click(getByRole('button', { name: '색 #1a56db' }))
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  const doc = applies[0]![0].doc as DeckDoc
  expect(doc.slides[0]!.elements[0]).toMatchObject({ extraStyle: { background: '#1a56db' } })
  expect(doc.slides[0]!.elements[1]).toMatchObject({ extraStyle: { background: '#1a56db' } })
})

test('채우기 없음은 background 키를 제거한다', () => {
  const { dispatch, getByRole } = renderPanel({ selectedIds: [EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  fireEvent.click(getByRole('button', { name: '채우기 없음' }))
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[1]!
  expect(el.type !== 'opaque' && 'background' in el.extraStyle).toBe(false)
})

test('테두리 두께 선택은 기본값으로 border를 합성한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  fireEvent.change(getByLabelText('테두리 두께'), { target: { value: '2' } })
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[1]).toMatchObject({ extraStyle: { border: '2px solid #1f2937' } })
})

test('테두리가 있으면 스타일·색 컨트롤이 보이고 점선 변경이 동작한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ doc: DOC_STYLED, selectedIds: [EL_BORDERED] })
  fireEvent.change(getByLabelText('테두리 스타일'), { target: { value: 'dashed' } })
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[0]).toMatchObject({ extraStyle: { border: '1px dashed #000000' } })
})

test('테두리 없음은 border 키를 제거한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ doc: DOC_STYLED, selectedIds: [EL_BORDERED] })
  fireEvent.change(getByLabelText('테두리 두께'), { target: { value: '0' } })
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  expect(el.type !== 'opaque' && 'border' in el.extraStyle).toBe(false)
})

test('인식할 수 없는 테두리 값은 보존 안내를 보여준다', () => {
  const { getByText } = renderPanel({ doc: DOC_STYLED, selectedIds: [EL_CUSTOM_BORDER] })
  expect(getByText(/사용자 지정/)).toBeTruthy()
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/PropertiesPanel.test.tsx`
Expected: 신규 6개 FAIL

- [ ] **Step 3: 구현**

`editor/src/panels/PropertiesPanel.tsx`:

import 추가:

```ts
import { setElementFrame, setElementStyle, setSlideBg } from '../model/ops.ts'
import { ColorPopover } from './ColorPopover.tsx'
```

모듈 레벨(컴포넌트 밖)에 추가:

```ts
const BORDER_PATTERN = /^(\d+)px (solid|dashed) (\S+)$/

/** '1px solid #000' 형태만 인식 — 그 외 값은 null(사용자 지정 보존) */
function parseBorder(value: string | undefined): { width: number; style: 'solid' | 'dashed'; color: string } | null {
  if (!value) return null
  const m = BORDER_PATTERN.exec(value)
  if (!m) return null
  return { width: Number(m[1]), style: m[2] as 'solid' | 'dashed', color: m[3]! }
}
```

컴포넌트 본문에서 `selectedKnown` 계산 직후(요소 모드 return보다 앞)에 추가:

```tsx
  const first = selectedKnown[0] ?? null
  const applyStyle = (patch: Record<string, string | null>) => {
    let d = doc
    for (const el of selectedKnown) d = setElementStyle(d, slide.id, el.id, patch)
    dispatch({ type: 'APPLY_DOC', doc: d })
  }
  const border = first ? parseBorder(first.extraStyle['border']) : null
```

요소 모드 return의 위치·크기 섹션 아래에 추가 (`first`는 여기서 항상 non-null):

```tsx
      {first && (
        <section aria-label="스타일">
          <div className="prop-row">
            채우기
            <ColorPopover
              label="채우기 색"
              value={first.extraStyle['background']}
              onPick={(c) => applyStyle({ background: c })}
              clearLabel="채우기 없음"
              onClear={() => applyStyle({ background: null })}
            />
          </div>
          <label className="prop-row">
            테두리
            <select
              aria-label="테두리 두께"
              value={border ? String(border.width) : '0'}
              onChange={(e) => {
                const w = Number(e.target.value)
                if (w === 0) applyStyle({ border: null })
                else applyStyle({ border: `${w}px ${border?.style ?? 'solid'} ${border?.color ?? '#1f2937'}` })
              }}
            >
              <option value="0">없음</option>
              <option value="1">1px</option>
              <option value="2">2px</option>
              <option value="4">4px</option>
            </select>
          </label>
          {border && (
            <>
              <label className="prop-row">
                테두리 스타일
                <select
                  aria-label="테두리 스타일"
                  value={border.style}
                  onChange={(e) => applyStyle({ border: `${border.width}px ${e.target.value} ${border.color}` })}
                >
                  <option value="solid">실선</option>
                  <option value="dashed">점선</option>
                </select>
              </label>
              <div className="prop-row">
                테두리 색
                <ColorPopover
                  label="테두리 색"
                  value={border.color}
                  onPick={(c) => applyStyle({ border: `${border.width}px ${border.style} ${c}` })}
                />
              </div>
            </>
          )}
          {first.extraStyle['border'] !== undefined && !border && (
            <p className="prop-note">테두리: 사용자 지정 값 보존됨</p>
          )}
        </section>
      )}
```

주의: 테두리 두께 select의 표시값은 첫 번째 선택 요소 기준이다(다중 선택 시 혼합 값은 표시하지 않음 — 스펙 §3.1과 동일한 단순화).

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/PropertiesPanel.test.tsx && npm run typecheck`
Expected: PASS

```bash
git add editor/src/panels/PropertiesPanel.tsx editor/src/panels/PropertiesPanel.test.tsx
git commit -m "feat: 속성 패널 채우기·테두리 — 선택 요소 일괄 적용, 사용자 지정 값 보존"
```

---

### Task 7: 속성 패널 — 그림자·투명도

**Files:**
- Modify: `editor/src/panels/PropertiesPanel.tsx`
- Test: `editor/src/panels/PropertiesPanel.test.tsx` (추가)

**Interfaces:**
- Consumes: Task 6의 `applyStyle`, `first`, DOC_STYLED 픽스처
- Produces: 스타일 섹션에 그림자 버튼 3종(`그림자 없음`/`그림자 약하게`/`그림자 강하게`)과 투명도 슬라이더(`투명도`, 0~100%). 그림자 프리셋 값: 약하게 `0 2px 6px rgba(0,0,0,0.25)`, 강하게 `0 6px 16px rgba(0,0,0,0.35)`. 투명도 t% → `opacity: String(Math.round((1 - t / 100) * 100) / 100)`, 0%는 키 제거

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/PropertiesPanel.test.tsx`에 추가:

```tsx
test('그림자 약하게는 box-shadow를 설정한다', () => {
  const { dispatch, getByRole } = renderPanel({ selectedIds: [EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '그림자 약하게' }))
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[1]).toMatchObject({ extraStyle: { 'box-shadow': '0 2px 6px rgba(0,0,0,0.25)' } })
})

test('그림자 없음은 box-shadow 키를 제거한다', () => {
  const { dispatch, getByRole } = renderPanel({ doc: DOC_STYLED, selectedIds: [EL_BORDERED] })
  fireEvent.click(getByRole('button', { name: '그림자 없음' }))
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  expect(el.type !== 'opaque' && 'box-shadow' in el.extraStyle).toBe(false)
})

test('투명도 슬라이더는 조작 중 커밋하지 않고 pointerup에 1회 커밋한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ selectedIds: [EL_SHAPE] })
  const range = getByLabelText('투명도')
  fireEvent.change(range, { target: { value: '30' } })
  fireEvent.change(range, { target: { value: '40' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.pointerUp(range)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.elements[1]).toMatchObject({ extraStyle: { opacity: '0.6' } })
})

test('투명도 0%는 opacity 키를 제거한다', () => {
  const { dispatch, getByLabelText } = renderPanel({ doc: DOC_STYLED, selectedIds: [EL_BORDERED] })
  const range = getByLabelText('투명도')
  fireEvent.change(range, { target: { value: '0' } })
  fireEvent.pointerUp(range)
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  expect(el.type !== 'opaque' && 'opacity' in el.extraStyle).toBe(false)
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/PropertiesPanel.test.tsx`
Expected: 신규 4개 FAIL

- [ ] **Step 3: 구현**

`editor/src/panels/PropertiesPanel.tsx`:

모듈 레벨에 추가:

```ts
const SHADOW_SOFT = '0 2px 6px rgba(0,0,0,0.25)'
const SHADOW_STRONG = '0 6px 16px rgba(0,0,0,0.35)'
```

컴포넌트 상단 state에 추가 (bgDraft 옆):

```ts
  /** 투명도 슬라이더 조작 중 임시값 — pointerup/blur에서 1회 커밋 */
  const [opacityDraft, setOpacityDraft] = useState<string | null>(null)
```

본문(applyStyle 아래)에 추가:

```tsx
  const opacityShown = opacityDraft ?? (first ? String(Math.round((1 - Number(first.extraStyle['opacity'] ?? '1')) * 100)) : '0')
  const commitOpacity = () => {
    if (opacityDraft === null) return
    const t = Math.max(0, Math.min(100, Number(opacityDraft)))
    setOpacityDraft(null)
    if (!Number.isFinite(t)) return
    applyStyle({ opacity: t === 0 ? null : String(Math.round((1 - t / 100) * 100) / 100) })
  }
```

스타일 섹션(Task 6) 안, 사용자 지정 안내 아래에 추가:

```tsx
          <div className="prop-row">
            그림자
            <span className="btn-row">
              <button type="button" aria-label="그림자 없음" onClick={() => applyStyle({ 'box-shadow': null })}>없음</button>
              <button type="button" aria-label="그림자 약하게" onClick={() => applyStyle({ 'box-shadow': SHADOW_SOFT })}>약하게</button>
              <button type="button" aria-label="그림자 강하게" onClick={() => applyStyle({ 'box-shadow': SHADOW_STRONG })}>강하게</button>
            </span>
          </div>
          <label className="prop-row">
            투명도
            <input
              type="range"
              aria-label="투명도"
              min="0"
              max="100"
              value={opacityShown}
              onChange={(e) => setOpacityDraft(e.target.value)}
              onPointerUp={commitOpacity}
              onBlur={commitOpacity}
            />
            <span className="opacity-value">{opacityShown}%</span>
          </label>
```

`editor/src/app.css`에 추가:

```css
.btn-row { display: inline-flex; gap: 2px; }
.btn-row button, .props section button { font: inherit; font-size: 12px; padding: 3px 7px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; cursor: pointer; }
.opacity-value { font-size: 12px; color: #6b7280; width: 34px; text-align: right; }
.prop-row input[type='range'] { flex: 1; min-width: 0; }
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/PropertiesPanel.test.tsx && npm test && npm run typecheck`
Expected: PASS

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck && git add editor/src/panels/PropertiesPanel.tsx editor/src/panels/PropertiesPanel.test.tsx editor/src/app.css
git commit -m "feat: 속성 패널 그림자·투명도 — 프리셋 그림자, 드래프트 커밋 슬라이더"
```

---

### Task 8: 텍스트 도구 포커스 인프라 — 셀렉션 저장/복원 + blur 가드

**Files:**
- Modify: `editor/src/panels/format.ts`
- Modify: `editor/src/canvas/TextEditable.tsx`
- Test: `editor/src/panels/format.test.ts` (추가), `editor/src/canvas/TextEditable.test.tsx` (추가 — 파일이 없으면 신규 생성)

**Interfaces:**
- Consumes: 기존 `TextEditable`(blur 커밋), format.ts
- Produces (Task 9~11, ColorPopover 사용처가 의존):
  - `saveSelection(): void` / `restoreSelection(): void` — 편집 셀렉션 Range 보관/복원 (모듈 로컬 변수)
  - `focusEditable(): void` — `document.querySelector('.text-editable')` 포커스 (편집 요소는 동시에 1개)
  - **계약**: `data-text-tool` 속성을 가진 요소로 포커스가 이동하는 blur는 TextEditable이 커밋하지 않는다 (편집 세션 유지). 도구 쪽은 blur 시 포커스가 도구/에디터블 밖으로 나가면 편집을 종료할 책임을 진다 (Task 9의 `commitEditingFromTool`)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/format.test.ts`에 추가:

```ts
describe('셀렉션 저장/복원', () => {
  test('셀렉션이 없어도 안전하다', () => {
    window.getSelection()?.removeAllRanges()
    expect(() => {
      saveSelection()
      restoreSelection()
    }).not.toThrow()
  })

  test('저장한 Range를 복원한다', () => {
    const div = document.createElement('div')
    div.textContent = '안녕하세요'
    document.body.appendChild(div)
    const range = document.createRange()
    range.selectNodeContents(div)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    saveSelection()
    sel.removeAllRanges()
    expect(sel.rangeCount).toBe(0)
    restoreSelection()
    expect(window.getSelection()!.rangeCount).toBe(1)
    div.remove()
  })
})

test('focusEditable은 .text-editable에 포커스를 준다', () => {
  const div = document.createElement('div')
  div.className = 'text-editable'
  div.tabIndex = -1
  document.body.appendChild(div)
  focusEditable()
  expect(document.activeElement).toBe(div)
  div.remove()
})
```

import에 `focusEditable, restoreSelection, saveSelection` 추가.

`editor/src/canvas/TextEditable.test.tsx`에 추가 (파일이 없으면 render/vi import 포함 신규 작성):

```tsx
test('data-text-tool 요소로의 blur는 커밋하지 않는다', () => {
  const onCommit = vi.fn()
  const { container } = render(<TextEditable html="<p>a</p>" onCommit={onCommit} />)
  const tool = document.createElement('input')
  tool.setAttribute('data-text-tool', '1')
  document.body.appendChild(tool)
  fireEvent.blur(container.querySelector('.text-editable')!, { relatedTarget: tool })
  expect(onCommit).not.toHaveBeenCalled()
  tool.remove()
})

test('일반 blur는 커밋한다', () => {
  const onCommit = vi.fn()
  const { container } = render(<TextEditable html="<p>a</p>" onCommit={onCommit} />)
  fireEvent.blur(container.querySelector('.text-editable')!)
  expect(onCommit).toHaveBeenCalledWith('<p>a</p>')
})
```

(동일한 '일반 blur 커밋' 테스트가 기존에 이미 있으면 그 테스트는 중복 추가하지 않는다.)

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/format.test.ts src/canvas/TextEditable.test.tsx`
Expected: FAIL — export 없음 / 가드 없어서 data-text-tool blur에도 커밋

- [ ] **Step 3: 구현**

`editor/src/panels/format.ts` 끝에 추가:

```ts
// ---------- 텍스트 도구 포커스 인프라 ----------
// 포커스를 받는 텍스트 도구(input/select)는 contentEditable의 셀렉션을 잃는다.
// 도구 포커스 직전에 저장(saveSelection)하고, execCommand 직전에 복원(restoreSelection)한다.

let savedRange: Range | null = null

export function saveSelection(): void {
  const sel = window.getSelection?.()
  savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
}

export function restoreSelection(): void {
  if (!savedRange) return
  const sel = window.getSelection?.()
  if (!sel) return
  sel.removeAllRanges()
  sel.addRange(savedRange)
}

/** 편집 중인 텍스트 상자로 포커스를 되돌린다 — 편집 요소는 동시에 1개뿐 */
export function focusEditable(): void {
  document.querySelector<HTMLElement>('.text-editable')?.focus()
}
```

`editor/src/canvas/TextEditable.tsx`의 `onBlur={commit}`을 다음으로 교체:

```tsx
      onBlur={(e) => {
        // 텍스트 도구(크기 입력·hex·드롭다운)로의 포커스 이동은 편집 세션 유지 — 도구가 종료를 책임진다
        if ((e.relatedTarget as HTMLElement | null)?.closest?.('[data-text-tool]')) return
        commit()
      }}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/format.test.ts src/canvas/TextEditable.test.tsx && npm test && npm run typecheck`
Expected: PASS

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck && git add editor/src/panels/format.ts editor/src/panels/format.test.ts editor/src/canvas/TextEditable.tsx editor/src/canvas/TextEditable.test.tsx
git commit -m "feat: 텍스트 도구 포커스 인프라 — 셀렉션 저장/복원, data-text-tool blur 가드"
```

---

### Task 9: 툴바 — 폰트 선택 + 글자 크기 자유 입력

**Files:**
- Modify: `editor/src/panels/format.ts`
- Modify: `editor/src/panels/Toolbar.tsx`
- Modify: `editor/src/app.css`
- Test: `editor/src/panels/format.test.ts`, `editor/src/panels/Toolbar.test.tsx` (추가)

**Interfaces:**
- Consumes: Task 8의 `saveSelection`/`restoreSelection`/`focusEditable`, 기존 `execFontSize`, `setTextHtml`(ops.ts)
- Produces:
  - format.ts: `FONT_FAMILIES: { label: string; stack: string }[]`(5종), `MIN_FONT_SIZE = 8`, `MAX_FONT_SIZE = 120`, `clampFontSize(n: number): number`, `execFontName(stack: string): void`
  - Toolbar: `폰트` select, `글자 크기` 입력(Enter 적용), `글자 크기 프리셋` select — 기존 크기 버튼 6개 대체
  - Toolbar 내부 `commitEditingFromTool(e)` — 텍스트 도구 blur 시 포커스가 도구/에디터블 밖이면 편집 커밋+종료 (Task 10, 11의 도구들도 재사용)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/format.test.ts`에 추가:

```ts
describe('폰트·크기 유틸', () => {
  test('FONT_FAMILIES는 5종이고 스택에 폴백을 포함한다', () => {
    expect(FONT_FAMILIES).toHaveLength(5)
    expect(FONT_FAMILIES[0]!.stack).toContain('Malgun Gothic')
  })

  test('clampFontSize는 8~120으로 클램프하고 반올림한다', () => {
    expect(clampFontSize(200)).toBe(120)
    expect(clampFontSize(2)).toBe(8)
    expect(clampFontSize(17.4)).toBe(17)
  })

  test('execFontName은 styleWithCSS로 감싸 fontName을 실행한다', () => {
    const spy = vi.fn()
    ;(document as unknown as { execCommand: unknown }).execCommand = spy
    execFontName('"Dotum", sans-serif')
    expect(spy.mock.calls).toEqual([
      ['styleWithCSS', false, 'true'],
      ['fontName', false, '"Dotum", sans-serif'],
      ['styleWithCSS', false, 'false'],
    ])
  })
})
```

`editor/src/panels/Toolbar.test.tsx`에 추가:

```tsx
test('편집 중 폰트 선택은 fontName execCommand를 호출한다', () => {
  const { getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.change(getByLabelText('폰트'), { target: { value: FONT_FAMILIES[0]!.stack } })
  expect(document.execCommand).toHaveBeenCalledWith('fontName', false, FONT_FAMILIES[0]!.stack)
})

test('크기 입력 + Enter는 fontSize 우회를 실행한다', () => {
  const { getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  const input = getByLabelText('글자 크기')
  fireEvent.change(input, { target: { value: '30' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(document.execCommand).toHaveBeenCalledWith('fontSize', false, '7')
})

test('크기 프리셋 선택도 fontSize를 실행한다', () => {
  const { getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.change(getByLabelText('글자 크기 프리셋'), { target: { value: '28' } })
  expect(document.execCommand).toHaveBeenCalledWith('fontSize', false, '7')
})

test('텍스트 도구에서 편집 밖으로 blur하면 편집을 커밋하고 종료한다', () => {
  const editable = document.createElement('div')
  editable.className = 'text-editable'
  editable.innerHTML = '<p>수정됨</p>'
  document.body.appendChild(editable)
  const { dispatch, getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.blur(getByLabelText('글자 크기'))
  expect(dispatch).toHaveBeenCalledWith({ type: 'END_TEXT_EDIT' })
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  editable.remove()
})

test('다른 텍스트 도구로의 blur는 편집을 유지한다', () => {
  const tool = document.createElement('input')
  tool.setAttribute('data-text-tool', '1')
  document.body.appendChild(tool)
  const { dispatch, getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.blur(getByLabelText('글자 크기'), { relatedTarget: tool })
  expect(dispatch).not.toHaveBeenCalled()
  tool.remove()
})
```

import에 `FONT_FAMILIES` 추가 (`./format.ts`).

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/format.test.ts src/panels/Toolbar.test.tsx`
Expected: 신규 테스트 FAIL

- [ ] **Step 3: format.ts 구현**

`editor/src/panels/format.ts`에 추가:

```ts
export interface FontOption {
  label: string
  stack: string
}

/** 시스템 폰트 스택 큐레이션 — self-contained 제약상 웹폰트 임베딩 없이 폴백 체인으로 */
export const FONT_FAMILIES: FontOption[] = [
  { label: '기본 고딕', stack: '"Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif' },
  { label: '나눔고딕', stack: '"NanumGothic", "나눔고딕", "Malgun Gothic", sans-serif' },
  { label: '명조', stack: '"NanumMyeongjo", "나눔명조", "Batang", "바탕", serif' },
  { label: '돋움', stack: '"Dotum", "돋움", "Gulim", "굴림", sans-serif' },
  { label: '고정폭', stack: '"D2Coding", "Consolas", "Courier New", monospace' },
]

export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 120

export function clampFontSize(n: number): number {
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(n)))
}

export function execFontName(stack: string): void {
  document.execCommand?.('styleWithCSS', false, 'true')
  document.execCommand?.('fontName', false, stack)
  document.execCommand?.('styleWithCSS', false, 'false')
}
```

- [ ] **Step 4: Toolbar 구현**

`editor/src/panels/Toolbar.tsx`:

import 갱신:

```ts
import { useState } from 'react'
import type { Dispatch, FocusEvent, PointerEvent as ReactPointerEvent } from 'react'
import { setTextHtml } from '../model/ops.ts'  // 기존 ops import 줄에 추가
import {
  FONT_FAMILIES, FONT_SIZES, TEXT_COLORS, clampFontSize, execColor, execFontName, execFontSize, execFormat,
  focusEditable, restoreSelection, saveSelection,
} from './format.ts'
```

컴포넌트 본문에 추가:

```tsx
  const [sizeDraft, setSizeDraft] = useState('')

  /** 텍스트 도구 blur 폴백 — 포커스가 도구/에디터블 밖으로 나가면 편집을 정상 종료한다 */
  const commitEditingFromTool = (e: FocusEvent<HTMLElement>) => {
    const next = e.relatedTarget as HTMLElement | null
    if (next?.closest?.('[data-text-tool], .text-editable')) return
    const node = document.querySelector<HTMLElement>('.text-editable')
    if (!node || !doc || !slide || editingTextId === null) return
    const el = slide.elements.filter(isKnownElement).find((k) => k.id === editingTextId)
    if (el?.type === 'text' && el.html !== node.innerHTML) {
      dispatch({ type: 'APPLY_DOC', doc: setTextHtml(doc, slide.id, editingTextId, node.innerHTML) })
    }
    dispatch({ type: 'END_TEXT_EDIT' })
  }

  const applyFontSize = () => {
    const n = Number(sizeDraft)
    if (sizeDraft.trim() === '' || !Number.isFinite(n)) return
    restoreSelection()
    execFontSize(clampFontSize(n))
    focusEditable()
    setSizeDraft('')
  }
```

텍스트 서식 group에서 `{FONT_SIZES.map((px) => (…버튼…))}` 블록을 삭제하고, group 맨 앞(굵게 버튼 앞)에 추가:

```tsx
        <select
          aria-label="폰트"
          data-text-tool="1"
          disabled={!editing}
          value=""
          onFocus={saveSelection}
          onBlur={commitEditingFromTool}
          onChange={(e) => {
            if (!e.target.value) return
            restoreSelection()
            execFontName(e.target.value)
            focusEditable()
          }}
        >
          <option value="" disabled>폰트</option>
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.stack}>{f.label}</option>
          ))}
        </select>
        <input
          className="size-input"
          aria-label="글자 크기"
          data-text-tool="1"
          placeholder="크기"
          inputMode="numeric"
          disabled={!editing}
          value={sizeDraft}
          onFocus={saveSelection}
          onBlur={(e) => {
            setSizeDraft('')
            commitEditingFromTool(e)
          }}
          onChange={(e) => setSizeDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applyFontSize()
            }
          }}
        />
        <select
          aria-label="글자 크기 프리셋"
          data-text-tool="1"
          disabled={!editing}
          value=""
          onFocus={saveSelection}
          onBlur={commitEditingFromTool}
          onChange={(e) => {
            const px = Number(e.target.value)
            if (!px) return
            restoreSelection()
            execFontSize(px)
            focusEditable()
          }}
        >
          <option value="" disabled>크기</option>
          {FONT_SIZES.map((px) => (
            <option key={px} value={px}>{px}px</option>
          ))}
        </select>
```

`editor/src/app.css`에 추가:

```css
.toolbar select { font: inherit; font-size: 13px; padding: 3px 4px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; }
.size-input { width: 52px; font: inherit; font-size: 13px; padding: 3px 6px; border: 1px solid #d1d5db; border-radius: 4px; }
```

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/format.test.ts src/panels/Toolbar.test.tsx && npm test && npm run typecheck`
Expected: PASS

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck && git add editor/src/panels/format.ts editor/src/panels/format.test.ts editor/src/panels/Toolbar.tsx editor/src/panels/Toolbar.test.tsx editor/src/app.css
git commit -m "feat: 폰트 선택과 글자 크기 자유 입력 — 셀렉션 복원 기반 텍스트 도구"
```

---

### Task 10: 툴바 — 글자색 팝오버 + 글머리/번호 목록

**Files:**
- Modify: `editor/src/panels/format.ts` (`execList` 추가, `TEXT_COLORS` 제거)
- Modify: `editor/src/panels/Toolbar.tsx`
- Modify: `editor/src/app.css` (목록 여백)
- Test: `editor/src/panels/format.test.ts`, `editor/src/panels/Toolbar.test.tsx`

**Interfaces:**
- Consumes: `ColorPopover`(Task 3, textTool 모드), Task 8 인프라, Task 9의 `commitEditingFromTool`
- Produces: format.ts `execList(kind: 'ul' | 'ol'): void`. 툴바에서 기존 글자색 스와치 6종은 `글자색` ColorPopover로 대체(스와치 12 + hex). `TEXT_COLORS`는 사용처가 없어지므로 format.ts에서 삭제

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/format.test.ts`에 추가:

```ts
test('execList는 목록 execCommand를 호출한다', () => {
  const spy = vi.fn()
  ;(document as unknown as { execCommand: unknown }).execCommand = spy
  execList('ul')
  expect(spy).toHaveBeenCalledWith('insertUnorderedList')
  execList('ol')
  expect(spy).toHaveBeenCalledWith('insertOrderedList')
})
```

`editor/src/panels/Toolbar.test.tsx` — 기존 글자색 스와치 테스트(TEXT_COLORS 기반, 테스트 이름에 '글자색' 포함)를 삭제하고 다음으로 대체:

```tsx
test('글자색 팝오버에서 스와치 선택은 foreColor를 실행한다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.click(getByRole('button', { name: '글자색' }))
  fireEvent.click(getByRole('button', { name: `색 ${PALETTE[0]}` }))
  expect(document.execCommand).toHaveBeenCalledWith('foreColor', false, PALETTE[0])
})

test('글자색 hex 적용은 입력한 색으로 foreColor를 실행한다', () => {
  const { getByRole, getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.click(getByRole('button', { name: '글자색' }))
  fireEvent.change(getByLabelText('글자색 hex'), { target: { value: '#ff8800' } })
  fireEvent.keyDown(getByLabelText('글자색 hex'), { key: 'Enter' })
  expect(document.execCommand).toHaveBeenCalledWith('foreColor', false, '#ff8800')
})

test('목록 버튼은 목록 execCommand를 실행한다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.click(getByRole('button', { name: '글머리 기호' }))
  expect(document.execCommand).toHaveBeenCalledWith('insertUnorderedList')
  fireEvent.click(getByRole('button', { name: '번호 매기기' }))
  expect(document.execCommand).toHaveBeenCalledWith('insertOrderedList')
})
```

import에 `PALETTE`(`./ColorPopover.tsx`) 추가.

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/format.test.ts src/panels/Toolbar.test.tsx`
Expected: 신규 테스트 FAIL

- [ ] **Step 3: 구현**

`editor/src/panels/format.ts`:
- `TEXT_COLORS` export 삭제 (format.test.ts에 TEXT_COLORS 단언이 있으면 함께 삭제)
- 추가:

```ts
export function execList(kind: 'ul' | 'ol'): void {
  document.execCommand?.(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList')
}
```

`editor/src/panels/Toolbar.tsx`:
- import 갱신: `TEXT_COLORS` 제거, `execList` 추가, `import { ColorPopover } from './ColorPopover.tsx'` 추가
- 텍스트 서식 group에서 `{TEXT_COLORS.map(...)}` 스와치 블록을 다음으로 교체:

```tsx
        <ColorPopover
          label="글자색"
          disabled={!editing}
          textTool
          onActivate={saveSelection}
          onHexBlur={commitEditingFromTool}
          onPick={(c) => {
            restoreSelection()
            execColor(c)
            focusEditable()
          }}
        />
        <button type="button" aria-label="글머리 기호" title="글머리 기호" disabled={!editing} onPointerDown={keepFocus} onClick={() => execList('ul')}>••</button>
        <button type="button" aria-label="번호 매기기" title="번호 매기기" disabled={!editing} onPointerDown={keepFocus} onClick={() => execList('ol')}>1.</button>
```

`editor/src/app.css`에 추가 (목록이 에디터·문서 양쪽에서 같은 여백을 갖도록):

```css
.slide-view .el-text ul, .slide-view .el-text ol, .text-editable ul, .text-editable ol { margin: 0; padding-left: 1.2em; }
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/format.test.ts src/panels/Toolbar.test.tsx && npm test && npm run typecheck`
Expected: PASS

```bash
git add editor/src/panels/format.ts editor/src/panels/format.test.ts editor/src/panels/Toolbar.tsx editor/src/panels/Toolbar.test.tsx editor/src/app.css
git commit -m "feat: 글자색 팝오버(스와치12+hex)와 글머리/번호 목록"
```

---

### Task 11: 줄 간격

**Files:**
- Modify: `editor/src/panels/format.ts`
- Modify: `editor/src/panels/Toolbar.tsx`
- Test: `editor/src/panels/format.test.ts`, `editor/src/panels/Toolbar.test.tsx`

**Interfaces:**
- Consumes: Task 8 인프라, Task 9의 `commitEditingFromTool`
- Produces: format.ts `LINE_HEIGHTS = [1, 1.15, 1.5, 2]`, `setLineHeight(value: number): void` — 셀렉션이 걸친 `p`/`li` 블록의 `style.lineHeight` 설정 (편집 영역 밖 셀렉션은 no-op). 툴바 `줄 간격` select

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/format.test.ts`에 추가:

```ts
describe('setLineHeight', () => {
  test('캐럿이 있는 문단에만 line-height를 적용한다', () => {
    const editable = document.createElement('div')
    editable.className = 'text-editable'
    editable.innerHTML = '<p>하나</p><p>둘</p>'
    document.body.appendChild(editable)
    const first = editable.querySelector('p')!
    const range = document.createRange()
    range.selectNodeContents(first)
    range.collapse(true)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    setLineHeight(1.5)
    expect((first as HTMLElement).style.lineHeight).toBe('1.5')
    const second = editable.querySelectorAll('p')[1] as HTMLElement
    expect(second.style.lineHeight).toBe('')
    editable.remove()
  })

  test('편집 영역 밖 셀렉션이면 아무것도 하지 않는다', () => {
    const div = document.createElement('div')
    div.innerHTML = '<p>외부</p>'
    document.body.appendChild(div)
    const p = div.querySelector('p')!
    const range = document.createRange()
    range.selectNodeContents(p)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    expect(() => setLineHeight(2)).not.toThrow()
    expect((p as HTMLElement).style.lineHeight).toBe('')
    div.remove()
  })

  test('셀렉션이 없으면 no-op이다', () => {
    window.getSelection()?.removeAllRanges()
    expect(() => setLineHeight(1.15)).not.toThrow()
  })
})
```

`editor/src/panels/Toolbar.test.tsx`에 추가:

```tsx
test('줄 간격 선택은 셀렉션이 걸친 문단에 적용된다', () => {
  const editable = document.createElement('div')
  editable.className = 'text-editable'
  editable.innerHTML = '<p>하나</p>'
  document.body.appendChild(editable)
  const p = editable.querySelector('p')!
  const range = document.createRange()
  range.selectNodeContents(p)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  const { getByLabelText } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.change(getByLabelText('줄 간격'), { target: { value: '1.5' } })
  expect((p as HTMLElement).style.lineHeight).toBe('1.5')
  editable.remove()
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/format.test.ts src/panels/Toolbar.test.tsx`
Expected: 신규 테스트 FAIL

- [ ] **Step 3: 구현**

`editor/src/panels/format.ts`에 추가:

```ts
export const LINE_HEIGHTS = [1, 1.15, 1.5, 2]

/** 셀렉션이 걸친 문단(p/li)에 line-height 지정 — execCommand에 없는 기능이라 직접 처리 */
export function setLineHeight(value: number): void {
  const sel = window.getSelection?.()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  const anchor = range.commonAncestorContainer
  const anchorEl = anchor instanceof Element ? anchor : anchor.parentElement
  const editable = anchorEl?.closest('.text-editable')
  if (!editable) return
  const blocks = Array.from(editable.querySelectorAll<HTMLElement>('p, li'))
  // happy-dom 등 intersectsNode 미구현 환경은 포함 관계로 폴백
  const intersects = (b: HTMLElement) =>
    typeof range.intersectsNode === 'function' ? range.intersectsNode(b) : b.contains(anchor) || b === anchorEl
  for (const b of blocks.filter(intersects)) b.style.lineHeight = String(value)
}
```

`editor/src/panels/Toolbar.tsx` — 텍스트 서식 group의 목록 버튼 뒤에 추가 (import에 `LINE_HEIGHTS`, `setLineHeight` 추가):

```tsx
        <select
          aria-label="줄 간격"
          data-text-tool="1"
          disabled={!editing}
          value=""
          onFocus={saveSelection}
          onBlur={commitEditingFromTool}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (!v) return
            restoreSelection()
            setLineHeight(v)
            focusEditable()
          }}
        >
          <option value="" disabled>줄간격</option>
          {LINE_HEIGHTS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/format.test.ts src/panels/Toolbar.test.tsx && npm test && npm run typecheck`
Expected: PASS

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck && git add editor/src/panels/format.ts editor/src/panels/format.test.ts editor/src/panels/Toolbar.tsx editor/src/panels/Toolbar.test.tsx
git commit -m "feat: 줄 간격 — 셀렉션 문단 단위 line-height"
```

---

### Task 12: 툴바 — 텍스트 세로 정렬 + 간격 균등 분배

**Files:**
- Modify: `editor/src/panels/Toolbar.tsx`
- Test: `editor/src/panels/Toolbar.test.tsx`

**Interfaces:**
- Consumes: `setElementStyle`(Task 2), `distributeFrames`(Task 1), `setElementFrame`(기존)
- Produces: 개체 정렬 group에 `텍스트 위`/`텍스트 중간`/`텍스트 아래`(선택에 텍스트 요소가 있을 때 활성 — 편집 모드 불필요, 박스 스타일이므로 요소 선택만으로 적용), `가로 분배`/`세로 분배`(3개 이상 선택 시 활성) 버튼

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/Toolbar.test.tsx`에 추가:

```tsx
const DOC3 = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:100px; height:50px;"></div>
<div class="el el-shape" data-shape="rect" style="left:120px; top:0px; width:100px; height:50px;"></div>
<div class="el el-shape" data-shape="rect" style="left:500px; top:0px; width:100px; height:50px;"></div>
</section>
</main></body></html>`)

test('텍스트 중간 정렬은 텍스트 요소에만 flex 스타일을 적용한다', () => {
  const { dispatch, getByRole } = renderToolbar({ selectedIds: [EL_TEXT, EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '텍스트 중간' }))
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[0]).toMatchObject({
    extraStyle: { display: 'flex', 'flex-direction': 'column', 'justify-content': 'center' },
  })
  const shape = doc.slides[0]!.elements[1]!
  expect(shape.type !== 'opaque' && 'display' in shape.extraStyle).toBe(false)
})

test('텍스트 선택이 없으면 세로 정렬 버튼은 비활성이다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_SHAPE] })
  expect((getByRole('button', { name: '텍스트 위' }) as HTMLButtonElement).disabled).toBe(true)
})

test('가로 분배는 3개 이상 선택에서 간격을 균등화하고 1회 커밋한다', () => {
  const ids = DOC3.slides[0]!.elements.map((e) => e.id)
  const { dispatch, getByRole } = renderToolbar({ doc: DOC3, selectedIds: ids })
  fireEvent.click(getByRole('button', { name: '가로 분배' }))
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.elements[1]).toMatchObject({ frame: { left: 250 } })
})

test('2개 선택이면 분배 버튼이 비활성이다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_TEXT, EL_SHAPE] })
  expect((getByRole('button', { name: '가로 분배' }) as HTMLButtonElement).disabled).toBe(true)
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/Toolbar.test.tsx`
Expected: 신규 4개 FAIL

- [ ] **Step 3: 구현**

`editor/src/panels/Toolbar.tsx`:

import에 추가: `distributeFrames`(`../canvas/geometry.ts`), `setElementStyle`(ops import 줄)

본문 파생값 추가 (`editing` 아래):

```tsx
  const selectedKnown = slide?.elements.filter(isKnownElement).filter((el) => selectedIds.includes(el.id)) ?? []
  const hasTextSelection = selectedKnown.some((el) => el.type === 'text')
```

함수 추가:

```tsx
  const verticalAlign = (justify: 'flex-start' | 'center' | 'flex-end') => {
    if (!doc || !slide) return
    let d = doc
    for (const el of selectedKnown) {
      if (el.type === 'text') {
        d = setElementStyle(d, slide.id, el.id, {
          display: 'flex',
          'flex-direction': 'column',
          'justify-content': justify,
        })
      }
    }
    if (d !== doc) dispatch({ type: 'APPLY_DOC', doc: d })
  }

  const distribute = (axis: 'x' | 'y') => {
    if (!doc || !slide || selectedKnown.length < 3) return
    const frames = distributeFrames(selectedKnown.map((el) => el.frame), axis)
    let d = doc
    selectedKnown.forEach((el, i) => {
      d = setElementFrame(d, slide.id, el.id, frames[i]!)
    })
    dispatch({ type: 'APPLY_DOC', doc: d })
  }
```

개체 정렬 group의 기존 6버튼 뒤에 추가:

```tsx
        <button type="button" disabled={!hasTextSelection} onClick={() => verticalAlign('flex-start')}>텍스트 위</button>
        <button type="button" disabled={!hasTextSelection} onClick={() => verticalAlign('center')}>텍스트 중간</button>
        <button type="button" disabled={!hasTextSelection} onClick={() => verticalAlign('flex-end')}>텍스트 아래</button>
        <button type="button" disabled={selectedKnown.length < 3} onClick={() => distribute('x')}>가로 분배</button>
        <button type="button" disabled={selectedKnown.length < 3} onClick={() => distribute('y')}>세로 분배</button>
```

기존 `alignSelected`도 새 `selectedKnown` 파생값을 쓰도록 정리해도 좋다(동작 동일 — 선택 사항, 하지 않아도 무방).

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/panels/Toolbar.test.tsx && npm test && npm run typecheck`
Expected: PASS

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck && git add editor/src/panels/Toolbar.tsx editor/src/panels/Toolbar.test.tsx
git commit -m "feat: 텍스트 세로 정렬과 간격 균등 분배"
```

---

### Task 13: 캔버스 — Shift 비율 리사이즈 + 리사이즈 스냅

**Files:**
- Modify: `editor/src/canvas/CanvasArea.tsx`
- Test: `editor/src/canvas/CanvasArea.test.tsx` (추가)

**Interfaces:**
- Consumes: `resizeFrame(lockAspect)`, `snapResize`, `buildSnapTargets`(Task 1)
- Produces: 리사이즈 제스처가 (a) Shift+모서리 핸들이면 종횡비 고정(스냅 생략 — 규칙 충돌 회피), (b) 그 외에는 움직이는 변을 스냅 대상에 흡착하고 가이드 표시. `ResizeGesture`에 `guides: Guide[]` 필드 추가

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/CanvasArea.test.tsx`에 추가:

```tsx
test('Shift+모서리 리사이즈는 종횡비를 유지한다', () => {
  const { dispatch, container } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(container.querySelector('.handle-se')!, { clientX: 380, clientY: 380 })
  fireEvent.pointerMove(window, { clientX: 480, clientY: 400, shiftKey: true })
  fireEvent.pointerUp(window)
  const doc = appliedDoc(dispatch)!
  // 80×80에서 dx 100, dy 20 → 폭 변화 우세 → 180×180 (비율 1:1)
  expect(doc.slides[0]!.elements[1]!).toMatchObject({ frame: { left: 300, top: 300, width: 180, height: 180 } })
})

test('리사이즈 중 움직이는 변이 스냅 대상에 흡착된다', () => {
  const { dispatch, container } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(container.querySelector('.handle-e')!, { clientX: 380, clientY: 340 })
  // dx 256 → 오른쪽 변 636, 슬라이드 중앙 640까지 4px(임계 6 이내) → 흡착
  fireEvent.pointerMove(window, { clientX: 636, clientY: 340 })
  fireEvent.pointerUp(window)
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[1]!).toMatchObject({ frame: { width: 340 } })
})

test('리사이즈 스냅 중 가이드 라인이 표시된다', () => {
  const { container } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(container.querySelector('.handle-e')!, { clientX: 380, clientY: 340 })
  fireEvent.pointerMove(window, { clientX: 636, clientY: 340 })
  expect(container.querySelector('.snap-guide-x')).toBeTruthy()
  fireEvent.pointerUp(window)
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/canvas/CanvasArea.test.tsx`
Expected: 신규 3개 FAIL (비율 미고정·스냅 없음·가이드 없음)

- [ ] **Step 3: 구현**

`editor/src/canvas/CanvasArea.tsx`:

- import 갱신: `import { buildSnapTargets, resizeFrame, snapMove, snapResize } from './geometry.ts'`
- `ResizeGesture`에 필드 추가:

```ts
interface ResizeGesture {
  kind: 'resize'
  slideId: string
  id: string
  frame: Frame
  guides: Guide[]
  resized: boolean
}
```

- `beginResize`를 다음으로 교체:

```tsx
  const beginResize = (e: ReactPointerEvent, handle: ResizeHandle) => {
    e.stopPropagation()
    e.preventDefault()
    const known = slide.elements.filter(isKnownElement)
    const el = known.find((k) => k.id === selectedIds[0])
    if (!el) return
    const startX = e.clientX
    const startY = e.clientY
    const orig = el.frame
    const targets = buildSnapTargets(
      doc.slideWidth,
      doc.slideHeight,
      known.filter((k) => k.id !== el.id).map((k) => k.frame),
    )
    const docAtStart = doc
    const g: ResizeGesture = { kind: 'resize', slideId: slide.id, id: el.id, frame: orig, guides: [], resized: false }
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scaleRef.current
      const dy = (ev.clientY - startY) / scaleRef.current
      // Shift+모서리 = 비율 고정(스냅 생략 — 두 보정의 충돌 회피), 그 외 = 리사이즈 스냅
      if (ev.shiftKey && handle.length === 2) {
        g.frame = resizeFrame(orig, handle, dx, dy, true)
        g.guides = []
      } else {
        const r = snapResize(orig, handle, dx, dy, targets)
        g.frame = r.frame
        g.guides = r.guides
      }
      g.resized = true
      setGesture({ ...g })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (g.resized) dispatch({ type: 'APPLY_DOC', doc: setElementFrame(docAtStart, g.slideId, g.id, g.frame) })
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

- `SelectionOverlay`의 guides prop을 두 제스처 공통으로:

```tsx
              guides={gesture?.guides ?? []}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/canvas/CanvasArea.test.tsx && npm test && npm run typecheck`
Expected: PASS (기존 리사이즈 테스트 포함)

```bash
git add editor/src/canvas/CanvasArea.tsx editor/src/canvas/CanvasArea.test.tsx
git commit -m "feat: Shift 비율 리사이즈와 리사이즈 스냅 가이드"
```

---

### Task 14: 캔버스 — 수동 줌

**Files:**
- Modify: `editor/src/canvas/CanvasArea.tsx`
- Modify: `editor/src/app.css`
- Test: `editor/src/canvas/CanvasArea.test.tsx` (추가)

**Interfaces:**
- Consumes: 기존 fit 스케일 로직
- Produces: `ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2]` export. 줌 상태 `'fit' | number`(로컬 UI 상태 — 문서/undo와 무관), 우하단 `확대 비율` select(맞춤/50~200%), Ctrl(⌘)+휠은 프리셋 단계 이동. fit이 아니면 캔버스는 스크롤 컨테이너

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/CanvasArea.test.tsx`에 추가:

```tsx
test('확대 비율 200% 선택은 스테이지 크기를 2배로 만든다', () => {
  const { container, getByLabelText } = renderCanvas()
  fireEvent.change(getByLabelText('확대 비율'), { target: { value: '2' } })
  const box = container.querySelector('.canvas-stage-box') as HTMLElement
  expect(box.style.width).toBe('2560px')
  expect(box.style.height).toBe('1440px')
})

test('Ctrl+휠은 프리셋 단계를 오르내린다', () => {
  const { container, getByLabelText } = renderCanvas()
  const scroll = container.querySelector('.canvas-scroll')!
  fireEvent.wheel(scroll, { ctrlKey: true, deltaY: -100 })
  // 테스트 환경 fitScale=1에서 확대 → 다음 단계 1.5
  expect((getByLabelText('확대 비율') as HTMLSelectElement).value).toBe('1.5')
  fireEvent.wheel(scroll, { ctrlKey: true, deltaY: 100 })
  expect((getByLabelText('확대 비율') as HTMLSelectElement).value).toBe('1')
})

test('줌 컨트롤 클릭은 선택을 해제하지 않는다', () => {
  const { dispatch, container } = renderCanvas([EL_TEXT])
  fireEvent.pointerDown(container.querySelector('.zoom-control')!)
  expect(dispatch).not.toHaveBeenCalled()
})

test('배율 200%에서 드래그 좌표가 보정된다', () => {
  const { dispatch, getByText, getByLabelText } = renderCanvas([EL_TEXT])
  fireEvent.change(getByLabelText('확대 비율'), { target: { value: '2' } })
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { clientX: 110, clientY: 10 })
  fireEvent.pointerUp(window)
  const doc = appliedDoc(dispatch)!
  // 화면 100px ÷ 배율 2 = 모델 50px
  expect(doc.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 50, top: 0 } })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/canvas/CanvasArea.test.tsx`
Expected: 신규 4개 FAIL (`확대 비율` 컨트롤 없음)

- [ ] **Step 3: 구현**

`editor/src/canvas/CanvasArea.tsx`:

모듈 레벨 상수 추가(export):

```ts
export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2]
```

상태 교체 — 기존 `const [scale, setScale] = useState(1)`을:

```tsx
  const [fitScale, setFitScale] = useState(1)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const scale = zoom === 'fit' ? fitScale : zoom
  const scaleRef = useRef(1)
  scaleRef.current = scale
```

fit effect는 `setScale` 대신 `setFitScale`을 호출하도록 이름만 바꾼다 (계산 로직 동일).

휠 줌 effect 추가 (fit effect 아래) — React onWheel은 preventDefault가 막히므로 non-passive로 직접 등록:

```tsx
  useEffect(() => {
    const area = ref.current
    if (!area) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => {
        const current = z === 'fit' ? fitScale : z
        if (e.deltaY < 0) return ZOOM_LEVELS.find((l) => l > current + 0.001) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!
        return [...ZOOM_LEVELS].reverse().find((l) => l < current - 0.001) ?? ZOOM_LEVELS[0]!
      })
    }
    area.addEventListener('wheel', onWheel, { passive: false })
    return () => area.removeEventListener('wheel', onWheel)
  }, [fitScale])
```

return JSX를 다음 구조로 교체 (`slide-stage` 이하 내용물은 기존 그대로):

```tsx
  return (
    <main
      className="canvas-area"
      onPointerDown={() => {
        if (!editingTextId) dispatch({ type: 'CLEAR_SELECTION' })
      }}
    >
      <div className="canvas-scroll" ref={ref}>
        <div className="canvas-stage-box" style={{ width: doc.slideWidth * scale, height: doc.slideHeight * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <div className="slide-stage" style={{ position: 'relative', width: doc.slideWidth, height: doc.slideHeight }}>
              {/* SlideView + SelectionOverlay 기존 그대로 */}
            </div>
          </div>
        </div>
      </div>
      <div className="zoom-control" onPointerDown={(e) => e.stopPropagation()}>
        <select
          aria-label="확대 비율"
          value={zoom === 'fit' ? 'fit' : String(zoom)}
          onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}
        >
          <option value="fit">맞춤</option>
          {ZOOM_LEVELS.map((l) => (
            <option key={l} value={l}>{Math.round(l * 100)}%</option>
          ))}
        </select>
      </div>
    </main>
  )
```

주의: `ref`는 기존에 main에 있었으나 **`.canvas-scroll`로 이동**한다 (fit 계산과 휠 리스너의 기준 요소).

`editor/src/app.css`:
- `.canvas-area` 규칙은 그대로 두고(flex 센터링은 StartScreen이 계속 사용), 추가:

```css
.canvas-scroll { width: 100%; height: 100%; overflow: auto; display: flex; }
.canvas-stage-box { margin: auto; flex: none; }
.zoom-control { position: absolute; right: 12px; bottom: 12px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; padding: 2px 4px; }
.zoom-control select { font: inherit; font-size: 12px; border: none; background: none; }
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /Users/hyunkyungmin/Developer/Home/webdeck/editor && npx vitest run src/canvas/CanvasArea.test.tsx && npm test && npm run typecheck && npm run build`
Expected: 전부 PASS (기존 캔버스 테스트 포함 — 특히 '빈 영역 클릭' 계열 회귀 확인)

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck && git add editor/src/canvas/CanvasArea.tsx editor/src/canvas/CanvasArea.test.tsx editor/src/app.css
git commit -m "feat: 수동 줌 — 배율 드롭다운과 Ctrl+휠 단계 줌"
```

---

### Task 15: 문서 갱신 — 백로그·확장 이력·로드맵

**Files:**
- Modify: `docs/plan-3-backlog.md`
- Modify: `docs/superpowers/specs/2026-07-02-webdeck-design.md` (§12)
- Modify: `docs/roadmap.md`

**Interfaces:** 없음 (문서만)

- [ ] **Step 1: 백로그 정리**

`docs/plan-3-backlog.md`에서 Plan 5로 해소된 항목을 삭제·수정:
- 삭제: "글자 크기 자유 입력(현재 프리셋 6종)·글자색 자유 선택(현재 스와치 6종)", "캔버스 수동 줌(배율 선택/휠 줌)"
- 수정: "리사이즈·다중 이동에도 스냅 가이드 적용" → "다중 이동에도 스냅 가이드 적용 (단일 이동·단일 리사이즈는 지원됨)"
- 수정: "텍스트 서식을 편집 모드 밖에서도 적용" → "인라인 서식(굵게/크기/색)을 편집 모드 밖에서도 적용 (세로 정렬 등 박스 수준은 지원됨 — 저장된 html 변환 필요)"

- [ ] **Step 2: 확장 이력 추가**

`docs/superpowers/specs/2026-07-02-webdeck-design.md` §12 끝에 추가:

```markdown
### Plan 5 — 서식·속성 심화 (2026-07-03)

우측 속성 패널(위치·크기 수치, 채우기/테두리/그림자/투명도 — 텍스트·이미지·도형 공통), 텍스트 서식 심화(폰트 스택 5종, 크기 자유 입력, 색 팝오버 스와치12+hex, 글머리/번호 목록, 줄 간격, 세로 정렬), 조작 개선(간격 균등 분배, Shift 비율 리사이즈, 리사이즈 스냅, 수동 줌). 포맷 v1 확장 없음 — 전부 요소 인라인 스타일(extraStyle) 범위. 포커스형 텍스트 도구는 data-text-tool + 셀렉션 저장/복원으로 편집 세션 유지. 상세: `2026-07-03-webdeck-formatting-design.md`
```

- [ ] **Step 3: 로드맵 갱신 + 커밋**

`docs/roadmap.md`의 "### Plan 5 — 서식·속성 심화" 제목을 "### Plan 5 — 서식·속성 심화 ✅ (완료)"로 바꾼다.

```bash
cd /Users/hyunkyungmin/Developer/Home/webdeck && git add docs/plan-3-backlog.md docs/superpowers/specs/2026-07-02-webdeck-design.md docs/roadmap.md
git commit -m "docs: Plan 5 확장 이력·백로그·로드맵 갱신"
```

---

## 수동 확인 (사람) — 플랜 완료 후

자동 테스트가 못 보는 실제 브라우저 동작 확인 목록. `cd editor && npm run dev`:

1. 텍스트 더블클릭 편집 → 폰트 드롭다운·크기 입력·hex 색 입력 사용 시 **편집이 끊기지 않는지** (핵심 — 셀렉션 저장/복원 인프라)
2. 크기 입력에 타이핑 후 캔버스 빈 곳 클릭 → 편집이 정상 종료되고 내용이 커밋되는지
3. 도형 선택 → 속성 패널에서 채우기/테두리/그림자/투명도 조작 → Ctrl+Z 1회에 1조작씩 되돌아가는지
4. 요소 3개 선택 → 가로/세로 분배, Shift+모서리 드래그 비율 유지, 리사이즈 중 주황 가이드
5. 우하단 줌 200% → 스크롤·드래그 정확도, Ctrl+휠 단계 줌
6. 목록·줄간격 적용 후 Ctrl+S 저장 → 파일 재열기 → 서식 유지 확인 → `node tools/validate-webdeck.mjs <파일>` 0오류
7. 저장한 문서를 브라우저로 직접 열어 목록 여백·세로 정렬·그림자가 에디터와 동일하게 보이는지 (뷰어 = 인라인 스타일 그대로)
