# WebDeck Plan 7 — 테마·레이아웃·템플릿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문서 테마(--wd-* 변수) UI 편집·프리셋, 슬라이드 레이아웃 4종 추가, 커스텀 템플릿(localStorage+가져오기)·시작 화면 썸네일, 배경 그라데이션·이미지를 추가한다.

**Architecture:** 포맷 확장 없음 — headExtra의 `:root` 블록 문자열 외과 수술(theme.ts), data-bg 값 규약(bg.ts), 요소 삽입(layouts.ts + addSlide elements 파라미터), localStorage(customTemplates.ts). UI는 속성 패널에서 ThemeSection/SlideBgSection 하위 컴포넌트로 분리하고, 시작 화면은 SlideView 축소 렌더로 썸네일을 그린다.

**Tech Stack:** React 19 + TypeScript strict + Vite 8, Vitest + happy-dom + RTL

**스펙:** `docs/superpowers/specs/2026-07-04-webdeck-theme-design.md`

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess`, 상대 import `.ts`/`.tsx` 확장자 필수. 신규 의존성 금지. 기존 `EditorState`/리듀서 무변경
- **headExtra 수술 최소화 계약**: `setThemeVars`는 첫 `:root` 블록 안 해당 변수 선언의 값 부분만 교체 — 주변 CSS·공백·주석 바이트 무손상. 블록에 없는 변수는 무시(주입 금지). 변경 없으면 같은 객체 반환
- 1 조작 = 1 APPLY_DOC undo 규율: 프리셋 1클릭 = 색 4종 일괄 1스텝, 같은 값 no-dispatch, 그라데이션은 "적용" 버튼 1회 커밋
- 테마 대상 변수 6종 정확히: `--wd-primary` `--wd-accent` `--wd-text` `--wd-muted` `--wd-font-heading` `--wd-font-body`
- 프리셋 4종 정확한 값: 파랑 기본(`#1a56db`/`#e8f0fe`/`#1f2937`/`#6b7280`), 그린(`#047857`/`#ecfdf5`/`#1f2937`/`#6b7280`), 버건디(`#9f1239`/`#fff1f2`/`#1f2937`/`#6b7280`), 다크 네이비(`#1e3a5f`/`#e8eef5`/`#111827`/`#4b5563`)
- bg 값 규약: 그라데이션 `linear-gradient(<0|90|180|270>deg, #rrggbb, #rrggbb)` 정확히 이 형태, 이미지 `url(<dataUri>) center / cover no-repeat`. 인식 불가 값은 custom으로 원문 보존
- localStorage 키 `webdeck.templates`. 용량 초과 오류 문구: `저장 공간이 부족합니다 — 사용하지 않는 템플릿을 삭제해 주세요`
- 사용자 노출 문구 한국어. 주요 문구 verbatim: 섹션 제목 `문서 테마`, 안내 `이 문서에는 테마 변수가 없습니다`, 보존 표시 `사용자 지정`, 가져오기 거부 `WebDeck 문서만 템플릿으로 등록할 수 있습니다`, 레이아웃 라벨 `빈 장`/`표지`/`제목+본문`/`2단`
- 테스트: `cd editor && npx vitest run <파일>`, 전체 `npm run test:all`(루트)

---

### Task 1: 테마 모델 (`model/theme.ts`)

**Files:**
- Create: `editor/src/model/theme.ts`
- Test: `editor/src/model/theme.test.ts`

**Interfaces:**
- Consumes: `DeckDoc`
- Produces (Task 5가 사용):
  - `THEME_COLOR_VARS: readonly ['--wd-primary','--wd-accent','--wd-text','--wd-muted']`, `THEME_FONT_VARS: readonly ['--wd-font-heading','--wd-font-body']`, `type ThemeVarName`
  - `THEME_PRESETS: { key: string; label: string; colors: Record<ThemeColorVar, string> }[]` (4종)
  - `readTheme(doc: DeckDoc): Partial<Record<ThemeVarName, string>> | null` — `:root` 없으면 null
  - `setThemeVars(doc: DeckDoc, patch: Partial<Record<ThemeVarName, string>>): DeckDoc` — 무변경 시 같은 객체

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/theme.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'
import { THEME_PRESETS, readTheme, setThemeVars } from './theme.ts'

const DOC_HTML = `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title><style>
  /* 상단 주석 유지 확인용 */
  :root {
    --wd-primary: #1a56db;
    --wd-accent: #e8f0fe;
    --wd-text: #1f2937;
    --wd-muted: #6b7280;
    --wd-font-heading: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
    --wd-font-body: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
  }
  .slide { background: #fff; }
</style></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
</main></body></html>`

const doc = () => parseWebdeck(DOC_HTML)

describe('readTheme', () => {
  test('6종 변수를 읽는다', () => {
    const t = readTheme(doc())!
    expect(t['--wd-primary']).toBe('#1a56db')
    expect(t['--wd-muted']).toBe('#6b7280')
    expect(t['--wd-font-heading']).toBe('"Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif')
  })

  test(':root 블록이 없으면 null', () => {
    const d = parseWebdeck(DOC_HTML.replace(/:root \{[\s\S]*?\}/, ''))
    expect(readTheme(d)).toBeNull()
  })

  test('일부 변수만 있으면 있는 것만 반환한다', () => {
    const d = parseWebdeck(DOC_HTML.replace('--wd-muted: #6b7280;', ''))
    const t = readTheme(d)!
    expect(t['--wd-muted']).toBeUndefined()
    expect(t['--wd-primary']).toBe('#1a56db')
  })
})

