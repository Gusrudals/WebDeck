# WebDeck 에디터 UI — 뷰어 기반 구현 계획 (Plan 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문서를 열어 캔버스에서 보고 슬라이드를 탐색하는 React 뷰어 앱을 만든다. 먼저 Plan 2 백로그 1순위인 왕복 보존 갭(파서가 검증기-통과 문서의 일부 내용을 유실)을 해소한다.

**Architecture:** Plan 2의 headless 코어 위에 React UI를 얹는다. 상태는 useReducer 기반 순수 리듀서(테스트 용이), 렌더링은 모델 → React 컴포넌트(SlideView/ElementView), 줌은 transform scale. 파일 열기는 File System Access API + input 폴백. 편집 상호작용(드래그/리사이즈/텍스트 편집/저장)은 Plan 3b. 스펙: `docs/superpowers/specs/2026-07-02-webdeck-design.md` §6.3, 백로그: `docs/plan-3-backlog.md`

**Tech Stack:** 기존 editor 패키지에 추가 — dependencies: `react`, `react-dom`. devDependencies 추가: `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@testing-library/react`, `@testing-library/user-event`. 테스트는 계속 Vitest + happy-dom.

**전체 로드맵:** Plan 1(완료) → Plan 2(완료) → **Plan 3a(본 문서: 뷰어 기반)** → Plan 3b(편집 상호작용 + 저장, 3a 완료 후 별도 작성)

## Global Constraints

- Node 22+, TypeScript strict (기존 tsconfig 유지, `jsx: "react-jsx"`만 추가)
- editor 런타임 의존성은 `react`/`react-dom`만. 상태 관리·스타일링 라이브러리 금지 (useReducer + 일반 CSS)
- 모델 계층(`src/model/`)의 기존 공개 API 시그니처는 깨지 않는다 — 단 Task 1의 타입 확장(`Slide.extraAttrs`, `DeckDoc.bodyAttrs`/`bodyExtra`)은 계획된 예외이며, 왕복 계약 3종(모델 보존/문자열 고정점/검증기 0·0)은 반드시 유지
- 사용자에게 보이는 모든 문구는 한국어
- 커밋: conventional commits + 마지막 줄 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 테스트: `cd editor && npm test`(vitest run) + `npm run typecheck`. 루트 `npm run test:all`은 태스크 완료 시점마다 전체 통과 유지
- **알려진 환경 이슈**: Vitest happy-dom에서 `fileURLToPath(new URL(...))`가 URL 스킴 TypeError를 던진다 — 테스트의 파일 경로는 기존 테스트들처럼 `import.meta.dirname` 폴백 패턴 사용
- UI 컴포넌트 테스트는 @testing-library/react로 실제 사용자 관점(텍스트/역할/클릭) 검증. vite.config의 `test.globals: true`는 RTL 자동 cleanup을 위해 필요

---

### Task 1: 왕복 보존 강화 (코어)

**Files:**
- Modify: `editor/src/model/types.ts`
- Modify: `editor/src/model/parse.ts`
- Modify: `editor/src/model/serialize.ts`
- Modify: `editor/src/model/ops.ts` (addSlide/duplicateSlide의 새 필드 처리)
- Modify: `editor/src/model/ops.test.ts` (fixture에 새 필수 필드 추가)
- Modify: `editor/src/model/history.test.ts` (doc 헬퍼에 새 필수 필드 추가)
- Test: `editor/src/model/preservation.test.ts` (신규 — 보존 회귀 테스트)

**Interfaces:**
- Consumes: Plan 2의 모델 전체
- Produces (타입 확장):
  - `Slide.extraAttrs: Record<string, string>` — `class`/`data-bg` 외 section 속성 보존
  - `DeckDoc.bodyAttrs: Record<string, string>` — `<body>` 속성 보존
  - `DeckDoc.bodyExtra: string` — body 직속의 main/script 외 요소 원문 보존 (직렬화 시 `</main>` 뒤, script 앞에 출력)
  - 파서 opaque 폴백 강화: el-image에 img 외 자식·비공백 텍스트·`src/alt/style` 외 img 속성이 있으면, el-shape에 자식(요소 또는 비공백 텍스트)이 있으면 → 요소 전체를 opaque로 보존
  - **명시적 비목표**: deck/slide 수준의 HTML 주석은 보존하지 않는다 (검증기도 무시함 — 본 계획에서 문서화로 확정)

- [ ] **Step 1: 실패하는 보존 회귀 테스트 작성**

`editor/src/model/preservation.test.ts` (Plan 2 최종 리뷰의 프로브 P1~P7 회귀화):

```ts
import { describe, expect, test } from 'vitest'
import { parseWebdeck } from './parse.ts'
import { serializeWebdeck } from './serialize.ts'

function doc(body: string, bodyAttrs = ''): string {
  return `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title><style>.el{position:absolute}</style></head>
<body${bodyAttrs}>
<main class="deck" data-slide-width="1280" data-slide-height="720">${body}</main>
<script>/* v */</script>
</body>
</html>`
}

const BASIC_SLIDE = `<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>a</p></div></section>`

describe('왕복 보존 강화', () => {
  test('슬라이드의 커스텀 속성이 보존된다 (P7)', () => {
    const html = doc(`<section class="slide" data-bg="#ffffff" data-custom="x" id="s1"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>a</p></div></section>`)
    const m = parseWebdeck(html)
    expect(m.slides[0]!.extraAttrs).toEqual({ 'data-custom': 'x', id: 's1' })
    const out = serializeWebdeck(m)
    expect(out).toContain('data-custom="x"')
    expect(out).toContain('id="s1"')
    expect(parseWebdeck(out)).toEqual(m)
  })

  test('body 속성이 보존된다 (P1)', () => {
    const m = parseWebdeck(doc(BASIC_SLIDE, ' class="corp" data-env="prod"'))
    expect(m.bodyAttrs).toEqual({ class: 'corp', 'data-env': 'prod' })
    const out = serializeWebdeck(m)
    expect(out).toContain('<body class="corp" data-env="prod">')
    expect(parseWebdeck(out)).toEqual(m)
  })

  test('body 수준의 main/script 외 요소가 보존된다 (P1b)', () => {
    const extra = '<div class="watermark">사내용</div>'
    const html = doc(BASIC_SLIDE).replace('<script>', `${extra}\n<script>`)
    const m = parseWebdeck(html)
    expect(m.bodyExtra).toContain('watermark')
    const out = serializeWebdeck(m)
    expect(out).toContain(extra)
    expect(parseWebdeck(out)).toEqual(m)
  })

  test('img의 부가 속성이 있으면 el-image 전체가 opaque로 보존된다 (P2)', () => {
    const raw = `<div class="el el-image" style="left:0px; top:0px; width:100px; height:100px;"><img src="data:image/png;base64,AAA=" alt="a" loading="lazy" data-credit="x"></div>`
    const m = parseWebdeck(doc(`<section class="slide">${raw}</section>`))
    expect(m.slides[0]!.elements[0]!.type).toBe('opaque')
    expect(serializeWebdeck(m)).toContain('data-credit="x"')
  })

  test('el-image의 img 외 자식이 있으면 opaque로 보존된다 (P2b)', () => {
    const raw = `<div class="el el-image" style="left:0px; top:0px; width:100px; height:100px;"><img src="data:image/png;base64,AAA=" alt="a"><figcaption>캡션</figcaption></div>`
    const m = parseWebdeck(doc(`<section class="slide">${raw}</section>`))
    expect(m.slides[0]!.elements[0]!.type).toBe('opaque')
    expect(serializeWebdeck(m)).toContain('캡션')
  })

  test('el-shape의 자식이 있으면 opaque로 보존된다 (P3)', () => {
    const raw = `<div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:100px; height:100px;"><span>내용</span></div>`
    const m = parseWebdeck(doc(`<section class="slide">${raw}</section>`))
    expect(m.slides[0]!.elements[0]!.type).toBe('opaque')
    expect(serializeWebdeck(m)).toContain('<span>내용</span>')
  })

  test('부가 정보가 없는 문서는 기존과 동일하게 파싱된다 (회귀 없음)', () => {
    const m = parseWebdeck(doc(BASIC_SLIDE))
    expect(m.slides[0]!.elements[0]!.type).toBe('text')
    expect(m.slides[0]!.extraAttrs).toEqual({})
    expect(m.bodyAttrs).toEqual({})
    expect(m.bodyExtra).toBe('')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd editor && npm test`
Expected: FAIL — preservation.test.ts 실패 (extraAttrs 등 미존재), 기존 테스트도 타입 오류 발생 가능

- [ ] **Step 3: 타입 확장**

`editor/src/model/types.ts` — `Slide`와 `DeckDoc`을 다음으로 교체:

```ts
export interface Slide {
  id: string
  bg: string | null
  /** class/data-bg 외의 section 속성 — 왕복 보존 */
  extraAttrs: Record<string, string>
  elements: SlideElement[]
}

export interface DeckDoc {
  title: string
  slideWidth: number
  slideHeight: number
  /** <head>에서 <title>/<meta charset>을 제외한 원문 (뷰어 CSS 포함) — 왕복 보존 */
  headExtra: string
  /** <body> 태그의 속성 — 왕복 보존 */
  bodyAttrs: Record<string, string>
  /** <body> 직속의 main/script 외 요소 원문 — 왕복 보존 */
  bodyExtra: string
  /** <body> 직속 <script> 원문 (뷰어 스크립트) — 왕복 보존 */
  bodyScript: string
  /** <html> 태그의 속성 전부 (lang, data-webdeck-version 등) */
  htmlAttrs: Record<string, string>
  slides: Slide[]
}
```

- [ ] **Step 4: 파서 강화**

`editor/src/model/parse.ts` 수정:

`parseWebdeck`의 body 처리 부분(`const bodyScript = ...`)을 다음으로 교체:

```ts
  const bodyAttrs: Record<string, string> = {}
  for (const attr of Array.from(dom.body.attributes)) bodyAttrs[attr.name] = attr.value

  const bodyChildren = Array.from(dom.body.children)
  const bodyScript = bodyChildren
    .filter((c) => c.tagName === 'SCRIPT')
    .map((s) => s.outerHTML)
    .join('\n')
  const bodyExtra = bodyChildren
    .filter((c) => c.tagName !== 'SCRIPT' && c !== deck)
    .map((c) => c.outerHTML)
    .join('\n')
```

return 문을 다음으로 교체:

```ts
  return { title, slideWidth, slideHeight, headExtra, bodyAttrs, bodyExtra, bodyScript, htmlAttrs, slides }
```

`parseSlide`를 다음으로 교체:

```ts
function parseSlide(section: Element, idGen: () => string): Slide {
  const id = idGen()
  const extraAttrs: Record<string, string> = {}
  for (const attr of Array.from(section.attributes)) {
    if (attr.name === 'class' || attr.name === 'data-bg') continue
    extraAttrs[attr.name] = attr.value
  }
  const elements = Array.from(section.children).map((el) => parseElement(el, idGen))
  return { id, bg: section.getAttribute('data-bg'), extraAttrs, elements }
}
```

`parseElement`의 el-image 분기를 다음으로 교체:

```ts
  if (el.classList.contains('el-image')) {
    const imgs = el.querySelectorAll('img')
    const img = imgs.length === 1 ? imgs[0] : null
    if (!img) return opaque()
    const IMG_ATTRS = ['src', 'alt', 'style']
    const hasExtraImgAttrs = Array.from(img.attributes).some((a) => !IMG_ATTRS.includes(a.name))
    const hasExtraChildren = Array.from(el.children).some((c) => c !== img)
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
    if (hasExtraImgAttrs || hasExtraChildren || hasText) return opaque()
    return {
      type: 'image',
      id,
      frame,
      extraStyle,
      extraAttrs,
      src: img.getAttribute('src') ?? '',
      alt: img.getAttribute('alt') ?? '',
      imgStyle: img.getAttribute('style') ?? '',
    }
  }
```

el-shape 분기를 다음으로 교체:

```ts
  if (el.classList.contains('el-shape')) {
    if (el.getAttribute('data-shape') !== 'rect') return opaque()
    const hasChildren = el.children.length > 0
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
    if (hasChildren || hasText) return opaque()
    return { type: 'shape', id, frame, extraStyle, extraAttrs, shape: 'rect' }
  }
```

- [ ] **Step 5: 직렬화 강화**

`editor/src/model/serialize.ts` 수정:

`serializeWebdeck`을 다음으로 교체:

```ts
export function serializeWebdeck(doc: DeckDoc): string {
  const htmlAttrs = attrsString(doc.htmlAttrs)
  const bodyAttrs = attrsString(doc.bodyAttrs)
  const slides = doc.slides.map(serializeSlide).join('\n\n')
  const bodyExtra = doc.bodyExtra ? `\n${doc.bodyExtra}` : ''
  const bodyScript = doc.bodyScript ? `\n${doc.bodyScript}` : ''

  return `<!DOCTYPE html>
<html${htmlAttrs}>
<head>
<meta charset="utf-8">
<title>${escapeText(doc.title)}</title>
${doc.headExtra}
</head>
<body${bodyAttrs}>
<main class="deck" data-slide-width="${doc.slideWidth}" data-slide-height="${doc.slideHeight}">

${slides}

</main>${bodyExtra}${bodyScript}
</body>
</html>
`
}

function attrsString(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join('')
}
```

`serializeSlide`를 다음으로 교체:

```ts
function serializeSlide(slide: Slide): string {
  const bg = slide.bg === null ? '' : ` data-bg="${escapeAttr(slide.bg)}"`
  const extra = attrsString(slide.extraAttrs)
  const els = slide.elements.map((el) => `    ${serializeElement(el)}`).join('\n')
  const body = els ? `\n${els}\n  ` : '\n  '
  return `  <section class="slide"${bg}${extra}>${body}</section>`
}
```

(기존 `extraAttrsSuffix`는 요소용으로 그대로 두고, `attrsString`과 중복되면 `extraAttrsSuffix`를 `attrsString(el.extraAttrs)` 호출로 교체)

- [ ] **Step 6: ops와 기존 테스트 픽스처 갱신**

`editor/src/model/ops.ts`:
- `addSlide`의 슬라이드 생성을 `{ id: idGen(), bg: '#ffffff', extraAttrs: {}, elements: [] }`로 교체
- `duplicateSlide`의 copy 생성에 `extraAttrs: { ...src.extraAttrs },` 추가

`editor/src/model/ops.test.ts`의 fixture:
- slide 리터럴에 `extraAttrs: {},` 추가
- doc 리터럴에 `bodyAttrs: {}, bodyExtra: '',` 추가

`editor/src/model/history.test.ts`의 `doc()` 헬퍼:
- 반환 객체에 `bodyAttrs: {}, bodyExtra: '',` 추가

- [ ] **Step 7: 전체 테스트 통과 확인**

Run: `cd editor && npm test && npm run typecheck && cd .. && npm run test:all`
Expected: PASS — 신규 보존 테스트 7개 포함 전체 통과, 기존 왕복 계약 3종(serialize.test.ts) 그대로 통과

- [ ] **Step 8: 커밋**

```bash
git add editor/src/model/
git commit -m "feat: 왕복 보존 강화 — 슬라이드/바디 속성 보존, el-image·el-shape opaque 폴백

deck/slide 수준 HTML 주석 보존은 비목표로 확정 (검증기도 무시)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: ops 정리 (백로그 소소한 항목)

**Files:**
- Modify: `editor/src/model/ops.ts`
- Modify: `editor/src/model/ops.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 반영된 ops
- Produces: `moveElementZ`가 경계 no-op일 때 입력 doc을 **같은 참조로** 반환 (히스토리 통합 시 빈 undo 방지)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/ops.test.ts`의 `moveElementZ` 테스트 안에 추가:

```ts
    expect(moveElementZ(doc, 'wd-1', 'wd-2', 'backward')).toBe(doc) // 경계 no-op은 같은 참조
```

`슬라이드 커맨드` describe에 테스트 추가:

```ts
  test('moveSlide 범위 초과는 오류', () => {
    const doc = fixture()
    expect(() => moveSlide(doc, 0, 5)).toThrow('범위를 벗어났습니다')
    expect(() => moveSlide(doc, -1, 0)).toThrow('범위를 벗어났습니다')
  })
```

Run: `cd editor && npm test`
Expected: FAIL — `toBe(doc)` 실패 (현재는 새 doc 객체 반환). moveSlide 테스트는 통과할 수 있음(구현 이미 존재 — 커버리지 추가 목적)

- [ ] **Step 2: moveElementZ 수정**

`editor/src/model/ops.ts`의 `moveElementZ`를 다음으로 교체:

```ts
export function moveElementZ(doc: DeckDoc, slideId: string, elementId: string, dir: ZDirection): DeckDoc {
  const si = slideIndexOf(doc, slideId)
  const slide = doc.slides[si]!
  const i = elementIndexOf(slide, elementId)
  const target = { forward: i + 1, backward: i - 1, front: slide.elements.length - 1, back: 0 }[dir]
  const clamped = Math.max(0, Math.min(slide.elements.length - 1, target))
  if (clamped === i) return doc
  const elements = slide.elements.slice()
  const [el] = elements.splice(i, 1)
  elements.splice(clamped, 0, el!)
  const slides = doc.slides.slice()
  slides[si] = { ...slide, elements }
  return { ...doc, slides }
}
```

- [ ] **Step 3: README 문구 수정**

`README.md`의 사용법 코드 블록에서 `npm test             # 전체 테스트` 줄을 다음으로 교체:

```
npm run test:all     # 전체 테스트 (tools + editor)
```

- [ ] **Step 4: 테스트 통과 확인 및 커밋**

Run: `cd editor && npm test && npm run typecheck`
Expected: PASS

```bash
git add editor/src/model/ README.md
git commit -m "fix: moveElementZ 경계 no-op은 같은 doc 참조 반환, 테스트 보강

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: React/Vite 앱 셸

**Files:**
- Modify: `editor/package.json` (deps + dev/build 스크립트)
- Modify: `editor/tsconfig.json` (jsx)
- Create: `editor/vite.config.ts`
- Delete: `editor/vitest.config.ts` (vite.config.ts로 통합)
- Create: `editor/index.html`
- Create: `editor/src/main.tsx`
- Create: `editor/src/App.tsx` (뼈대 — Task 7에서 전체 교체)
- Create: `editor/src/app.css`
- Test: `editor/src/App.test.tsx`

**Interfaces:**
- Consumes: 없음 (UI 계층 첫 태스크)
- Produces: `npm run dev`로 뜨는 앱 골격 (상단바 + 좌측 패널 자리 + 캔버스 자리), 이후 태스크가 쓰는 CSS 클래스 계약: `.app`/`.topbar`/`.side`/`.canvas-area`/`.slide-view`/`.thumb`/`.empty-state`/`.notice`/`.error`

- [ ] **Step 1: 의존성 설치와 설정**

editor/에서:

```bash
cd editor && npm install react react-dom && npm install -D vite @vitejs/plugin-react @types/react @types/react-dom @testing-library/react @testing-library/user-event
```

`editor/package.json`의 scripts를 다음으로 교체:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
```

`editor/tsconfig.json`의 compilerOptions에 추가: `"jsx": "react-jsx"`

`editor/vite.config.ts` 생성:

```ts
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'happy-dom', globals: true },
})
```

`editor/vitest.config.ts` 삭제:

```bash
git rm editor/vitest.config.ts
```

- [ ] **Step 2: 실패하는 스모크 테스트 작성**

`editor/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { App } from './App.tsx'

test('앱 셸이 렌더링된다', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'WebDeck 에디터' })).toBeTruthy()
  expect(screen.getByText('문서를 열어 시작하세요')).toBeTruthy()
})
```

Run: `cd editor && npm test`
Expected: FAIL — `./App.tsx` 모듈 없음

- [ ] **Step 3: 셸 구현**

`editor/index.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WebDeck 에디터</title>
</head>
<body>
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

`editor/src/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './app.css'

createRoot(document.getElementById('root')!).render(<App />)
```

`editor/src/App.tsx` (뼈대):

```tsx
export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <h1>WebDeck 에디터</h1>
      </header>
      <aside className="side" />
      <main className="canvas-area">
        <p className="empty-state">문서를 열어 시작하세요</p>
      </main>
    </div>
  )
}
```

`editor/src/app.css`:

```css
:root {
  --wd-primary: #1a56db;
  --wd-accent: #e8f0fe;
  --wd-text: #1f2937;
  --wd-muted: #6b7280;
  --wd-font-heading: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
  --wd-font-body: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--wd-font-body); color: #1f2937; background: #f3f4f6; }