describe('setThemeVars', () => {
  test('값 부분만 교체하고 주변 CSS는 바이트 무손상', () => {
    const d = doc()
    const out = setThemeVars(d, { '--wd-primary': '#ff0000' })
    expect(readTheme(out)!['--wd-primary']).toBe('#ff0000')
    // 값 문자열 치환 외에 다른 바이트가 변하지 않았다
    expect(out.headExtra).toBe(d.headExtra.replace('#1a56db', '#ff0000'))
    expect(out.headExtra).toContain('/* 상단 주석 유지 확인용 */')
    expect(out.headExtra).toContain('.slide { background: #fff; }')
    expect(checkRoundTrip(out)).toBeNull()
  })

  test('여러 변수를 한 번에 교체한다 (프리셋)', () => {
    const preset = THEME_PRESETS[1]!
    const out = setThemeVars(doc(), preset.colors)
    const t = readTheme(out)!
    expect(t['--wd-primary']).toBe('#047857')
    expect(t['--wd-accent']).toBe('#ecfdf5')
  })

  test('블록에 없는 변수는 무시한다 (주입 금지)', () => {
    const d = parseWebdeck(DOC_HTML.replace('--wd-muted: #6b7280;', ''))
    const out = setThemeVars(d, { '--wd-muted': '#000000' })
    expect(out.headExtra).toBe(d.headExtra)
  })

  test('변경이 없으면 같은 객체를 반환한다', () => {
    const d = doc()
    expect(setThemeVars(d, { '--wd-primary': '#1a56db' })).toBe(d)
    const noRoot = parseWebdeck(DOC_HTML.replace(/:root \{[\s\S]*?\}/, ''))
    expect(setThemeVars(noRoot, { '--wd-primary': '#ff0000' })).toBe(noRoot)
  })

  test('프리셋은 4종이고 색 4개씩 갖는다', () => {
    expect(THEME_PRESETS).toHaveLength(4)
    expect(THEME_PRESETS.map((p) => p.label)).toEqual(['파랑 기본', '그린', '버건디', '다크 네이비'])
    for (const p of THEME_PRESETS) expect(Object.keys(p.colors)).toHaveLength(4)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/theme.test.ts`
Expected: FAIL — `Cannot find module './theme.ts'`

- [ ] **Step 3: 구현**

`editor/src/model/theme.ts`:

```ts
import type { DeckDoc } from './types.ts'

export const THEME_COLOR_VARS = ['--wd-primary', '--wd-accent', '--wd-text', '--wd-muted'] as const
export const THEME_FONT_VARS = ['--wd-font-heading', '--wd-font-body'] as const
export type ThemeColorVar = (typeof THEME_COLOR_VARS)[number]
export type ThemeVarName = ThemeColorVar | (typeof THEME_FONT_VARS)[number]

export interface ThemePreset {
  key: string
  label: string
  colors: Record<ThemeColorVar, string>
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: 'blue', label: '파랑 기본', colors: { '--wd-primary': '#1a56db', '--wd-accent': '#e8f0fe', '--wd-text': '#1f2937', '--wd-muted': '#6b7280' } },
  { key: 'green', label: '그린', colors: { '--wd-primary': '#047857', '--wd-accent': '#ecfdf5', '--wd-text': '#1f2937', '--wd-muted': '#6b7280' } },
  { key: 'burgundy', label: '버건디', colors: { '--wd-primary': '#9f1239', '--wd-accent': '#fff1f2', '--wd-text': '#1f2937', '--wd-muted': '#6b7280' } },
  { key: 'navy', label: '다크 네이비', colors: { '--wd-primary': '#1e3a5f', '--wd-accent': '#e8eef5', '--wd-text': '#111827', '--wd-muted': '#4b5563' } },
]

/** headExtra의 첫 :root 블록 내부 범위 — 없으면 null */
function rootBlockRange(headExtra: string): { start: number; end: number } | null {
  const m = /:root\s*\{/.exec(headExtra)
  if (!m) return null
  const start = m.index + m[0].length
  const end = headExtra.indexOf('}', start)
  return end === -1 ? null : { start, end }
}

export function readTheme(doc: DeckDoc): Partial<Record<ThemeVarName, string>> | null {
  const range = rootBlockRange(doc.headExtra)
  if (!range) return null
  const block = doc.headExtra.slice(range.start, range.end)
  const out: Partial<Record<ThemeVarName, string>> = {}
  for (const name of [...THEME_COLOR_VARS, ...THEME_FONT_VARS]) {
    const m = new RegExp(`${name}\\s*:\\s*([^;]+)`).exec(block)
    if (m) out[name] = m[1]!.trim()
  }
  return out
}

/**
 * :root 블록 안 해당 변수 선언의 값 부분만 교체한다 — 주변 CSS 바이트 무손상 (headExtra 왕복 보존 계약).
 * 블록에 없는 변수는 무시하고, 변경이 없으면 같은 객체를 반환한다.
 * 값은 UI가 생성한 hex/폰트 스택만 온다 — 치환 문자열에 특수문자($) 없음 전제.
 */
export function setThemeVars(doc: DeckDoc, patch: Partial<Record<ThemeVarName, string>>): DeckDoc {
  const range = rootBlockRange(doc.headExtra)
  if (!range) return doc
  let block = doc.headExtra.slice(range.start, range.end)
  for (const [name, value] of Object.entries(patch)) {
    if (value === undefined) continue
    block = block.replace(new RegExp(`(${name}\\s*:\\s*)[^;]+`), `$1${value}`)
  }
  const headExtra = doc.headExtra.slice(0, range.start) + block + doc.headExtra.slice(range.end)
  return headExtra === doc.headExtra ? doc : { ...doc, headExtra }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/model/theme.test.ts && npm run typecheck`
Expected: PASS (9 tests), 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/theme.ts editor/src/model/theme.test.ts
git commit -m "feat(model): 테마 변수 읽기·외과 수술 교체 (theme.ts)"
```

---

### Task 2: 레이아웃 모델 (`model/layouts.ts` + addSlide 확장)

**Files:**
- Create: `editor/src/model/layouts.ts`
- Modify: `editor/src/model/ops.ts` (addSlide에 elements 파라미터)
- Test: `editor/src/model/layouts.test.ts`

**Interfaces:**
- Consumes: `createTextElement(idGen, frame, html)`, `createShapeElement(idGen, frame, background)` (ops.ts 기존)
- Produces (Task 7이 사용):
  - `LAYOUTS: { key: string; label: string; build: (idGen: () => string) => KnownElement[] }[]` — key: `blank`/`cover`/`title-body`/`two-col`, label: `빈 장`/`표지`/`제목+본문`/`2단`
  - `addSlide(doc, idGen, index?, elements?: SlideElement[])` — elements 기본값 `[]` (기존 호출 하위 호환)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/layouts.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'
import { LAYOUTS } from './layouts.ts'
import { addSlide } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'

const BASE = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
</main></body></html>`)

test('레이아웃은 4종이고 라벨이 정확하다', () => {
  expect(LAYOUTS.map((l) => l.key)).toEqual(['blank', 'cover', 'title-body', 'two-col'])
  expect(LAYOUTS.map((l) => l.label)).toEqual(['빈 장', '표지', '제목+본문', '2단'])
})

describe.each(LAYOUTS)('레이아웃 $key', (layout) => {
  test('요소가 캔버스(1280×720) 안에 있고 왕복을 통과한다', () => {
    const els = layout.build(createIdGen('L'))
    for (const el of els) {
      expect(el.frame.left).toBeGreaterThanOrEqual(0)
      expect(el.frame.top).toBeGreaterThanOrEqual(0)
      expect(el.frame.left + el.frame.width).toBeLessThanOrEqual(1280)
      expect(el.frame.top + el.frame.height).toBeLessThanOrEqual(720)
    }
    const doc = addSlide(BASE, createIdGen('s'), 1, els)
    expect(doc.slides).toHaveLength(2)
    expect(doc.slides[1]!.elements).toHaveLength(els.length)
    expect(checkRoundTrip(doc)).toBeNull()
  })
})

test('blank 외 레이아웃은 var(--wd-*) 테마 참조를 포함한다', () => {
  for (const layout of LAYOUTS.filter((l) => l.key !== 'blank')) {
    const els = layout.build(createIdGen('v'))
    const all = JSON.stringify(els)
    expect(all, layout.key).toContain('var(--wd-')
  }
})

test('addSlide는 elements 없이도 기존과 동일하다 (하위 호환)', () => {
  const doc = addSlide(BASE, createIdGen('a'))
  expect(doc.slides[1]!.elements).toEqual([])
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/layouts.test.ts`
Expected: FAIL — `Cannot find module './layouts.ts'`

- [ ] **Step 3: 구현**

`editor/src/model/ops.ts`의 addSlide 교체:

```ts
export function addSlide(doc: DeckDoc, idGen: () => string, index?: number, elements: SlideElement[] = []): DeckDoc {
  const slide: Slide = { id: idGen(), bg: '#ffffff', transition: null, notes: '', extraAttrs: {}, extraClasses: [], elements }
  const slides = doc.slides.slice()
  slides.splice(index ?? slides.length, 0, slide)
  return { ...doc, slides }
}
```

(`SlideElement` 타입이 ops.ts import에 없으면 추가)

`editor/src/model/layouts.ts`:

```ts
import { createShapeElement, createTextElement } from './ops.ts'
import type { KnownElement } from './types.ts'

export interface SlideLayout {
  key: string
  label: string
  build: (idGen: () => string) => KnownElement[]
}

const TITLE = '<p><strong><span style="font-size:36px;">제목을 입력하세요</span></strong></p>'
const BODY = (text: string) => `<p><span style="font-size:24px;">${text}</span></p>`

/** 좌표는 docs/ai-guide.md의 검증된 레시피. 색·폰트는 var(--wd-*)로 문서 테마를 따라간다 */
export const LAYOUTS: SlideLayout[] = [
  { key: 'blank', label: '빈 장', build: () => [] },
  {
    key: 'cover',
    label: '표지',
    build: (idGen) => [
      createTextElement(idGen, { left: 96, top: 240, width: 1088, height: 140 }, '<p><strong><span style="font-size:54px;">제목을 입력하세요</span></strong></p>'),
      createTextElement(idGen, { left: 96, top: 400, width: 1088, height: 60 }, '<p><span style="font-size:24px; color:var(--wd-muted);">부제목을 입력하세요</span></p>'),
    ],
  },
  {
    key: 'title-body',
    label: '제목+본문',
    build: (idGen) => [
      createTextElement(idGen, { left: 96, top: 64, width: 1088, height: 80 }, TITLE),
      createShapeElement(idGen, { left: 96, top: 150, width: 64, height: 6 }, 'var(--wd-primary)'),
      createTextElement(idGen, { left: 96, top: 200, width: 1088, height: 440 }, BODY('본문을 입력하세요')),
    ],
  },
  {
    key: 'two-col',
    label: '2단',
    build: (idGen) => [
      createTextElement(idGen, { left: 96, top: 64, width: 1088, height: 80 }, TITLE),
      createShapeElement(idGen, { left: 96, top: 150, width: 64, height: 6 }, 'var(--wd-primary)'),
      createTextElement(idGen, { left: 96, top: 200, width: 520, height: 440 }, BODY('왼쪽 내용')),
      createTextElement(idGen, { left: 664, top: 200, width: 520, height: 440 }, BODY('오른쪽 내용')),
    ],
  },
]
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/model/layouts.test.ts src/model/ops.test.ts && npm run typecheck`
Expected: PASS (기존 addSlide 테스트 포함)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/layouts.ts editor/src/model/layouts.test.ts editor/src/model/ops.ts
git commit -m "feat(model): 슬라이드 레이아웃 4종·addSlide elements 파라미터"
```

---

### Task 3: 배경 값 규약 (`model/bg.ts`)

**Files:**
- Create: `editor/src/model/bg.ts`
- Test: `editor/src/model/bg.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces (Task 6이 사용):
  - `type BgInfo = { kind: 'none' } | { kind: 'solid'; color: string } | { kind: 'gradient'; angle: 0|90|180|270; from: string; to: string } | { kind: 'image' } | { kind: 'custom' }`
  - `parseBg(bg: string | null): BgInfo`, `buildGradient(angle, from, to): string`, `buildImageBg(dataUri: string): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/bg.test.ts`:

```ts
import { expect, test } from 'vitest'
import { buildGradient, buildImageBg, parseBg } from './bg.ts'

test('단색 hex를 인식한다', () => {
  expect(parseBg('#ff0000')).toEqual({ kind: 'solid', color: '#ff0000' })
})

test('null은 none', () => {
  expect(parseBg(null)).toEqual({ kind: 'none' })
})

test('규약 그라데이션을 역파싱한다', () => {
  expect(parseBg('linear-gradient(180deg, #1a56db, #e8f0fe)')).toEqual({
    kind: 'gradient', angle: 180, from: '#1a56db', to: '#e8f0fe',
  })
})

test('build↔parse 왕복', () => {
  const s = buildGradient(90, '#000000', '#ffffff')
  expect(s).toBe('linear-gradient(90deg, #000000, #ffffff)')
  expect(parseBg(s)).toEqual({ kind: 'gradient', angle: 90, from: '#000000', to: '#ffffff' })
})

test('비규약 그라데이션·기타 값은 custom (원문 보존 대상)', () => {
  expect(parseBg('linear-gradient(45deg, red, blue)').kind).toBe('custom')
  expect(parseBg('radial-gradient(#fff, #000)').kind).toBe('custom')
  expect(parseBg('var(--wd-accent)').kind).toBe('custom')
})

test('data URI 이미지 배경을 인식한다', () => {
  const s = buildImageBg('data:image/png;base64,AAAA')
  expect(s).toBe('url(data:image/png;base64,AAAA) center / cover no-repeat')
  expect(parseBg(s)).toEqual({ kind: 'image' })
})

test('외부 URL 이미지는 custom (자기완결 원칙 — UI가 만들지 않음)', () => {
  expect(parseBg('url(https://x/y.png) center / cover no-repeat').kind).toBe('custom')
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/bg.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`editor/src/model/bg.ts`:

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/model/bg.test.ts && npm run typecheck`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/bg.ts editor/src/model/bg.test.ts
git commit -m "feat(model): data-bg 값 규약 파싱·생성 (bg.ts)"
```

---

### Task 4: 커스텀 템플릿 저장소 (`file/customTemplates.ts`)

**Files:**
- Create: `editor/src/file/customTemplates.ts`
- Test: `editor/src/file/customTemplates.test.ts`

**Interfaces:**
- Consumes: `localStorage` (happy-dom 내장)
- Produces (Task 8이 사용):
  - `interface CustomTemplate { id: string; label: string; html: string; savedAt: string }`
  - `listCustomTemplates(): CustomTemplate[]`, `saveCustomTemplate(label: string, html: string): CustomTemplate`, `removeCustomTemplate(id: string): void`

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/file/customTemplates.test.ts`:

```ts
import { beforeEach, expect, test, vi } from 'vitest'
import { listCustomTemplates, removeCustomTemplate, saveCustomTemplate } from './customTemplates.ts'

beforeEach(() => localStorage.clear())

test('저장하면 목록에 나타나고 id가 유일하다', () => {
  const a = saveCustomTemplate('회사 표준', '<html>a</html>')
  const b = saveCustomTemplate('회사 표준', '<html>b</html>')
  expect(a.id).not.toBe(b.id)
  const list = listCustomTemplates()
  expect(list).toHaveLength(2)
  expect(list[0]!.label).toBe('회사 표준')
  expect(list[1]!.html).toBe('<html>b</html>')
})

test('삭제하면 목록에서 빠진다', () => {
  const a = saveCustomTemplate('x', '<html></html>')
  saveCustomTemplate('y', '<html></html>')
  removeCustomTemplate(a.id)
  const list = listCustomTemplates()
  expect(list).toHaveLength(1)
  expect(list[0]!.label).toBe('y')
})

test('파손된 JSON은 빈 목록으로 취급한다', () => {
  localStorage.setItem('webdeck.templates', '{broken')
  expect(listCustomTemplates()).toEqual([])
  // 다음 저장이 정상 목록을 재생성한다
  saveCustomTemplate('복구', '<html></html>')
  expect(listCustomTemplates()).toHaveLength(1)
})

test('배열이지만 필드가 깨진 항목은 걸러낸다', () => {
  localStorage.setItem('webdeck.templates', JSON.stringify([{ id: 'a' }, { id: 'b', label: 'ok', html: '<html></html>', savedAt: 't' }]))
  const list = listCustomTemplates()
  expect(list).toHaveLength(1)
  expect(list[0]!.id).toBe('b')
})

test('용량 초과는 한국어 오류로 변환한다', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError')
  })
  expect(() => saveCustomTemplate('큰 것', '<html></html>')).toThrow('저장 공간이 부족합니다')
  spy.mockRestore()
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/file/customTemplates.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`editor/src/file/customTemplates.ts`:

```ts
export interface CustomTemplate {
  id: string
  label: string
  html: string
  savedAt: string
}

const KEY = 'webdeck.templates'

function isCustomTemplate(t: unknown): t is CustomTemplate {
  if (typeof t !== 'object' || t === null) return false
  const o = t as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.label === 'string' && typeof o.html === 'string' && typeof o.savedAt === 'string'
}

export function listCustomTemplates(): CustomTemplate[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isCustomTemplate) : []
  } catch {
    return []
  }
}

export function saveCustomTemplate(label: string, html: string): CustomTemplate {
  const template: CustomTemplate = {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    label,
    html,
    savedAt: new Date().toISOString(),
  }
  const list = [...listCustomTemplates(), template]
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    throw new Error('저장 공간이 부족합니다 — 사용하지 않는 템플릿을 삭제해 주세요')
  }
  return template
}

export function removeCustomTemplate(id: string): void {
  const list = listCustomTemplates().filter((t) => t.id !== id)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // 목록 축소 저장의 실패는 실질적으로 발생하지 않는다 — 무시
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/file/customTemplates.test.ts && npm run typecheck`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/file/customTemplates.ts editor/src/file/customTemplates.test.ts
git commit -m "feat(file): 커스텀 템플릿 localStorage 저장소"
```

---

### Task 5: 문서 테마 UI (`panels/ThemeSection.tsx`)

**Files:**
- Create: `editor/src/panels/ThemeSection.tsx`
- Modify: `editor/src/panels/PropertiesPanel.tsx` (슬라이드 모드 최상단에 ThemeSection 렌더)
- Modify: `editor/src/app.css` (테마 섹션 규칙)
- Test: `editor/src/panels/ThemeSection.test.tsx`

**Interfaces:**
- Consumes: Task 1의 theme.ts 전부, 기존 `FONT_FAMILIES`(panels/format.ts), `ColorPopover`(label/value/onPick 사용)
- Produces: `ThemeSection({ doc, dispatch })` — 속성 패널 내부 전용

**동작 계약:** 프리셋 1클릭 = 1 APPLY_DOC(색 4종 일괄), 색/폰트 개별 변경 1 APPLY_DOC, 같은 값 no-dispatch(setThemeVars의 같은 객체 반환 활용), 변수 없는 문서는 안내 문구만, 블록에 없는 변수의 행은 숨김, hex가 아닌 색 값은 `사용자 지정 값 보존됨` 표시 후 덮어쓰기 전까지 보존.

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/ThemeSection.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import { readTheme } from '../model/theme.ts'
import type { DeckDoc } from '../model/types.ts'
import { ThemeSection } from './ThemeSection.tsx'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title><style>
  :root {
    --wd-primary: #1a56db;
    --wd-accent: #e8f0fe;
    --wd-text: #1f2937;
    --wd-muted: #6b7280;
    --wd-font-heading: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
    --wd-font-body: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
  }
</style></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
</main></body></html>`)

function setup(doc: DeckDoc = DOC) {
  const dispatch = vi.fn()
  const utils = render(<ThemeSection doc={doc} dispatch={dispatch} />)
  return { dispatch, ...utils }
}

function appliedDoc(dispatch: ReturnType<typeof vi.fn>): DeckDoc | null {
  const call = dispatch.mock.calls.find(([a]) => a?.type === 'APPLY_DOC')
  return call ? (call[0].doc as DeckDoc) : null
}

test('프리셋 1클릭은 색 4종을 1 APPLY_DOC으로 바꾼다', () => {
  const { dispatch, getByRole } = setup()
  fireEvent.click(getByRole('button', { name: /그린/ }))
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')).toHaveLength(1)
  const t = readTheme(appliedDoc(dispatch)!)!
  expect(t['--wd-primary']).toBe('#047857')
  expect(t['--wd-accent']).toBe('#ecfdf5')
})

test('폰트 select 변경은 1 APPLY_DOC, 같은 값은 no-dispatch', () => {
  const { dispatch, getByLabelText } = setup()
  const sel = getByLabelText('제목 폰트') as HTMLSelectElement
  fireEvent.change(sel, { target: { value: '"NanumMyeongjo", "나눔명조", "Batang", "바탕", serif' } })
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')).toHaveLength(1)
  expect(readTheme(appliedDoc(dispatch)!)!['--wd-font-heading']).toContain('NanumMyeongjo')
})

test('같은 폰트 값 재선택은 디스패치하지 않는다', () => {
  const { dispatch, getByLabelText } = setup()
  fireEvent.change(getByLabelText('본문 폰트'), { target: { value: '"Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif' } })
  expect(dispatch).not.toHaveBeenCalled()
})

test('테마 변수가 없는 문서는 안내만 보여준다', () => {
  const noTheme = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section></main></body></html>`)
  const { getByText, queryByLabelText } = setup(noTheme)
  expect(getByText('이 문서에는 테마 변수가 없습니다')).toBeTruthy()
  expect(queryByLabelText('제목 폰트')).toBeNull()
})