.app { display: grid; grid-template-rows: 48px 1fr; grid-template-columns: 208px 1fr; height: 100vh; }
.topbar { grid-column: 1 / 3; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: #fff; border-bottom: 1px solid #e5e7eb; }
.topbar h1 { font-size: 15px; margin: 0; font-weight: 600; }
.topbar button { font: inherit; padding: 6px 14px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer; }
.topbar button:hover { background: #f9fafb; }
.file-name { color: #6b7280; font-size: 13px; }
.notice { margin-left: auto; font-size: 12px; color: #92400e; background: #fef3c7; padding: 4px 8px; border-radius: 4px; }
.error { margin-left: auto; font-size: 12px; color: #b91c1c; }

.side { background: #fff; border-right: 1px solid #e5e7eb; overflow-y: auto; padding: 12px; }
.canvas-area { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.empty-state { color: #6b7280; font-size: 14px; }

.slide-view { position: relative; background: #fff; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); flex: none; }
.slide-view .el-text p { margin: 0; }

.thumb { display: block; width: 100%; border: 2px solid transparent; border-radius: 4px; padding: 2px; margin-bottom: 8px; background: none; cursor: pointer; text-align: left; }
.thumb.selected { border-color: var(--wd-primary); }
.thumb-scale { position: relative; overflow: hidden; }
.thumb-num { font-size: 11px; color: #6b7280; }
```

- [ ] **Step 4: 테스트·타입체크·수동 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: PASS

Run: `cd editor && npm run dev` (백그라운드로 잠깐 띄워 브라우저에서 셸 확인 후 종료) 또는 `npm run build`
Expected: 빌드/구동 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add editor/
git commit -m "feat: React/Vite 앱 셸 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 에디터 상태 스토어

**Files:**
- Create: `editor/src/state/store.ts`
- Test: `editor/src/state/store.test.ts`

**Interfaces:**
- Consumes: `DeckDoc`, `createHistory`
- Produces:
  - `EditorState { doc, history, fileName, fileHandle, currentSlideIndex, opaqueCount, loadError }`
  - `initialEditorState: EditorState`
  - `editorReducer(state, action) → EditorState` — 액션: `OPEN_SUCCESS { doc, fileName, fileHandle }` / `OPEN_ERROR { message }` / `SELECT_SLIDE { index }` (인덱스는 범위로 클램프)
  - `countOpaque(doc) → number`
  - `fileHandle`은 Plan 3b의 저장을 위해 지금부터 보관 (`FileSystemFileHandle | null`)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/state/store.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { DeckDoc } from '../model/types.ts'
import { countOpaque, editorReducer, initialEditorState } from './store.ts'

function doc(slideCount = 3, opaquePerSlide = 0): DeckDoc {
  return {
    title: 't',
    slideWidth: 1280,
    slideHeight: 720,
    headExtra: '',
    bodyAttrs: {},
    bodyExtra: '',
    bodyScript: '',
    htmlAttrs: {},
    slides: Array.from({ length: slideCount }, (_, i) => ({
      id: `s-${i}`,
      bg: null,
      extraAttrs: {},
      elements: Array.from({ length: opaquePerSlide }, (_, j) => ({
        type: 'opaque' as const,
        id: `o-${i}-${j}`,
        html: '<div></div>',
      })),
    })),
  }
}

describe('editorReducer', () => {
  test('OPEN_SUCCESS는 문서·히스토리·opaque 수를 설정하고 오류를 지운다', () => {
    const errored = editorReducer(initialEditorState, { type: 'OPEN_ERROR', message: 'x' })
    const d = doc(3, 2)
    const state = editorReducer(errored, { type: 'OPEN_SUCCESS', doc: d, fileName: 'a.html', fileHandle: null })
    expect(state.doc).toBe(d)
    expect(state.history!.present).toBe(d)
    expect(state.fileName).toBe('a.html')
    expect(state.currentSlideIndex).toBe(0)
    expect(state.opaqueCount).toBe(6)
    expect(state.loadError).toBeNull()
  })

  test('OPEN_ERROR는 기존 문서를 유지한 채 오류만 설정한다', () => {
    const opened = editorReducer(initialEditorState, { type: 'OPEN_SUCCESS', doc: doc(), fileName: 'a.html', fileHandle: null })
    const state = editorReducer(opened, { type: 'OPEN_ERROR', message: '문서를 해석할 수 없습니다' })
    expect(state.doc).toBe(opened.doc)
    expect(state.loadError).toBe('문서를 해석할 수 없습니다')
  })

  test('SELECT_SLIDE는 범위로 클램프한다', () => {
    const opened = editorReducer(initialEditorState, { type: 'OPEN_SUCCESS', doc: doc(3), fileName: 'a.html', fileHandle: null })
    expect(editorReducer(opened, { type: 'SELECT_SLIDE', index: 2 }).currentSlideIndex).toBe(2)
    expect(editorReducer(opened, { type: 'SELECT_SLIDE', index: 99 }).currentSlideIndex).toBe(2)
    expect(editorReducer(opened, { type: 'SELECT_SLIDE', index: -1 }).currentSlideIndex).toBe(0)
    expect(editorReducer(initialEditorState, { type: 'SELECT_SLIDE', index: 1 })).toBe(initialEditorState)
  })
})

test('countOpaque는 전 슬라이드의 opaque 요소를 센다', () => {
  expect(countOpaque(doc(2, 3))).toBe(6)
  expect(countOpaque(doc(2, 0))).toBe(0)
})
```

Run: `cd editor && npm test`
Expected: FAIL — `./store.ts` 모듈 없음

- [ ] **Step 2: 구현**

`editor/src/state/store.ts`:

```ts
import { createHistory } from '../model/history.ts'
import type { History } from '../model/history.ts'
import type { DeckDoc } from '../model/types.ts'

export interface EditorState {
  doc: DeckDoc | null
  history: History | null
  fileName: string | null
  fileHandle: FileSystemFileHandle | null
  currentSlideIndex: number
  opaqueCount: number
  loadError: string | null
}

export const initialEditorState: EditorState = {
  doc: null,
  history: null,
  fileName: null,
  fileHandle: null,
  currentSlideIndex: 0,
  opaqueCount: 0,
  loadError: null,
}

export type EditorAction =
  | { type: 'OPEN_SUCCESS'; doc: DeckDoc; fileName: string; fileHandle: FileSystemFileHandle | null }
  | { type: 'OPEN_ERROR'; message: string }
  | { type: 'SELECT_SLIDE'; index: number }

export function countOpaque(doc: DeckDoc): number {
  return doc.slides.reduce((n, s) => n + s.elements.filter((e) => e.type === 'opaque').length, 0)
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'OPEN_SUCCESS':
      return {
        doc: action.doc,
        history: createHistory(action.doc),
        fileName: action.fileName,
        fileHandle: action.fileHandle,
        currentSlideIndex: 0,
        opaqueCount: countOpaque(action.doc),
        loadError: null,
      }
    case 'OPEN_ERROR':
      return { ...state, loadError: action.message }
    case 'SELECT_SLIDE': {
      if (!state.doc) return state
      const max = state.doc.slides.length - 1
      return { ...state, currentSlideIndex: Math.max(0, Math.min(max, action.index)) }
    }
  }
}
```

- [ ] **Step 3: 테스트 통과 확인 및 커밋**

Run: `cd editor && npm test && npm run typecheck`
Expected: PASS

```bash
git add editor/src/state/
git commit -m "feat: 에디터 상태 스토어(리듀서) 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 캔버스 렌더링

**Files:**
- Create: `editor/src/canvas/styleFromModel.ts`
- Create: `editor/src/canvas/ElementView.tsx`
- Create: `editor/src/canvas/SlideView.tsx`
- Create: `editor/src/canvas/CanvasArea.tsx`
- Test: `editor/src/canvas/styleFromModel.test.ts`
- Test: `editor/src/canvas/SlideView.test.tsx`

**Interfaces:**
- Consumes: 모델 타입, `parseInlineStyle`(style.ts)
- Produces:
  - `styleFromModel(frame, extraStyle) → CSSProperties` — 절대 위치 + extraStyle의 kebab→camel 변환 (`--wd-*` 커스텀 프로퍼티는 그대로)
  - `cssTextToReact(text) → CSSProperties` — imgStyle 문자열용
  - `extractThemeVars(headExtra) → Record<string, string>` — 문서의 `--wd-*` 변수를 정규식으로 추출해 캔버스에 인라인 적용 (문서 커스텀 테마 반영)
  - `<SlideView slide width height themeVars />` — 슬라이드 1장 렌더 (text는 dangerouslySetInnerHTML, opaque는 원문 렌더)
  - `<CanvasArea doc slideIndex />` — 현재 슬라이드를 영역에 맞춰 transform scale (컨테이너 크기 측정 불가 시 scale 1 유지 — happy-dom 대응)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/styleFromModel.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { cssTextToReact, extractThemeVars, styleFromModel } from './styleFromModel.ts'

describe('styleFromModel', () => {
  test('frame을 절대 위치 스타일로 변환한다', () => {
    const s = styleFromModel({ left: 96, top: 200, width: 520, height: 440 }, {})
    expect(s).toMatchObject({ position: 'absolute', left: '96px', top: '200px', width: '520px', height: '440px' })
  })

  test('extraStyle의 kebab-case를 camelCase로 바꾸고 커스텀 프로퍼티는 유지한다', () => {
    const s = styleFromModel({ left: 0, top: 0, width: 1, height: 1 }, { 'background-color': 'red', '--wd-primary': 'blue' })
    expect(s).toMatchObject({ backgroundColor: 'red', '--wd-primary': 'blue' })
  })
})

test('cssTextToReact는 인라인 스타일 문자열을 변환한다', () => {
  expect(cssTextToReact('width:100%; height:100%;')).toEqual({ width: '100%', height: '100%' })
})

describe('extractThemeVars', () => {
  test('headExtra의 --wd-* 변수를 추출한다', () => {
    const head = '<style>:root { --wd-primary: #ff0000; --wd-accent: #e8f0fe; } body { margin: 0; }</style>'
    expect(extractThemeVars(head)).toEqual({ '--wd-primary': '#ff0000', '--wd-accent': '#e8f0fe' })
  })

  test('변수가 없으면 빈 객체', () => {
    expect(extractThemeVars('<style>body{margin:0}</style>')).toEqual({})
  })
})
```

`editor/src/canvas/SlideView.test.tsx`:

```tsx
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import { CanvasArea } from './CanvasArea.tsx'
import { SlideView } from './SlideView.tsx'

const TEMPLATES = import.meta.dirname
  ? join(import.meta.dirname, '../../../templates/')
  : fileURLToPath(new URL('../../../templates/', import.meta.url))

const report = parseWebdeck(readFileSync(join(TEMPLATES, 'business-report.html'), 'utf8'))

describe('SlideView', () => {
  test('텍스트·이미지·도형 요소를 렌더링한다 (실제 템플릿 표지)', () => {
    render(<SlideView slide={report.slides[0]!} width={1280} height={720} themeVars={{}} />)
    expect(screen.getByText('2026년 상반기 업무 보고')).toBeTruthy()
  })

  test('이미지는 alt와 src로 렌더링된다 (본문 2단 슬라이드)', () => {
    render(<SlideView slide={report.slides[2]!} width={1280} height={720} themeVars={{}} />)
    const img = screen.getByAltText('성과 차트 자리') as HTMLImageElement
    expect(img.src.startsWith('data:image/svg+xml')).toBe(true)
  })

  test('opaque 요소는 원문 그대로 렌더링된다', () => {
    const slide = {
      id: 's',
      bg: null,
      extraAttrs: {},
      elements: [{ type: 'opaque' as const, id: 'o', html: '<div data-x="1">보존된 위젯</div>' }],
    }
    render(<SlideView slide={slide} width={1280} height={720} themeVars={{}} />)
    expect(screen.getByText('보존된 위젯')).toBeTruthy()
  })
})

test('CanvasArea는 현재 슬라이드를 렌더링한다', () => {
  render(<CanvasArea doc={report} slideIndex={1} />)
  expect(screen.getByText('목차')).toBeTruthy()
})
```

Run: `cd editor && npm test`
Expected: FAIL — 모듈 없음

- [ ] **Step 2: 구현**

`editor/src/canvas/styleFromModel.ts`:

```ts
import type { CSSProperties } from 'react'
import { parseInlineStyle } from '../model/style.ts'
import type { Frame } from '../model/types.ts'

function toReactKeys(style: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [prop, value] of Object.entries(style)) {
    const key = prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    out[key] = value
  }
  return out
}

export function styleFromModel(frame: Frame, extraStyle: Record<string, string>): CSSProperties {
  return {
    position: 'absolute',
    left: `${frame.left}px`,
    top: `${frame.top}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    ...toReactKeys(extraStyle),
  } as CSSProperties
}

export function cssTextToReact(text: string): CSSProperties {
  return toReactKeys(parseInlineStyle(text)) as CSSProperties
}

export function extractThemeVars(headExtra: string): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const match of headExtra.matchAll(/(--wd-[a-z-]+)\s*:\s*([^;}]+)/g)) {
    vars[match[1]!] = match[2]!.trim()
  }
  return vars
}
```

`editor/src/canvas/ElementView.tsx`:

```tsx
import type { SlideElement } from '../model/types.ts'
import { cssTextToReact, styleFromModel } from './styleFromModel.ts'

export function ElementView({ element }: { element: SlideElement }) {
  switch (element.type) {
    case 'text':
      return (
        <div
          className="el el-text"
          style={styleFromModel(element.frame, element.extraStyle)}
          dangerouslySetInnerHTML={{ __html: element.html }}
        />
      )
    case 'image':
      return (
        <div className="el el-image" style={styleFromModel(element.frame, element.extraStyle)}>
          <img src={element.src} alt={element.alt} style={cssTextToReact(element.imgStyle)} />
        </div>
      )
    case 'shape':
      return <div className="el el-shape" style={styleFromModel(element.frame, element.extraStyle)} />
    case 'opaque':
      return <div className="el-opaque" dangerouslySetInnerHTML={{ __html: element.html }} />
  }
}
```

`editor/src/canvas/SlideView.tsx`:

```tsx
import type { Slide } from '../model/types.ts'
import { ElementView } from './ElementView.tsx'

export function SlideView({
  slide,
  width,
  height,
  themeVars,
}: {
  slide: Slide
  width: number
  height: number
  themeVars: Record<string, string>
}) {
  return (
    <section
      className="slide-view"
      style={{ width: `${width}px`, height: `${height}px`, background: slide.bg ?? '#ffffff', ...themeVars }}
    >
      {slide.elements.map((el) => (
        <ElementView key={el.id} element={el} />
      ))}
    </section>
  )
}
```

`editor/src/canvas/CanvasArea.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { DeckDoc } from '../model/types.ts'
import { SlideView } from './SlideView.tsx'
import { extractThemeVars } from './styleFromModel.ts'

const MARGIN = 48

export function CanvasArea({ doc, slideIndex }: { doc: DeckDoc; slideIndex: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    function fit() {
      const area = ref.current
      if (!area || !area.clientWidth || !area.clientHeight) return
      const scaleX = (area.clientWidth - MARGIN) / doc.slideWidth
      const scaleY = (area.clientHeight - MARGIN) / doc.slideHeight
      setScale(Math.max(0.1, Math.min(1, scaleX, scaleY)))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [doc.slideWidth, doc.slideHeight])

  const slide = doc.slides[slideIndex]
  if (!slide) return null
  const themeVars = extractThemeVars(doc.headExtra)
  return (
    <main className="canvas-area" ref={ref}>
      <div style={{ width: doc.slideWidth * scale, height: doc.slideHeight * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <SlideView slide={slide} width={doc.slideWidth} height={doc.slideHeight} themeVars={themeVars} />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: 테스트 통과 확인 및 커밋**

Run: `cd editor && npm test && npm run typecheck`
Expected: PASS

```bash
git add editor/src/canvas/
git commit -m "feat: 캔버스 렌더링(SlideView/ElementView/CanvasArea) 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 슬라이드 패널

**Files:**
- Create: `editor/src/panels/SlidePanel.tsx`
- Test: `editor/src/panels/SlidePanel.test.tsx`

**Interfaces:**
- Consumes: `SlideView`, `extractThemeVars`
- Produces: `<SlidePanel doc currentIndex onSelect />` — 썸네일(축소 SlideView) 목록, 클릭 시 `onSelect(index)`, 선택된 항목은 `.thumb.selected` + `aria-current`

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/SlidePanel.test.tsx`:

```tsx
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import { SlidePanel } from './SlidePanel.tsx'

const TEMPLATES = import.meta.dirname
  ? join(import.meta.dirname, '../../../templates/')
  : fileURLToPath(new URL('../../../templates/', import.meta.url))

const report = parseWebdeck(readFileSync(join(TEMPLATES, 'business-report.html'), 'utf8'))

test('슬라이드 수만큼 썸네일 버튼을 렌더링한다', () => {
  render(<SlidePanel doc={report} currentIndex={0} onSelect={() => {}} />)
  expect(screen.getAllByRole('button')).toHaveLength(4)
  expect(screen.getByRole('button', { name: '슬라이드 3' })).toBeTruthy()
})

test('현재 슬라이드에 selected 표시가 붙는다', () => {
  render(<SlidePanel doc={report} currentIndex={1} onSelect={() => {}} />)
  const current = screen.getByRole('button', { name: '슬라이드 2' })
  expect(current.className).toContain('selected')
  expect(current.getAttribute('aria-current')).toBe('true')
})

test('썸네일 클릭 시 onSelect가 호출된다', async () => {
  const onSelect = vi.fn()
  render(<SlidePanel doc={report} currentIndex={0} onSelect={onSelect} />)
  await userEvent.click(screen.getByRole('button', { name: '슬라이드 4' }))
  expect(onSelect).toHaveBeenCalledWith(3)
})
```

Run: `cd editor && npm test`
Expected: FAIL — 모듈 없음

- [ ] **Step 2: 구현**

`editor/src/panels/SlidePanel.tsx`:

```tsx
import { extractThemeVars } from '../canvas/styleFromModel.ts'
import { SlideView } from '../canvas/SlideView.tsx'
import type { DeckDoc } from '../model/types.ts'

const THUMB_WIDTH = 168

export function SlidePanel({
  doc,
  currentIndex,
  onSelect,
}: {
  doc: DeckDoc
  currentIndex: number
  onSelect: (index: number) => void
}) {
  const themeVars = extractThemeVars(doc.headExtra)
  const scale = THUMB_WIDTH / doc.slideWidth
  return (
    <nav aria-label="슬라이드 목록">
      {doc.slides.map((slide, i) => (
        <button
          key={slide.id}
          type="button"
          className={i === currentIndex ? 'thumb selected' : 'thumb'}
          aria-label={`슬라이드 ${i + 1}`}
          aria-current={i === currentIndex}
          onClick={() => onSelect(i)}
        >
          <div className="thumb-scale" style={{ width: THUMB_WIDTH, height: doc.slideHeight * scale }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <SlideView slide={slide} width={doc.slideWidth} height={doc.slideHeight} themeVars={themeVars} />
            </div>
          </div>
          <span className="thumb-num">{i + 1}</span>
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3: 테스트 통과 확인 및 커밋**

Run: `cd editor && npm test && npm run typecheck`
Expected: PASS

```bash
git add editor/src/panels/
git commit -m "feat: 슬라이드 패널(썸네일·선택) 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 파일 열기 + 앱 통합

**Files:**
- Create: `editor/src/file/fileAccess.ts`
- Modify: `editor/src/App.tsx` (전체 교체)
- Modify: `editor/src/App.test.tsx` (전체 교체)
- Modify: `README.md`

**Interfaces:**
- Consumes: 전체 (store/canvas/panels/model/fileAccess)
- Produces:
  - `openHtmlFile() → Promise<OpenedFile | null>` — `OpenedFile { name, text, handle: FileSystemFileHandle | null }`. FSA API(`window.showOpenFilePicker`) 우선, 미지원 시 `<input type="file">` 폴백, 사용자 취소는 null
  - 완성된 뷰어 앱: 열기 → 파싱(실패 시 한국어 오류 표시) → 캔버스+패널 표시, opaque 요소가 있으면 "편집 불가 요소 N개 보존됨" 배지 (스펙 §8)

- [ ] **Step 1: fileAccess 구현**

`editor/src/file/fileAccess.ts`:

```ts
export interface OpenedFile {
  name: string
  text: string
  handle: FileSystemFileHandle | null
}

interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>
}

export async function openHtmlFile(): Promise<OpenedFile | null> {
  const w = window as FilePickerWindow
  if (w.showOpenFilePicker) {
    let handles: FileSystemFileHandle[]
    try {
      handles = await w.showOpenFilePicker({
        types: [{ description: 'WebDeck 문서', accept: { 'text/html': ['.html', '.htm'] } }],
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null
      throw e
    }
    const handle = handles[0]
    if (!handle) return null
    const file = await handle.getFile()
    return { name: file.name, text: await file.text(), handle }
  }
  return openViaInput()
}

function openViaInput(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.html,.htm'
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? { name: file.name, text: await file.text(), handle: null } : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
```

(참고: `FileSystemFileHandle`은 TypeScript DOM lib에 포함되어 있다. typecheck에서 없다고 나오면 `skipLibCheck` 상태를 확인할 것 — 별도 선언을 만들지 말 것)

- [ ] **Step 2: 실패하는 통합 테스트 작성**

`editor/src/App.test.tsx` 전체 교체:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from './App.tsx'

const VALID_DOC = `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>테스트 문서</title><style>.el{position:absolute}</style></head>
<body>
<main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:400px; height:80px;"><p>첫 슬라이드 제목</p></div></section>
<section class="slide"><div class="fancy">위젯</div></section>
</main>
</body>
</html>`

function stubFilePicker(name: string, text: string) {
  const handle = {
    getFile: () => Promise.resolve({ name, text: () => Promise.resolve(text) }),
  }
  ;(window as unknown as { showOpenFilePicker?: () => Promise<unknown[]> }).showOpenFilePicker = () =>
    Promise.resolve([handle])
}

afterEach(() => {
  delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker
})

test('앱 셸이 렌더링된다', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'WebDeck 에디터' })).toBeTruthy()
  expect(screen.getByText('문서를 열어 시작하세요')).toBeTruthy()
})

test('문서를 열면 캔버스·패널·opaque 배지가 나타난다', async () => {
  stubFilePicker('report.html', VALID_DOC)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  // 캔버스와 썸네일 양쪽에 나타나므로 findAllByText 사용 (findByText는 다중 매치로 throw)
  expect((await screen.findAllByText('첫 슬라이드 제목')).length).toBeGreaterThanOrEqual(1)
  expect(screen.getByText('report.html')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^슬라이드 / })).toHaveLength(2)
  expect(screen.getByText('편집 불가 요소 1개 보존됨')).toBeTruthy()
})

test('썸네일 클릭으로 슬라이드를 전환한다', async () => {
  stubFilePicker('report.html', VALID_DOC)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '슬라이드 2' }))
  expect(screen.getAllByText('위젯').length).toBeGreaterThanOrEqual(1)
})

test('WebDeck 문서가 아니면 오류를 표시한다', async () => {
  stubFilePicker('bad.html', '<html><body><p>일반 문서</p></body></html>')
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('WebDeck 문서가 아닙니다')
})
```

Run: `cd editor && npm test`
Expected: FAIL — App에 열기 버튼 없음

- [ ] **Step 3: App 통합 구현**

`editor/src/App.tsx` 전체 교체:

```tsx
import { useReducer } from 'react'
import { CanvasArea } from './canvas/CanvasArea.tsx'
import { openHtmlFile } from './file/fileAccess.ts'
import { WebdeckParseError, parseWebdeck } from './model/parse.ts'
import { SlidePanel } from './panels/SlidePanel.tsx'
import { editorReducer, initialEditorState } from './state/store.ts'

export function App() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)

  async function handleOpen() {
    let opened
    try {
      opened = await openHtmlFile()
    } catch {
      dispatch({ type: 'OPEN_ERROR', message: '파일을 여는 중 오류가 발생했습니다' })
      return
    }
    if (!opened) return
    try {
      const doc = parseWebdeck(opened.text)
      dispatch({ type: 'OPEN_SUCCESS', doc, fileName: opened.name, fileHandle: opened.handle })
    } catch (e) {
      dispatch({
        type: 'OPEN_ERROR',
        message: e instanceof WebdeckParseError ? e.message : '문서를 해석할 수 없습니다',
      })
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>WebDeck 에디터</h1>
        <button type="button" onClick={handleOpen}>열기</button>
        {state.fileName && <span className="file-name">{state.fileName}</span>}
        {state.opaqueCount > 0 && <span className="notice">편집 불가 요소 {state.opaqueCount}개 보존됨</span>}
        {state.loadError && <span className="error" role="alert">{state.loadError}</span>}
      </header>
      <aside className="side">
        {state.doc && (
          <SlidePanel
            doc={state.doc}
            currentIndex={state.currentSlideIndex}
            onSelect={(index) => dispatch({ type: 'SELECT_SLIDE', index })}
          />
        )}
      </aside>
      {state.doc ? (
        <CanvasArea doc={state.doc} slideIndex={state.currentSlideIndex} />
      ) : (
        <main className="canvas-area">
          <p className="empty-state">문서를 열어 시작하세요</p>
        </main>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 전체 테스트·수동 확인**

Run: `cd editor && npm test && npm run typecheck && cd .. && npm run test:all`
Expected: PASS — 전체 통과

Run: `cd editor && npm run dev` → 브라우저에서 `templates/business-report.html` 열어 4장 렌더·패널 전환 확인 (육안 확인은 사람에게 위임)

- [ ] **Step 5: README 갱신**

`README.md`의 「현재 제공」 목록 끝에 추가:

```markdown
- **에디터 뷰어 (Plan 3a)** — `cd editor && npm run dev`로 실행. 문서 열기(File System Access), 캔버스 렌더링, 슬라이드 패널 탐색, 문서 테마 반영, 편집 불가 요소 보존 표시
```

「로드맵」을 다음으로 교체:

```markdown
## 로드맵

- ~~Plan 1: 포맷 & 도구~~ (완료)
- ~~Plan 2: 에디터 코어~~ (완료)
- ~~Plan 3a: 에디터 UI — 뷰어 기반~~ (완료)
- Plan 3b: 에디터 UI — 편집 상호작용 (드래그/리사이즈, 텍스트 편집, 툴바, 단축키, 저장)
```

- [ ] **Step 6: 백로그 정리**

`docs/plan-3-backlog.md`를 다음 내용으로 전체 교체 (Task 1·2에서 해소된 항목 제거, Plan 3b로 이월되는 항목만 유지):

```markdown
# Plan 3b 백로그 — 편집 상호작용에서 다룰 항목

Plan 3a까지 완료된 시점의 잔여 항목.

## 편집/저장 통합 (Plan 3b 본문)

- **저장 전 검증**: 저장 직전 `validateWebdeck(serialized)`를 최후 안전망으로 실행 (스펙 §8). `setTextHtml`에 비균형 마크업이 들어오면 문서 구조가 깨질 수 있음 — contentEditable 출력 외 입력 금지
- ops는 대상 미발견 시 throw — UI에서 try/catch 또는 사전 확인 필요
- frame의 캔버스 밖 이동을 코어가 막지 않음 (검증기 경고) — 클램핑은 UI 책임
- barrel `index.ts` 없음 — 딥 임포트 필요, UI 규모가 커지면 추가 검토
- `AIServiceAdapter` 인터페이스 정의 (스펙 §6.4 — 인터페이스만, 미구현)

## 소소한 정리 (기회가 될 때)

- 검증기 `@import` 검사가 단순 부분 문자열 매치 (CSS 주석 내 오탐 가능, v1 허용)
- CLI 내부 오류 출력에서 비-Error throw 시 `undefined` 출력 가능
```

- [ ] **Step 7: 커밋**

```bash
git add editor/ README.md docs/plan-3-backlog.md
git commit -m "feat: 파일 열기와 뷰어 앱 통합 (Plan 3a 완성)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