test('hex가 아닌 색 값은 사용자 지정 표시로 보존된다', () => {
  const weird = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title><style>:root { --wd-primary: rgb(20, 20, 20); }</style></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section></main></body></html>`)
  const { getByText } = setup(weird)
  expect(getByText(/사용자 지정 값 보존됨/)).toBeTruthy()
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/panels/ThemeSection.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`editor/src/panels/ThemeSection.tsx`:

```tsx
import type { Dispatch } from 'react'
import { THEME_PRESETS, readTheme, setThemeVars } from '../model/theme.ts'
import type { ThemeVarName } from '../model/theme.ts'
import type { DeckDoc } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'
import { ColorPopover } from './ColorPopover.tsx'
import { FONT_FAMILIES } from './format.ts'

const HEX = /^#[0-9a-fA-F]{6}$/

const COLOR_ROWS: [ThemeVarName, string][] = [
  ['--wd-primary', '강조색'],
  ['--wd-accent', '보조 배경'],
  ['--wd-text', '글자색'],
  ['--wd-muted', '보조 글자'],
]

const FONT_ROWS: [ThemeVarName, string][] = [
  ['--wd-font-heading', '제목 폰트'],
  ['--wd-font-body', '본문 폰트'],
]

export function ThemeSection({ doc, dispatch }: { doc: DeckDoc; dispatch: Dispatch<EditorAction> }) {
  const theme = readTheme(doc)
  if (!theme) {
    return (
      <section className="theme-section">
        <h2>문서 테마</h2>
        <p className="theme-empty">이 문서에는 테마 변수가 없습니다</p>
      </section>
    )
  }
  const apply = (patch: Partial<Record<ThemeVarName, string>>) => {
    const next = setThemeVars(doc, patch)
    if (next !== doc) dispatch({ type: 'APPLY_DOC', doc: next })
  }
  return (
    <section className="theme-section">
      <h2>문서 테마</h2>
      <div className="btn-row preset-row">
        {THEME_PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => apply(p.colors)}>
            <span className="preset-chip" style={{ background: p.colors['--wd-primary'] }} aria-hidden="true" />
            {p.label}
          </button>
        ))}
      </div>
      {COLOR_ROWS.filter(([name]) => theme[name] !== undefined).map(([name, label]) => {
        const value = theme[name]!
        const hex = HEX.test(value) ? value : undefined
        return (
          <div className="prop-row" key={name}>
            <ColorPopover label={label} value={hex} onPick={(c) => apply({ [name]: c })} />
            {!hex && <span className="notice-inline">사용자 지정 값 보존됨</span>}
          </div>
        )
      })}
      {FONT_ROWS.filter(([name]) => theme[name] !== undefined).map(([name, label]) => {
        const value = theme[name]!
        const known = FONT_FAMILIES.some((f) => f.stack === value)
        return (
          <label className="prop-row" key={name}>
            {label}
            <select
              aria-label={label}
              value={known ? value : 'custom'}
              onChange={(e) => {
                if (e.target.value !== 'custom' && e.target.value !== value) apply({ [name]: e.target.value })
              }}
            >
              {!known && <option value="custom">사용자 지정</option>}
              {FONT_FAMILIES.map((f) => (
                <option key={f.label} value={f.stack}>{f.label}</option>
              ))}
            </select>
          </label>
        )
      })}
    </section>
  )
}
```

`editor/src/panels/PropertiesPanel.tsx` 수정 — import 추가 `import { ThemeSection } from './ThemeSection.tsx'`, 슬라이드 모드 return의 `<h2>슬라이드</h2>` **앞**에 삽입:

```tsx
        <ThemeSection doc={doc} dispatch={dispatch} />
```

`editor/src/app.css` 끝에 추가:

```css
/* 문서 테마 섹션 */
.theme-section { display: flex; flex-direction: column; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb; margin-bottom: 10px; }
.theme-empty { margin: 0; font-size: 12px; color: #9ca3af; }
.preset-row { flex-wrap: wrap; }
.preset-row button { display: inline-flex; align-items: center; gap: 5px; }
.preset-chip { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.notice-inline { font-size: 11px; color: #92400e; }
```

주의: ColorPopover의 기존 계약(라벨/value 칩/스와치/hex 입력)을 그대로 사용 — textTool 미사용(편집 모드 아님). `사용자 지정 값 보존됨` 문구는 Plan 5의 테두리 보존 문구와 동일 관례.

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/panels/ThemeSection.test.tsx src/panels/PropertiesPanel.test.tsx && npm run typecheck`
Expected: PASS (기존 패널 테스트 포함)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/panels/ThemeSection.tsx editor/src/panels/ThemeSection.test.tsx editor/src/panels/PropertiesPanel.tsx editor/src/app.css
git commit -m "feat(editor): 문서 테마 편집 UI — 색 4종·폰트 2종·프리셋 4종"
```

---

### Task 6: 배경 확장 UI (`panels/SlideBgSection.tsx`)

**Files:**
- Create: `editor/src/panels/SlideBgSection.tsx`
- Modify: `editor/src/panels/PropertiesPanel.tsx` (배경색 label을 SlideBgSection으로 교체, bgDraft 상태 제거)
- Modify: `editor/src/file/fileAccess.ts` (readFileAsDataUrl 추가)
- Modify: `editor/src/app.css`
- Test: `editor/src/panels/SlideBgSection.test.tsx`

**Interfaces:**
- Consumes: Task 3의 bg.ts 전부, 기존 `setSlideBg(doc, slideId, bg)`
- Produces: `SlideBgSection({ doc, slide, dispatch, readFile? })` — readFile은 테스트 주입용(기본 `readFileAsDataUrl`), `readFileAsDataUrl(file: File): Promise<string>` (fileAccess.ts)

**동작 계약:** 유형 select(단색/그라데이션/이미지 + 현재 값이 custom이면 '사용자 지정' 항목 표시)는 로컬 상태만 바꾸고 디스패치하지 않음. 단색은 기존 bgDraft 패턴(blur 1회 커밋, aria-label `배경색` 유지 — 기존 테스트 호환). 그라데이션은 색 2개+방향 드래프트 후 `적용` 버튼 1회 커밋. 이미지는 파일 선택 → 이미지 아님 알림 / 2MB 초과 confirm → data URI 1회 커밋. 슬라이드 전환 시 드래프트 초기화는 부모가 `key={slide.id}`로 보장.

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/SlideBgSection.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import type { DeckDoc } from '../model/types.ts'
import { SlideBgSection } from './SlideBgSection.tsx'

if (!window.confirm) window.confirm = () => true
if (!window.alert) window.alert = () => {}

function docWith(bgAttr: string) {
  return parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"${bgAttr}></section></main></body></html>`)
}

function setup(bgAttr = ' data-bg="#ffffff"', readFile?: (f: File) => Promise<string>) {
  const doc = docWith(bgAttr)
  const dispatch = vi.fn()
  const utils = render(
    <SlideBgSection doc={doc} slide={doc.slides[0]!} dispatch={dispatch} readFile={readFile} />,
  )
  return { doc, dispatch, ...utils }
}

function appliedBg(dispatch: ReturnType<typeof vi.fn>): string | null | undefined {
  const call = dispatch.mock.calls.find(([a]) => a?.type === 'APPLY_DOC')
  return call ? (call[0].doc as DeckDoc).slides[0]!.bg : undefined
}

test('단색 모드: 기존 bgDraft 패턴 — blur 시 1회 커밋', () => {
  const { dispatch, getByLabelText } = setup()
  const input = getByLabelText('배경색')
  fireEvent.change(input, { target: { value: '#ff0000' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.blur(input)
  expect(appliedBg(dispatch)).toBe('#ff0000')
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')).toHaveLength(1)
})

test('유형 전환 자체는 디스패치하지 않는다', () => {
  const { dispatch, getByLabelText } = setup()
  fireEvent.change(getByLabelText('배경 유형'), { target: { value: 'gradient' } })
  expect(dispatch).not.toHaveBeenCalled()
})

test('그라데이션: 색·방향 후 적용 1회 커밋', () => {
  const { dispatch, getByLabelText, getByRole } = setup()
  fireEvent.change(getByLabelText('배경 유형'), { target: { value: 'gradient' } })
  fireEvent.change(getByLabelText('시작 색'), { target: { value: '#1a56db' } })
  fireEvent.change(getByLabelText('끝 색'), { target: { value: '#e8f0fe' } })
  fireEvent.change(getByLabelText('방향'), { target: { value: '90' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.click(getByRole('button', { name: '적용' }))
  expect(appliedBg(dispatch)).toBe('linear-gradient(90deg, #1a56db, #e8f0fe)')
})

test('기존 규약 그라데이션 값은 역파싱해 초기 표시한다', () => {
  const { getByLabelText } = setup(' data-bg="linear-gradient(180deg, #111111, #222222)"')
  expect((getByLabelText('배경 유형') as HTMLSelectElement).value).toBe('gradient')
  expect((getByLabelText('시작 색') as HTMLInputElement).value).toBe('#111111')
})

test('custom 값은 사용자 지정으로 표시하고 보존한다', () => {
  const { dispatch, getByLabelText, getByText } = setup(' data-bg="var(--wd-accent)"')
  expect((getByLabelText('배경 유형') as HTMLSelectElement).value).toBe('custom')
  expect(getByText(/사용자 지정 값 보존됨/)).toBeTruthy()
  expect(dispatch).not.toHaveBeenCalled()
})

test('이미지: 파일 선택 → data URI로 1회 커밋', async () => {
  const readFile = vi.fn().mockResolvedValue('data:image/png;base64,AAAA')
  const { dispatch, getByLabelText } = setup(' data-bg="#ffffff"', readFile)
  fireEvent.change(getByLabelText('배경 유형'), { target: { value: 'image' } })
  const file = new File(['x'], 'bg.png', { type: 'image/png' })
  fireEvent.change(getByLabelText('배경 이미지 선택'), { target: { files: [file] } })
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalled())
  expect(appliedBg(dispatch)).toBe('url(data:image/png;base64,AAAA) center / cover no-repeat')
})

test('이미지가 아닌 파일은 무시하고 알림한다', async () => {
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
  const readFile = vi.fn()
  const { dispatch, getByLabelText } = setup(' data-bg="#ffffff"', readFile)
  fireEvent.change(getByLabelText('배경 유형'), { target: { value: 'image' } })
  const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
  fireEvent.change(getByLabelText('배경 이미지 선택'), { target: { files: [file] } })
  expect(alertSpy).toHaveBeenCalled()
  expect(readFile).not.toHaveBeenCalled()
  expect(dispatch).not.toHaveBeenCalled()
  alertSpy.mockRestore()
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/panels/SlideBgSection.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`editor/src/file/fileAccess.ts` 끝에 추가:

```ts
/** 파일을 data URI 문자열로 읽는다 (배경 이미지 임베딩용) */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('읽기 결과가 문자열이 아닙니다'))
    }
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다'))
    reader.readAsDataURL(file)
  })
}
```

`editor/src/panels/SlideBgSection.tsx`:

```tsx
import { useState } from 'react'
import type { ChangeEvent, Dispatch } from 'react'
import { readFileAsDataUrl } from '../file/fileAccess.ts'
import { buildGradient, buildImageBg, parseBg } from '../model/bg.ts'
import type { BgAngle } from '../model/bg.ts'
import { setSlideBg } from '../model/ops.ts'
import type { DeckDoc, Slide } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'

type BgMode = 'solid' | 'gradient' | 'image' | 'custom'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024

export function SlideBgSection({
  doc,
  slide,
  dispatch,
  readFile = readFileAsDataUrl,
}: {
  doc: DeckDoc
  slide: Slide
  dispatch: Dispatch<EditorAction>
  /** 테스트 주입용 — 기본은 FileReader 기반 */
  readFile?: (file: File) => Promise<string>
}) {
  const bg = parseBg(slide.bg)
  const initialMode: BgMode = bg.kind === 'gradient' ? 'gradient' : bg.kind === 'image' ? 'image' : bg.kind === 'custom' ? 'custom' : 'solid'
  const [mode, setMode] = useState<BgMode>(initialMode)
  /** 단색 드래프트 — OS 피커 드래그 동안 onChange 연속 발화, blur 시 1회 커밋 */
  const [bgDraft, setBgDraft] = useState<string | null>(null)
  const [from, setFrom] = useState(bg.kind === 'gradient' ? bg.from : '#1a56db')
  const [to, setTo] = useState(bg.kind === 'gradient' ? bg.to : '#e8f0fe')
  const [angle, setAngle] = useState<BgAngle>(bg.kind === 'gradient' ? bg.angle : 180)

  const commit = (value: string) => {
    if (value !== slide.bg) dispatch({ type: 'APPLY_DOC', doc: setSlideBg(doc, slide.id, value) })
  }

  const solidValue = bg.kind === 'solid' ? bg.color : '#ffffff'

  async function handleImageFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      window.alert('이미지 파일만 선택할 수 있습니다')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      if (!window.confirm(`파일이 큽니다 (${mb}MB). 문서 파일이 그만큼 커집니다. 계속할까요?`)) return
    }
    let dataUri: string
    try {
      dataUri = await readFile(file)
    } catch {
      window.alert('이미지를 읽지 못했습니다')
      return
    }
    commit(buildImageBg(dataUri))
  }

  return (
    <>
      <label className="prop-row">
        배경 유형
        <select aria-label="배경 유형" value={mode} onChange={(e) => setMode(e.target.value as BgMode)}>
          <option value="solid">단색</option>
          <option value="gradient">그라데이션</option>
          <option value="image">이미지</option>
          {bg.kind === 'custom' && <option value="custom">사용자 지정</option>}
        </select>
      </label>
      {mode === 'custom' && <span className="notice-inline">사용자 지정 값 보존됨</span>}
      {mode === 'solid' && (
        <label className="prop-row">
          배경색
          <input
            type="color"
            aria-label="배경색"
            value={bgDraft ?? solidValue}
            onChange={(e) => setBgDraft(e.target.value)}
            onBlur={() => {
              if (bgDraft !== null && bgDraft !== solidValue) commit(bgDraft)
              setBgDraft(null)
            }}
          />
        </label>
      )}
      {mode === 'gradient' && (
        <>
          <label className="prop-row">
            시작 색
            <input type="color" aria-label="시작 색" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="prop-row">
            끝 색
            <input type="color" aria-label="끝 색" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="prop-row">
            방향
            <select aria-label="방향" value={String(angle)} onChange={(e) => setAngle(Number(e.target.value) as BgAngle)}>
              <option value="180">아래로</option>
              <option value="90">오른쪽으로</option>
              <option value="0">위로</option>
              <option value="270">왼쪽으로</option>
            </select>
          </label>
          <div className="btn-row">
            <button type="button" onClick={() => commit(buildGradient(angle, from, to))}>적용</button>
          </div>
        </>
      )}
      {mode === 'image' && (
        <label className="prop-col">
          배경 이미지
          <input type="file" accept="image/*" aria-label="배경 이미지 선택" onChange={handleImageFile} />
        </label>
      )}
    </>
  )
}
```

`editor/src/panels/PropertiesPanel.tsx` 수정:

1. import 추가: `import { SlideBgSection } from './SlideBgSection.tsx'`
2. `bgDraft` 상태(24-25행)와 배경색 `<label className="prop-row">…</label>` 블록(41-55행) 제거 — 배경색 UI는 SlideBgSection이 담당
3. 제거한 자리에 삽입 (`<h2>슬라이드</h2>` 다음):

```tsx
        <SlideBgSection key={slide.id} doc={doc} slide={slide} dispatch={dispatch} />
```

(`key={slide.id}`가 슬라이드 전환 시 드래프트·모드 초기화를 보장)

`editor/src/app.css`의 `.prop-col textarea` 규칙 아래에 추가:

```css
.prop-col input[type="file"] { font-size: 12px; }
```

주의: 기존 PropertiesPanel.test.tsx의 배경색 테스트(aria-label `배경색`, blur 1회 커밋)는 SlideBgSection이 같은 라벨·동작을 제공하므로 무수정 통과해야 한다. 통과하지 않으면 구현을 고칠 것(테스트 수정 금지).

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/panels/SlideBgSection.test.tsx src/panels/PropertiesPanel.test.tsx && npm test && npm run typecheck`
Expected: 전부 PASS (기존 배경색 테스트 무수정 통과 포함)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/panels/SlideBgSection.tsx editor/src/panels/SlideBgSection.test.tsx editor/src/panels/PropertiesPanel.tsx editor/src/file/fileAccess.ts editor/src/app.css
git commit -m "feat(editor): 슬라이드 배경 그라데이션·이미지 UI"
```

---

### Task 7: 레이아웃 팝오버 (SlidePanel + App)

**Files:**
- Modify: `editor/src/panels/SlidePanel.tsx` (새 슬라이드 버튼 → 레이아웃 팝오버, onAdd 시그니처 변경)
- Modify: `editor/src/App.tsx` (onAdd 핸들러가 레이아웃 elements로 addSlide)
- Modify: `editor/src/app.css`
- Test: `editor/src/panels/SlidePanel.test.tsx` (기존 '새 슬라이드' 테스트 갱신 + 신규)

**Interfaces:**
- Consumes: Task 2의 `LAYOUTS`, `addSlide(doc, idGen, index, elements)`
- Produces: `SlidePanel`의 `onAdd: (layoutKey: string) => void` (기존 `() => void`에서 변경)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/SlidePanel.test.tsx`의 기존 '새 슬라이드' 클릭 테스트(58행 근처)를 아래로 교체하고 신규 추가 (파일의 기존 렌더 헬퍼 관례 유지 — onAdd mock의 시그니처만 `(key: string) => void`로):

```tsx
test('새 슬라이드 버튼은 레이아웃 팝오버를 열고, 선택 시 키를 전달한다', () => {
  const onAdd = vi.fn()
  const { getByRole, queryByRole } = renderPanel({ onAdd })  // 파일의 기존 렌더 헬퍼 사용
  expect(queryByRole('menu')).toBeNull()
  fireEvent.click(getByRole('button', { name: '새 슬라이드' }))
  expect(getByRole('menu')).toBeTruthy()
  fireEvent.click(getByRole('menuitem', { name: '제목+본문' }))
  expect(onAdd).toHaveBeenCalledWith('title-body')
  expect(queryByRole('menu')).toBeNull()
})

test('레이아웃 팝오버는 빈 장을 포함해 4종을 보여준다', () => {
  const { getByRole, getAllByRole } = renderPanel({})
  fireEvent.click(getByRole('button', { name: '새 슬라이드' }))
  expect(getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['빈 장', '표지', '제목+본문', '2단'])
})
```

주의: SlidePanel.test.tsx에 렌더 헬퍼가 없으면 기존 테스트의 렌더 방식을 그대로 따르되 onAdd mock 시그니처만 바꾼다. 기존 테스트 중 '새 슬라이드' 클릭이 onAdd 즉시 호출을 기대하는 부분은 위 교체가 대체한다.

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/panels/SlidePanel.test.tsx`
Expected: 신규/교체 테스트 FAIL

- [ ] **Step 3: SlidePanel 구현**

`editor/src/panels/SlidePanel.tsx` 수정:

1. import 변경: `import { useEffect, useRef, useState } from 'react'`, `import { LAYOUTS } from '../model/layouts.ts'`
2. props의 `onAdd: () => void` → `onAdd: (layoutKey: string) => void`
3. 컴포넌트에 팝오버 상태 추가:

```tsx
  const [layoutOpen, setLayoutOpen] = useState(false)
  const layoutRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!layoutOpen) return
    const onOutside = (e: PointerEvent) => {
      if (layoutRef.current && !layoutRef.current.contains(e.target as Node)) setLayoutOpen(false)
    }
    window.addEventListener('pointerdown', onOutside)
    return () => window.removeEventListener('pointerdown', onOutside)
  }, [layoutOpen])
```

4. `<button type="button" onClick={onAdd}>새 슬라이드</button>` 를 다음으로 교체:

```tsx
        <div className="layout-popover-root" ref={layoutRef}>
          <button type="button" onClick={() => setLayoutOpen((o) => !o)}>새 슬라이드</button>
          {layoutOpen && (
            <div className="layout-popover" role="menu">
              {LAYOUTS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setLayoutOpen(false)
                    onAdd(l.key)
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 4: App 연결**

`editor/src/App.tsx`:

1. import 추가: `import { LAYOUTS } from './model/layouts.ts'`
2. SlidePanel의 `onAdd` 핸들러 교체:

```tsx
            onAdd={(layoutKey) => {
              const layout = LAYOUTS.find((l) => l.key === layoutKey)
              if (!layout) return
              dispatch({
                type: 'APPLY_DOC',
                doc: addSlide(state.doc!, idGenRef.current, state.currentSlideIndex + 1, layout.build(idGenRef.current)),
              })
              dispatch({ type: 'SELECT_SLIDE', index: state.currentSlideIndex + 1 })
            }}
```

`editor/src/app.css` 끝에 추가:

```css
/* 레이아웃 선택 팝오버 */
.layout-popover-root { position: relative; display: inline-block; }
.layout-popover { position: absolute; top: calc(100% + 4px); left: 0; z-index: 30; display: flex; flex-direction: column; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; padding: 4px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12); min-width: 120px; }
.layout-popover button { font: inherit; font-size: 13px; text-align: left; padding: 6px 10px; border: none; background: none; border-radius: 4px; cursor: pointer; }
.layout-popover button:hover { background: #f3f4f6; }
```

- [ ] **Step 5: 통과 확인 + 영향 테스트 갱신**

Run: `cd editor && npm test && npm run typecheck`
Expected: SlidePanel 신규 테스트 PASS. 다른 테스트 파일(App.test.tsx 등)에서 '새 슬라이드' 클릭으로 즉시 추가를 기대하는 테스트가 있으면 클릭 후 `getByRole('menuitem', { name: '빈 장' })` 클릭을 추가하는 식으로 갱신 (기대 결과 자체는 유지 — 검증 약화 금지)

- [ ] **Step 6: 커밋**

```bash
git add editor/src/panels/SlidePanel.tsx editor/src/panels/SlidePanel.test.tsx editor/src/App.tsx editor/src/app.css
git commit -m "feat(editor): 새 슬라이드 레이아웃 팝오버 (빈 장/표지/제목+본문/2단)"
```

---

### Task 8: 시작 화면 — 썸네일·커스텀 템플릿·가져오기 + App 통합

**Files:**
- Modify: `editor/src/panels/StartScreen.tsx` (전면 개편)
- Modify: `editor/src/App.tsx` (커스텀 템플릿 상태·등록/가져오기/삭제 핸들러·handleStart 확장·상단바 버튼)
- Modify: `editor/src/app.css`
- Test: `editor/src/panels/StartScreen.test.tsx`, `editor/src/App.test.tsx`

**Interfaces:**
- Consumes: Task 4의 customTemplates.ts 전부, 기존 `SlideView`(slide/width/height/themeVars), `extractThemeVars`(canvas/styleFromModel.ts), `openHtmlFile`, `parseWebdeck`/`WebdeckParseError`, `checkRoundTrip`, `serializeWebdeck`, `normalizeRuntime`
- Produces: `StartScreen({ onStart, onOpen, customTemplates, onImport, onDeleteTemplate })`

**동작 계약:**
- 모든 카드(내장+커스텀)에 첫 슬라이드 썸네일. 파싱 실패 카드는 `미리보기 불가` 표시(카드 유지)
- 커스텀 카드: 클릭 시 시작, × 버튼(aria-label `템플릿 <이름> 삭제`) — confirm 후 삭제
- 등록: 상단바 `템플릿으로 등록` 버튼(doc 있을 때 활성) → prompt 이름(기본 파일명에서 확장자 제거) → 취소 무동작 → checkRoundTrip 실패 시 alert → saveCustomTemplate(직렬화본) → 용량 초과 alert → 성공 alert
- 가져오기: openHtmlFile → parseWebdeck 성공 시 파일명(확장자 제외)으로 등록, WebdeckParseError → alert `WebDeck 문서만 템플릿으로 등록할 수 있습니다`
- handleStart(key): 내장 TEMPLATES 우선, 없으면 커스텀 id로 조회 — 이후 기존 흐름(normalizeRuntime + START_DOC)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/StartScreen.test.tsx`에 추가 (기존 테스트·렌더 방식 유지, props가 늘었으므로 기존 렌더 호출에 `customTemplates={[]} onImport={() => {}} onDeleteTemplate={() => {}}` 를 보강):

```tsx
const CUSTOM = {
  id: 'tc1',
  label: '회사 표준',
  savedAt: '2026-07-04T00:00:00.000Z',
  html: `<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>c</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:400px; height:80px;"><p>커스텀 첫 장</p></div></section>
</main></body></html>`,
}

test('내장 템플릿 카드에 첫 슬라이드 썸네일이 렌더된다', () => {
  const { getAllByText } = renderStart()  // 파일의 기존 렌더 헬퍼(없으면 render 직접) 사용
  // minimal 템플릿 첫 장의 텍스트가 썸네일에 보인다
  expect(getAllByText('문서 제목').length).toBeGreaterThanOrEqual(1)
})

test('커스텀 템플릿 카드가 나타나고 클릭 시 id로 시작한다', () => {
  const onStart = vi.fn()
  const { getByText } = renderStart({ onStart, customTemplates: [CUSTOM] })
  fireEvent.click(getByText('회사 표준'))
  expect(onStart).toHaveBeenCalledWith('tc1')
})

test('커스텀 카드 삭제 버튼은 onDeleteTemplate을 부른다', () => {
  const onDeleteTemplate = vi.fn()
  const { getByLabelText } = renderStart({ customTemplates: [CUSTOM], onDeleteTemplate })
  fireEvent.click(getByLabelText('템플릿 회사 표준 삭제'))
  expect(onDeleteTemplate).toHaveBeenCalledWith('tc1')
})

test('파싱 불가 커스텀 템플릿은 미리보기 불가로 표시하되 카드는 유지한다', () => {
  const broken = { ...CUSTOM, id: 'tb', label: '깨진 것', html: '<html><body>x</body></html>' }
  const { getByText } = renderStart({ customTemplates: [broken] })
  expect(getByText('미리보기 불가')).toBeTruthy()
  expect(getByText('깨진 것')).toBeTruthy()
})

test('파일에서 템플릿 가져오기 버튼이 onImport를 부른다', () => {
  const onImport = vi.fn()
  const { getByRole } = renderStart({ onImport })
  fireEvent.click(getByRole('button', { name: /파일에서 템플릿 가져오기/ }))
  expect(onImport).toHaveBeenCalled()
})
```

`editor/src/App.test.tsx`에 추가:

```tsx
test('템플릿으로 등록 → 시작 화면 노출 → 그 템플릿으로 새 문서', async () => {
  localStorage.clear()
  const promptSpy = vi.fn(() => '우리 팀 표준')
  ;(window as unknown as { prompt?: typeof promptSpy }).prompt = promptSpy
  window.alert = vi.fn()
  stubFilePicker('base.html', VALID_DOC)
  const { unmount } = render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '템플릿으로 등록' }))
  expect(promptSpy).toHaveBeenCalled()
  unmount()
  // 새로 렌더한 앱의 시작 화면에 커스텀 템플릿이 보이고, 그걸로 시작할 수 있다
  render(<App />)
  await userEvent.click(await screen.findByText('우리 팀 표준'))
  expect(await screen.findByText('제목 없음.html')).toBeTruthy()
  expect((await screen.findAllByText('첫 슬라이드 제목')).length).toBeGreaterThanOrEqual(1)
  localStorage.clear()
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/panels/StartScreen.test.tsx src/App.test.tsx`
Expected: 신규 테스트 FAIL

- [ ] **Step 3: StartScreen 구현**

`editor/src/panels/StartScreen.tsx` 전체 교체:

```tsx
import { useMemo } from 'react'
import { extractThemeVars } from '../canvas/styleFromModel.ts'
import { SlideView } from '../canvas/SlideView.tsx'
import type { CustomTemplate } from '../file/customTemplates.ts'
import { TEMPLATES } from '../file/templates.ts'
import { parseWebdeck } from '../model/parse.ts'

const CARD_THUMB_WIDTH = 148

function TemplateThumb({ html }: { html: string }) {
  const preview = useMemo(() => {
    try {
      const doc = parseWebdeck(html)
      const slide = doc.slides[0]
      if (!slide) return null
      return { slide, width: doc.slideWidth, height: doc.slideHeight, themeVars: extractThemeVars(doc.headExtra) }
    } catch {
      return null
    }
  }, [html])
  if (!preview) return <div className="card-thumb card-thumb-error">미리보기 불가</div>
  const scale = CARD_THUMB_WIDTH / preview.width
  return (
    <div className="card-thumb" style={{ width: CARD_THUMB_WIDTH, height: preview.height * scale }} aria-hidden="true">
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <SlideView slide={preview.slide} width={preview.width} height={preview.height} themeVars={preview.themeVars} />
      </div>
    </div>
  )
}

export function StartScreen({
  onStart,
  onOpen,
  customTemplates,
  onImport,
  onDeleteTemplate,
}: {
  onStart: (key: string) => void
  onOpen: () => void
  customTemplates: CustomTemplate[]
  onImport: () => void
  onDeleteTemplate: (id: string) => void
}) {
  return (
    <main className="canvas-area">
      <div className="start-screen">
        <h2>시작하기</h2>
        <div className="start-cards">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="start-card" onClick={() => onStart(t.key)}>
              <TemplateThumb html={t.html} />
              <strong>{t.label}</strong>
              <span>{t.description}</span>
            </button>
          ))}
          {customTemplates.map((t) => (
            <div key={t.id} className="start-card custom-card">
              <button type="button" className="card-main" onClick={() => onStart(t.id)}>
                <TemplateThumb html={t.html} />
                <strong>{t.label}</strong>
                <span>내 템플릿</span>
              </button>
              <button
                type="button"
                className="card-delete"
                aria-label={`템플릿 ${t.label} 삭제`}
                onClick={() => onDeleteTemplate(t.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="start-open" onClick={onImport}>파일에서 템플릿 가져오기…</button>
        <button type="button" className="start-open" onClick={onOpen}>기존 문서 열기…</button>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: App 통합**

`editor/src/App.tsx` 수정:

1. import 추가:

```tsx
import { listCustomTemplates, removeCustomTemplate, saveCustomTemplate } from './file/customTemplates.ts'
import type { CustomTemplate } from './file/customTemplates.ts'
```

2. 컴포넌트 상태 추가 (docFile 근처):

```tsx
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>(listCustomTemplates)
```

3. `handleStart` 교체 — 내장·커스텀 통합 조회 (내부의 기존 파싱·디스패치 로직은 그대로):

```tsx
  function handleStart(key: string) {
    if (!confirmDiscard()) return
    const template = TEMPLATES.find((t) => t.key === key) ?? customTemplates.find((t) => t.id === key)
    if (!template) return
    try {
      const doc = normalizeRuntime(parseWebdeck(template.html))
      dispatch({ type: 'START_DOC', doc, fileName: '제목 없음.html' })
    } catch {
      dispatch({ type: 'OPEN_ERROR', message: '템플릿을 불러올 수 없습니다' })
    }
  }
```

4. 핸들러 3개 추가 (handleDownloadFallback 아래):

```tsx
  function handleRegisterTemplate() {
    const { doc, fileName } = state
    if (!doc) return
    const problem = checkRoundTrip(doc)
    if (problem) {
      window.alert(`템플릿 등록 중단: ${problem}`)
      return
    }
    const suggested = (fileName ?? '내 템플릿').replace(/\.html?$/i, '')
    const name = window.prompt('템플릿 이름', suggested)
    if (name === null || name.trim() === '') return
    try {
      saveCustomTemplate(name.trim(), serializeWebdeck(doc))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '템플릿을 저장하지 못했습니다')
      return
    }
    setCustomTemplates(listCustomTemplates())
    window.alert(`템플릿 "${name.trim()}"을(를) 등록했습니다`)
  }

  async function handleImportTemplate() {
    let opened
    try {
      opened = await openHtmlFile()
    } catch {
      window.alert('파일을 여는 중 오류가 발생했습니다')
      return
    }
    if (!opened) return
    try {
      parseWebdeck(opened.text)
    } catch (e) {
      window.alert(e instanceof WebdeckParseError ? 'WebDeck 문서만 템플릿으로 등록할 수 있습니다' : '문서를 해석할 수 없습니다')
      return
    }
    try {
      saveCustomTemplate(opened.name.replace(/\.html?$/i, ''), opened.text)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '템플릿을 저장하지 못했습니다')
      return
    }
    setCustomTemplates(listCustomTemplates())
  }

  function handleDeleteTemplate(id: string) {
    if (!window.confirm('이 템플릿을 삭제할까요?')) return
    removeCustomTemplate(id)
    setCustomTemplates(listCustomTemplates())
  }
```

5. 상단바에 버튼 추가 (`다른 이름으로 저장` 버튼 다음):

```tsx
        <button type="button" disabled={!state.doc} onClick={handleRegisterTemplate}>템플릿으로 등록</button>
```

6. StartScreen 렌더 교체:

```tsx
        <StartScreen
          onStart={handleStart}
          onOpen={handleOpen}
          customTemplates={customTemplates}
          onImport={handleImportTemplate}
          onDeleteTemplate={handleDeleteTemplate}
        />
```

`editor/src/app.css`의 `.start-card` 규칙들 근처에 추가:

```css
.card-thumb { border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; background: #fff; position: relative; }
.card-thumb-error { display: flex; align-items: center; justify-content: center; width: 148px; height: 83px; font-size: 12px; color: #9ca3af; }
.custom-card { position: relative; padding: 0; border: 1px solid #d1d5db; }
.custom-card .card-main { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 20px 16px; font: inherit; text-align: left; background: none; border: none; cursor: pointer; }
.card-delete { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border: none; border-radius: 50%; background: #f3f4f6; color: #6b7280; font-size: 14px; line-height: 1; cursor: pointer; }
.card-delete:hover { background: #fee2e2; color: #b91c1c; }
```

주의: happy-dom에 `window.prompt`/`window.alert`가 없으면 App.test.tsx 상단의 confirm 채움 관례처럼 채운다 (`if (!window.alert) window.alert = () => {}` 등). StartScreen.test.tsx의 기존 테스트가 새 필수 props 때문에 깨지면 렌더 호출에 기본 props를 보강한다 (기대 결과는 유지).

- [ ] **Step 5: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add editor/src/panels/StartScreen.tsx editor/src/panels/StartScreen.test.tsx editor/src/App.tsx editor/src/App.test.tsx editor/src/app.css
git commit -m "feat(editor): 시작 화면 썸네일·커스텀 템플릿 등록/가져오기/삭제"
```

---

### Task 9: 문서 갱신과 최종 검증

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-webdeck-design.md` (§12 이력 추가)
- Modify: `README.md`
- Modify: `docs/roadmap.md` (Plan 7 완료 표시)

- [ ] **Step 1: 마스터 스펙 §12 목록 끝(Plan 6 항목 다음)에 추가**

```markdown
- **Plan 7 — 테마·레이아웃·템플릿 (2026-07-04)**: 문서 테마 편집(--wd-* 색 4종·폰트 2종을 headExtra :root 블록 문자열 외과 수술로 교체, 프리셋 4종 = 1 undo 스텝), 새 슬라이드 레이아웃 4종(빈 장/표지/제목+본문/2단 — var(--wd-*) 참조로 테마 추종), 커스텀 템플릿(localStorage `webdeck.templates` + 파일 가져오기 + 시작 화면 카드·삭제), 시작 화면 첫 슬라이드 썸네일, 슬라이드 배경 그라데이션·이미지(data-bg 값 규약 — 포맷 확장 없음). 상세: `2026-07-04-webdeck-theme-design.md`
```

- [ ] **Step 2: README 갱신**

"현재 제공"의 "발표 모드" 항목 다음에 추가:

```markdown
- **테마·템플릿** — 문서 테마(강조색·폰트) 일괄 변경과 프리셋 4종, 새 슬라이드 레이아웃 선택(표지/제목+본문/2단), 현재 문서를 템플릿으로 등록해 시작 화면에서 재사용(썸네일 포함), 슬라이드 배경 그라데이션·이미지
```

"## 로드맵" 섹션의 완료 줄에서 `~~Plan 6: 발표 모드·런타임 갱신~~ (완료)` 를 `~~Plan 6: 발표 모드·런타임 갱신~~ · ~~Plan 7: 테마·레이아웃·템플릿~~ (완료)` 로 교체하고, "이후 계획" 줄에서 `테마, ` 를 제거한다.

- [ ] **Step 3: roadmap.md 갱신**

`### Plan 7 — 테마·레이아웃·템플릿` 제목을 `### Plan 7 — 테마·레이아웃·템플릿 ✅ (완료)` 로 바꾸고 문단 끝에 추가:

```markdown
— 2026-07-04 완료. 슬라이드 크기 변경(4:3/A4)은 유예 유지, 슬라이드 노트는 Plan 6에서 data-notes로 선반영됨.
```

- [ ] **Step 4: 전체 검증**

Run (리포 루트): `npm run test:all && cd editor && npm run typecheck && npm run build`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add docs/superpowers/specs/2026-07-02-webdeck-design.md README.md docs/roadmap.md
git commit -m "docs: Plan 7 이력·README·로드맵 갱신"
```

---

## 알려진 한계 (구현하지 않음 — 스펙 §1·§6)

- 테마 변수 없는 문서에 변수 주입 없음 (안내만)
- 커스텀 템플릿은 브라우저별 저장 (공유는 파일 전달 + 가져오기)
- 배경 이미지 data URI로 문서 파일이 커짐 (2MB 초과 시 확인)
- 비규약 배경 값(방사형 그라데이션 등)은 편집 불가·보존만

## 수동 확인 (사람 확인 — 머지 후)

1. 문서 열기 → 속성 패널(선택 없음)에서 프리셋 클릭 → 전체 색이 한 번에 바뀌고 Ctrl+Z 1회로 복원
2. 새 슬라이드 → 레이아웃 4종 각각 추가 → 테마 색을 바꾸면 레이아웃 요소 색도 따라감
3. 문서를 템플릿으로 등록 → 새 탭/재시작 후 시작 화면에 썸네일과 함께 표시 → 그걸로 새 문서
4. 배경 그라데이션·이미지 지정 → 저장 → 브라우저·발표 모드에서 배경 확인 → validate 통과
5. 다른 PC 공유 시나리오: 등록된 템플릿 html을 파일로 저장해 전달 → 받은 쪽에서 "파일에서 템플릿 가져오기"
