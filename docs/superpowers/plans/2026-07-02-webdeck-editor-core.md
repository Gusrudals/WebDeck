# WebDeck 에디터 코어 구현 계획 (Plan 2/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI 없이 완전히 테스트되는 에디터 코어를 만든다 — 문서 모델, HTML↔모델 파서/직렬화(왕복 보존), 편집 커맨드, undo/redo. 더불어 Plan 1 백로그(검증기·CLI·가이드 강화)를 해소한다.

**Architecture:** "모델이 진실, HTML은 저장 포맷" (스펙 §6.2). 파서는 표준 DOM API(DOMParser)를 사용해 브라우저(Plan 3)와 테스트(happy-dom)에서 같은 코드가 돈다. 이해하지 못하는 요소는 opaque로 원문 보존(왕복 보존 원칙). 모든 편집 커맨드는 불변(immutable) 함수 — undo/redo는 스냅샷 참조 스택. 스펙: `docs/superpowers/specs/2026-07-02-webdeck-design.md`, 백로그: `docs/plan-2-backlog.md`

**Tech Stack:** tools 계층 — Node 22+/ESM/node-html-parser(기존 그대로). editor 계층 — TypeScript(strict) + Vitest + happy-dom (devDependencies만, 런타임 의존성 0. React/Vite는 Plan 3에서 추가)

## Global Constraints

- Node 22 이상 (`engines: >=22`), 모든 신규 코드 ESM
- editor 패키지 의존성: devDependencies로 `typescript`, `vitest`, `happy-dom`만. 런타임 dependencies 금지
- TypeScript는 strict 모드. 타입 단언(`as`) 남용 금지
- **왕복 보존 원칙**: 파서가 이해하지 못하는 요소/속성은 삭제하지 않고 opaque(원문 문자열)로 보존, 직렬화 시 그대로 출력
- 포맷 v1 상수(Plan 1과 동일): 캔버스 px 단위 `left/top/width/height`, 요소 타입 `el-text`/`el-image`/`el-shape`, z-order = DOM 순서, `data-webdeck-version="1"`
- 사용자에게 보이는 모든 메시지(예외 메시지 포함)는 한국어
- 커밋 메시지는 conventional commits(`feat:`/`fix:`/`docs:`) + 마지막 줄 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- tools 테스트는 리포 루트에서 `npm test`(node --test), editor 테스트는 `editor/`에서 `npm test`(vitest run)
- 커맨드(ops) 함수는 입력 doc을 절대 변경하지 않는다(불변) — 새 객체 반환

---

### Task 1: 백로그 해소 — 검증기·CLI·가이드 강화

**Files:**
- Modify: `tools/lib/validate.mjs`
- Modify: `tools/validate-webdeck.mjs`
- Modify: `tools/lib/validate.test.mjs`
- Modify: `tools/cli.test.mjs`
- Modify: `docs/ai-guide.md`
- Delete: `docs/plan-2-backlog.md` (이 태스크로 소화 — parseInlineStyle 항목은 Task 3에서 에디터 전용 파서로 해결됨을 커밋 메시지에 명시)

**Interfaces:**
- Consumes: `validateWebdeck(html)`, `makeDoc({ version, deckAttrs, slides, extraHead })` (Plan 1)
- Produces: 강화된 검증기 — 중첩 `.el` 오류, `<style>` 내 `@import` 오류, `iframe/video/audio/embed/object` 오류. CLI는 검증기 예외 시 종료 코드 2

- [ ] **Step 1: 실패하는 테스트 작성**

`tools/lib/validate.test.mjs` 끝에 추가:

```js
test('중첩된 .el은 오류', () => {
  const slides = `<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:200px; height:100px;"><p>a</p><div class="el el-shape" data-shape="rect" style="left:10px; top:10px; width:50px; height:50px;"></div></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('중첩')))
})

test('<style> 안의 @import는 오류', () => {
  const doc = makeDoc({ extraHead: '<style>@import url("https://cdn.example.com/x.css");</style>' })
  const { errors } = validateWebdeck(doc)
  assert.ok(errors.some((e) => e.includes('@import')))
})

test('iframe/video 등 외부 콘텐츠 요소는 오류', () => {
  const slides = `<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:200px; height:100px;"><iframe src="https://example.com"></iframe></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('iframe')))
})
```

`tools/cli.test.mjs`에 tmpdir 정리 추가 — 상단 import에 `rmSync`와 `after`를 추가하고 파일 끝에:

```js
// import 줄 수정: { writeFileSync, mkdtempSync, rmSync }, test와 함께 { after }를 'node:test'에서 import
after(() => rmSync(dir, { recursive: true, force: true }))
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — 신규 3개 테스트 실패 (기존 19개는 통과)

- [ ] **Step 3: 검증기 구현**

`tools/lib/validate.mjs`의 `validateWebdeck`에서 외부 스타일시트 검사 다음에 추가:

```js
  for (const styleEl of root.querySelectorAll('style')) {
    if (styleEl.text.includes('@import')) {
      errors.push('문서: <style> 안의 @import는 허용되지 않습니다 (자기완결형 원칙)')
      break
    }
  }
  const forbidden = root.querySelectorAll('iframe, video, audio, embed, object')
  if (forbidden.length > 0) {
    errors.push(`문서: iframe/video/audio/embed/object 요소는 허용되지 않습니다 (v1, ${forbidden.length}개 발견)`)
  }
```

`validateSlide`의 요소 루프에서, 타입 클래스 확인 직후(`type` 확정 후)에 추가:

```js
    if (el.querySelector('.el')) {
      errors.push(`${label}: .el 안에 다른 .el을 중첩할 수 없습니다 (겹침은 절대 좌표와 순서로 표현)`)
    }
```

- [ ] **Step 4: CLI 예외 처리**

`tools/validate-webdeck.mjs`에서 `const { errors, warnings } = validateWebdeck(html)` 줄을 다음으로 교체:

```js
let result
try {
  result = validateWebdeck(html)
} catch (e) {
  console.error(`검증 중 내부 오류가 발생했습니다: ${e.message}`)
  process.exit(2)
}
const { errors, warnings } = result
```

(이 경로는 현재 재현 가능한 입력이 없어 테스트로 커버하지 않는다 — uncaught 시 종료 코드 1이 "포맷 오류"로 오독되는 것을 막는 방어 코드임을 보고서에 명시)

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 22개 테스트 전부 통과 (템플릿 3종도 여전히 오류·경고 0건)

- [ ] **Step 6: 가이드 갱신**

`docs/ai-guide.md`의 「필수 규칙」 13개 항목 각각의 끝에 검증 수위 마커를 붙인다 — 규칙 2, 7, 8, 10은 `(경고)`, 나머지는 `(오류)`. 규칙 13은 이제 검증기가 강제하므로 문구는 그대로 두고 `(오류)`를 붙인다. 「자주 하는 실수」 목록 끝에 한 줄 추가:

```markdown
- `iframe`/`video` 등 외부 콘텐츠 요소 사용 (v1에서 금지)
```

- [ ] **Step 7: 백로그 파일 삭제 및 커밋**

```bash
git rm docs/plan-2-backlog.md
git add tools/ docs/ai-guide.md
git commit -m "feat: Plan 1 백로그 해소 — 중첩 el·@import·외부 콘텐츠 검사, CLI 예외 처리

parseInlineStyle 왕복 문제는 에디터 전용 파서(Plan 2 Task 3)로 해결

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: editor 패키지 스캐폴드 + 문서 모델 타입

**Files:**
- Create: `editor/package.json`
- Create: `editor/tsconfig.json`
- Create: `editor/vitest.config.ts`
- Create: `editor/src/model/types.ts`
- Create: `editor/src/model/id.ts`
- Test: `editor/src/model/id.test.ts`

**Interfaces:**
- Consumes: 없음 (editor 계층의 첫 태스크)
- Produces:
  - 타입: `DeckDoc { title, slideWidth, slideHeight, headExtra, bodyScript, htmlAttrs, slides }`, `Slide { id, bg, elements }`, `SlideElement = TextElement | ImageElement | ShapeElement | OpaqueElement`, `Frame { left, top, width, height }`
  - `createIdGen(prefix?) → () => string` — 호출마다 `wd-1`, `wd-2`, … 를 반환하는 결정적 생성기 (파서가 매 parse마다 새로 만들므로 같은 문서는 항상 같은 id 시퀀스)

- [ ] **Step 1: 패키지 스캐폴드**

`editor/package.json`:

```json
{
  "name": "webdeck-editor",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

`editor/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`editor/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'happy-dom' },
})
```

의존성 설치 (editor/에서):

```bash
cd editor && npm install -D typescript vitest happy-dom
```

- [ ] **Step 2: 실패하는 테스트 작성**

`editor/src/model/id.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'

describe('createIdGen', () => {
  test('접두사와 증가 번호로 id를 생성한다', () => {
    const gen = createIdGen()
    expect(gen()).toBe('wd-1')
    expect(gen()).toBe('wd-2')
  })

  test('생성기 인스턴스는 서로 독립적이다', () => {
    const a = createIdGen()
    const b = createIdGen('el')
    a()
    expect(b()).toBe('el-1')
    expect(a()).toBe('wd-2')
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `cd editor && npm test`
Expected: FAIL — `./id.ts` 모듈 없음

- [ ] **Step 4: 타입과 id 생성기 구현**

`editor/src/model/types.ts`:

```ts
export interface Frame {
  left: number
  top: number
  width: number
  height: number
}

interface ElementBase {
  id: string
  frame: Frame
  /** frame(left/top/width/height) 외의 인라인 스타일 — background 등. 왕복 보존 */
  extraStyle: Record<string, string>
  /** class/style/data-shape 외의 속성 — 왕복 보존 */
  extraAttrs: Record<string, string>
}

export interface TextElement extends ElementBase {
  type: 'text'
  /** 요소 내부 HTML 원문 (<p>…</p> 목록) */
  html: string
}

export interface ImageElement extends ElementBase {
  type: 'image'
  src: string
  alt: string
  imgStyle: string
}

export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: 'rect'
}

/** 파서가 이해하지 못하는 슬라이드 자식 — 원문 그대로 보존(왕복 보존 원칙) */
export interface OpaqueElement {
  type: 'opaque'
  id: string
  html: string
}

export type SlideElement = TextElement | ImageElement | ShapeElement | OpaqueElement
export type KnownElement = TextElement | ImageElement | ShapeElement

export interface Slide {
  id: string
  bg: string | null
  elements: SlideElement[]
}

export interface DeckDoc {
  title: string
  slideWidth: number
  slideHeight: number
  /** <head>에서 <title>/<meta charset>을 제외한 원문 (뷰어 CSS 포함) — 왕복 보존 */
  headExtra: string
  /** <body> 직속 <script> 원문 (뷰어 스크립트) — 왕복 보존 */
  bodyScript: string
  /** <html> 태그의 속성 전부 (lang, data-webdeck-version 등) */
  htmlAttrs: Record<string, string>
  slides: Slide[]
}

export function isKnownElement(el: SlideElement): el is KnownElement {
  return el.type !== 'opaque'
}
```

`editor/src/model/id.ts`:

```ts
export function createIdGen(prefix = 'wd'): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}
```

- [ ] **Step 5: 테스트와 타입체크 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 테스트 2개 PASS, tsc 오류 0건

- [ ] **Step 6: 커밋**

```bash
git add editor/package.json editor/package-lock.json editor/tsconfig.json editor/vitest.config.ts editor/src/
git commit -m "feat: editor 패키지 스캐폴드와 문서 모델 타입 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 파서 — HTML → 모델

**Files:**
- Create: `editor/src/model/parse.ts`
- Create: `editor/src/model/style.ts`
- Test: `editor/src/model/parse.test.ts`
- Test: `editor/src/model/style.test.ts`

**Interfaces:**
- Consumes: Task 2의 타입, `createIdGen`
- Produces:
  - `parseWebdeck(html: string, options?: { idGen?: () => string }) → DeckDoc` — WebDeck 문서가 아니면 `WebdeckParseError`(한국어 메시지) throw
  - `class WebdeckParseError extends Error`
  - `parseInlineStyle(text: string) → Record<string, string>` — 괄호 내부의 `;`를 값의 일부로 처리 (`url(data:...;base64,...)` 안전 — tools 버전의 알려진 한계 해소)
  - `serializeInlineStyle(style: Record<string, string>) → string` (Task 4가 사용)

- [ ] **Step 1: 실패하는 스타일 파서 테스트 작성**

`editor/src/model/style.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseInlineStyle, serializeInlineStyle } from './style.ts'

describe('parseInlineStyle', () => {
  test('선언을 소문자 속성 맵으로 파싱한다', () => {
    expect(parseInlineStyle('LEFT: 10px; top:20px ; color: var(--wd-text)')).toEqual({
      left: '10px',
      top: '20px',
      color: 'var(--wd-text)',
    })
  })

  test('괄호 안의 세미콜론은 값의 일부다', () => {
    const style = parseInlineStyle("background:url(data:image/svg+xml;base64,AAA=); width:10px")
    expect(style['background']).toBe('url(data:image/svg+xml;base64,AAA=)')
    expect(style['width']).toBe('10px')
  })
})

describe('serializeInlineStyle', () => {
  test('파싱의 역연산이다', () => {
    const text = 'left:96px; top:200px; background:url(data:image/svg+xml;base64,AAA=);'
    expect(parseInlineStyle(serializeInlineStyle(parseInlineStyle(text)))).toEqual(parseInlineStyle(text))
  })
})
```

- [ ] **Step 2: 스타일 파서 구현**

`editor/src/model/style.ts`:

```ts
export function parseInlineStyle(text: string): Record<string, string> {
  const decls: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ';' && depth === 0) {
      decls.push(current)
      current = ''
      continue
    }
    current += ch
  }
  decls.push(current)

  const out: Record<string, string> = {}
  for (const decl of decls) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const value = decl.slice(idx + 1).trim()
    if (prop) out[prop] = value
  }
  return out
}

export function serializeInlineStyle(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([prop, value]) => `${prop}:${value};`)
    .join(' ')
}
```

Run: `cd editor && npm test` → style 테스트 3개 PASS 확인

- [ ] **Step 3: 실패하는 파서 테스트 작성**

`editor/src/model/parse.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { WebdeckParseError, parseWebdeck } from './parse.ts'

const TEMPLATES = fileURLToPath(new URL('../../../templates/', import.meta.url))

function docWith(slides: string, htmlAttrs = ' data-webdeck-version="1"'): string {
  return `<!DOCTYPE html>
<html lang="ko"${htmlAttrs}>
<head><meta charset="utf-8"><title>테스트</title><style>.el{position:absolute}</style></head>
<body>
<main class="deck" data-slide-width="1280" data-slide-height="720">${slides}</main>
<script>/* viewer */</script>
</body>
</html>`
}

describe('parseWebdeck', () => {
  test('버전 속성이 없으면 WebdeckParseError', () => {
    expect(() => parseWebdeck(docWith('<section class="slide"></section>', ''))).toThrow(WebdeckParseError)
  })

  test('deck이 없으면 WebdeckParseError', () => {
    expect(() => parseWebdeck('<!DOCTYPE html><html data-webdeck-version="1"><body></body></html>')).toThrow(
      WebdeckParseError,
    )
  })

  test('문서 메타를 파싱한다', () => {
    const doc = parseWebdeck(docWith('<section class="slide" data-bg="#ffffff"></section>'))
    expect(doc.title).toBe('테스트')
    expect(doc.slideWidth).toBe(1280)
    expect(doc.slideHeight).toBe(720)
    expect(doc.htmlAttrs['data-webdeck-version']).toBe('1')
    expect(doc.htmlAttrs['lang']).toBe('ko')
    expect(doc.headExtra).toContain('<style>')
    expect(doc.bodyScript).toContain('viewer')
    expect(doc.slides).toHaveLength(1)
    expect(doc.slides[0]!.bg).toBe('#ffffff')
  })

  test('요소 3종을 파싱한다', () => {
    const doc = parseWebdeck(
      docWith(`<section class="slide">
        <div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:100px; height:50px; background:var(--wd-accent);"></div>
        <div class="el el-text" style="left:10px; top:60px; width:200px; height:80px;" data-note="x"><p>안녕</p></div>
        <div class="el el-image" style="left:10px; top:150px; width:100px; height:100px;"><img src="data:image/png;base64,AAA=" alt="그림" style="width:100%; height:100%;"></div>
      </section>`),
    )
    const [shape, text, image] = doc.slides[0]!.elements
    expect(shape).toMatchObject({ type: 'shape', shape: 'rect', frame: { left: 0, top: 0, width: 100, height: 50 }, extraStyle: { background: 'var(--wd-accent)' } })
    expect(text).toMatchObject({ type: 'text', html: '<p>안녕</p>', extraAttrs: { 'data-note': 'x' } })
    expect(image).toMatchObject({ type: 'image', src: 'data:image/png;base64,AAA=', alt: '그림', imgStyle: 'width:100%; height:100%;' })
  })

  test('이해할 수 없는 요소는 opaque로 원문 보존한다', () => {
    const raw = '<div class="fancy-widget" data-x="1"><span>?</span></div>'
    const doc = parseWebdeck(docWith(`<section class="slide">${raw}</section>`))
    const el = doc.slides[0]!.elements[0]!
    expect(el.type).toBe('opaque')
    expect(el.type === 'opaque' && el.html).toBe(raw)
  })

  test('frame이 불완전한 .el도 opaque로 보존한다', () => {
    const doc = parseWebdeck(docWith(`<section class="slide"><div class="el el-text" style="left:10px;"><p>x</p></div></section>`))
    expect(doc.slides[0]!.elements[0]!.type).toBe('opaque')
  })

  test('id는 문서 순서대로 결정적으로 생성된다', () => {
    const html = docWith('<section class="slide"><div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:1px; height:1px;"></div></section>')
    const a = parseWebdeck(html)
    const b = parseWebdeck(html)
    expect(a).toEqual(b)
  })

  test('실제 템플릿 3종을 파싱한다', () => {
    for (const name of ['minimal.html', 'business-report.html', 'project-proposal.html']) {
      const doc = parseWebdeck(readFileSync(`${TEMPLATES}${name}`, 'utf8'))
      expect(doc.slides.length).toBeGreaterThanOrEqual(2)
      expect(doc.slides.flatMap((s) => s.elements).every((e) => e.type !== 'opaque')).toBe(true)
    }
  })
})
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `cd editor && npm test`
Expected: FAIL — `./parse.ts` 모듈 없음 (style 테스트는 통과)

- [ ] **Step 5: 파서 구현**

`editor/src/model/parse.ts`:

```ts
import { createIdGen } from './id.ts'
import { parseInlineStyle } from './style.ts'
import type { DeckDoc, Frame, Slide, SlideElement } from './types.ts'

export class WebdeckParseError extends Error {}

export interface ParseOptions {
  idGen?: () => string
}

const FRAME_PROPS = ['left', 'top', 'width', 'height'] as const
const PX_VALUE = /^-?\d+(\.\d+)?px$/

export function parseWebdeck(html: string, options: ParseOptions = {}): DeckDoc {
  const idGen = options.idGen ?? createIdGen()
  const dom = new DOMParser().parseFromString(html, 'text/html')

  const htmlEl = dom.documentElement
  if (htmlEl.getAttribute('data-webdeck-version') !== '1') {
    throw new WebdeckParseError('WebDeck 문서가 아닙니다: <html>에 data-webdeck-version="1" 속성이 없습니다')
  }
  const deck = dom.querySelector('main.deck')
  if (!deck) {
    throw new WebdeckParseError('WebDeck 문서가 아닙니다: <main class="deck">가 없습니다')
  }
  const slideWidth = Number(deck.getAttribute('data-slide-width'))
  const slideHeight = Number(deck.getAttribute('data-slide-height'))
  if (!(slideWidth > 0) || !(slideHeight > 0)) {
    throw new WebdeckParseError('deck의 data-slide-width/data-slide-height가 올바르지 않습니다')
  }

  const htmlAttrs: Record<string, string> = {}
  for (const attr of Array.from(htmlEl.attributes)) htmlAttrs[attr.name] = attr.value

  const headClone = dom.head.cloneNode(true) as HTMLElement
  const title = headClone.querySelector('title')?.textContent ?? ''
  headClone.querySelector('title')?.remove()
  headClone.querySelector('meta[charset]')?.remove()
  const headExtra = headClone.innerHTML.trim()

  const bodyScript = Array.from(dom.body.children)
    .filter((c) => c.tagName === 'SCRIPT')
    .map((s) => s.outerHTML)
    .join('\n')

  const slides: Slide[] = []
  for (const child of Array.from(deck.children)) {
    if (child.tagName !== 'SECTION' || !child.classList.contains('slide')) {
      throw new WebdeckParseError(`deck의 자식은 <section class="slide">만 허용됩니다 (<${child.tagName.toLowerCase()}> 발견)`)
    }
    slides.push(parseSlide(child, idGen))
  }

  return { title, slideWidth, slideHeight, headExtra, bodyScript, htmlAttrs, slides }
}

function parseSlide(section: Element, idGen: () => string): Slide {
  const id = idGen()
  const elements = Array.from(section.children).map((el) => parseElement(el, idGen))
  return { id, bg: section.getAttribute('data-bg'), elements }
}

function parseElement(el: Element, idGen: () => string): SlideElement {
  const id = idGen()
  const opaque = (): SlideElement => ({ type: 'opaque', id, html: el.outerHTML })

  if (!el.classList.contains('el')) return opaque()

  const style = parseInlineStyle(el.getAttribute('style') ?? '')
  const frame = readFrame(style)
  if (!frame) return opaque()

  const extraStyle: Record<string, string> = {}
  for (const [prop, value] of Object.entries(style)) {
    if (!(FRAME_PROPS as readonly string[]).includes(prop)) extraStyle[prop] = value
  }
  const extraAttrs: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'class' || attr.name === 'style' || attr.name === 'data-shape') continue
    extraAttrs[attr.name] = attr.value
  }

  if (el.classList.contains('el-text')) {
    return { type: 'text', id, frame, extraStyle, extraAttrs, html: el.innerHTML.trim() }
  }
  if (el.classList.contains('el-image')) {
    const imgs = el.querySelectorAll('img')
    const img = imgs.length === 1 ? imgs[0] : null
    if (!img) return opaque()
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
  if (el.classList.contains('el-shape')) {
    if (el.getAttribute('data-shape') !== 'rect') return opaque()
    return { type: 'shape', id, frame, extraStyle, extraAttrs, shape: 'rect' }
  }
  return opaque()
}

function readFrame(style: Record<string, string>): Frame | null {
  const values: number[] = []
  for (const prop of FRAME_PROPS) {
    const v = style[prop]
    if (v === undefined || !PX_VALUE.test(v)) return null
    values.push(parseFloat(v))
  }
  const [left, top, width, height] = values as [number, number, number, number]
  return { left, top, width, height }
}
```

- [ ] **Step 6: 테스트와 타입체크 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: PASS — 전체 테스트 통과, tsc 오류 0건

- [ ] **Step 7: 커밋**

```bash
git add editor/src/model/
git commit -m "feat: WebDeck HTML 파서 추가 (opaque 보존, 결정적 id)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 직렬화 — 모델 → HTML + 왕복 테스트

**Files:**
- Create: `editor/src/model/serialize.ts`
- Create: `tools/lib/validate.d.mts`
- Test: `editor/src/model/serialize.test.ts`

**Interfaces:**
- Consumes: Task 2 타입, Task 3의 `parseWebdeck`, `serializeInlineStyle`
- Produces: `serializeWebdeck(doc: DeckDoc) → string` — 완전한 .html 문서 문자열. 왕복 계약: ① `serialize(parse(x))`는 두 번째 왕복부터 고정점(동일 문자열), ② `parse(serialize(m))`은 `m`과 deep-equal, ③ 템플릿을 왕복시켜도 검증기 오류·경고 0건

- [ ] **Step 1: 실패하는 테스트 작성**

`tools/lib/validate.d.mts` — `.mjs` 옆에 두는 타입 선언 (TypeScript는 상대 경로 import 시 같은 이름의 `.d.mts`를 찾는다. 상대 경로 ambient `declare module`은 지원되지 않으므로 이 방식이어야 함):

```ts
export declare function validateWebdeck(html: string): { errors: string[]; warnings: string[] }
export declare function parseInlineStyle(styleText: string): Record<string, string>
export declare const ELEMENT_TYPES: string[]
```

`editor/src/model/serialize.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { validateWebdeck } from '../../../tools/lib/validate.mjs'
import { parseWebdeck } from './parse.ts'
import { serializeWebdeck } from './serialize.ts'

const TEMPLATES = fileURLToPath(new URL('../../../templates/', import.meta.url))
const NAMES = ['minimal.html', 'business-report.html', 'project-proposal.html']

describe('serializeWebdeck 왕복 계약', () => {
  test('parse → serialize → parse는 모델을 보존한다', () => {
    for (const name of NAMES) {
      const m1 = parseWebdeck(readFileSync(`${TEMPLATES}${name}`, 'utf8'))
      const m2 = parseWebdeck(serializeWebdeck(m1))
      expect(m2, name).toEqual(m1)
    }
  })

  test('두 번째 왕복부터는 문자열 고정점이다', () => {
    for (const name of NAMES) {
      const once = serializeWebdeck(parseWebdeck(readFileSync(`${TEMPLATES}${name}`, 'utf8')))
      const twice = serializeWebdeck(parseWebdeck(once))
      expect(twice, name).toBe(once)
    }
  })

  test('왕복한 템플릿은 검증기를 통과한다 (오류·경고 0건)', () => {
    for (const name of NAMES) {
      const out = serializeWebdeck(parseWebdeck(readFileSync(`${TEMPLATES}${name}`, 'utf8')))
      const { errors, warnings } = validateWebdeck(out)
      expect(errors, name).toEqual([])
      expect(warnings, name).toEqual([])
    }
  })

  test('opaque 요소는 원문 그대로 출력된다', () => {
    const raw = '<div class="fancy-widget" data-x="1"><span>?</span></div>'
    const html = `<!DOCTYPE html><html lang="ko" data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head><body><main class="deck" data-slide-width="1280" data-slide-height="720"><section class="slide">${raw}</section></main></body></html>`
    expect(serializeWebdeck(parseWebdeck(html))).toContain(raw)
  })

  test('제목과 속성값은 이스케이프된다', () => {
    const doc = parseWebdeck(
      `<!DOCTYPE html><html lang="ko" data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head><body><main class="deck" data-slide-width="1280" data-slide-height="720"><section class="slide"></section></main></body></html>`,
    )
    const edited = { ...doc, title: 'A < B & "C"' }
    const out = serializeWebdeck(edited)
    expect(out).toContain('<title>A &lt; B &amp; "C"</title>')
    expect(parseWebdeck(out).title).toBe('A < B & "C"')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd editor && npm test`
Expected: FAIL — `./serialize.ts` 모듈 없음

- [ ] **Step 3: 직렬화 구현**

`editor/src/model/serialize.ts`:

```ts
import { serializeInlineStyle } from './style.ts'
import type { DeckDoc, KnownElement, Slide, SlideElement } from './types.ts'

export function serializeWebdeck(doc: DeckDoc): string {
  const htmlAttrs = Object.entries(doc.htmlAttrs)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join('')
  const slides = doc.slides.map(serializeSlide).join('\n\n')
  const bodyScript = doc.bodyScript ? `\n${doc.bodyScript}` : ''

  return `<!DOCTYPE html>
<html${htmlAttrs}>
<head>
<meta charset="utf-8">
<title>${escapeText(doc.title)}</title>
${doc.headExtra}
</head>
<body>
<main class="deck" data-slide-width="${doc.slideWidth}" data-slide-height="${doc.slideHeight}">

${slides}

</main>${bodyScript}
</body>
</html>
`
}

function serializeSlide(slide: Slide): string {
  const bg = slide.bg === null ? '' : ` data-bg="${escapeAttr(slide.bg)}"`
  const els = slide.elements.map((el) => `    ${serializeElement(el)}`).join('\n')
  const body = els ? `\n${els}\n  ` : '\n  '
  return `  <section class="slide"${bg}>${body}</section>`
}

function serializeElement(el: SlideElement): string {
  if (el.type === 'opaque') return el.html
  const style = elementStyle(el)
  const attrs = extraAttrsSuffix(el)
  switch (el.type) {
    case 'text':
      return `<div class="el el-text" style="${escapeAttr(style)}"${attrs}>${el.html}</div>`
    case 'image': {
      const imgStyle = el.imgStyle ? ` style="${escapeAttr(el.imgStyle)}"` : ''
      return `<div class="el el-image" style="${escapeAttr(style)}"${attrs}><img src="${escapeAttr(el.src)}" alt="${escapeAttr(el.alt)}"${imgStyle}></div>`
    }
    case 'shape':
      return `<div class="el el-shape" data-shape="rect" style="${escapeAttr(style)}"${attrs}></div>`
  }
}

function elementStyle(el: KnownElement): string {
  const { left, top, width, height } = el.frame
  const frame = `left:${left}px; top:${top}px; width:${width}px; height:${height}px;`
  const extra = serializeInlineStyle(el.extraStyle)
  return extra ? `${frame} ${extra}` : frame
}

function extraAttrsSuffix(el: KnownElement): string {
  return Object.entries(el.extraAttrs)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join('')
}

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeAttr(text: string): string {
  return escapeText(text).replaceAll('"', '&quot;')
}
```

- [ ] **Step 4: 테스트와 타입체크 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: PASS. 만약 고정점 테스트가 실패하면 원인은 대부분 공백 차이 — 파서의 `innerHTML.trim()`/`headExtra.trim()`과 직렬화 들여쓰기(슬라이드 2칸, 요소 4칸)가 위 코드와 일치하는지 확인한다. 검증기 경고가 나오면 escapeAttr가 style 안의 `&`를 이중 이스케이프했는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/ tools/lib/validate.d.mts
git commit -m "feat: WebDeck 직렬화와 왕복 보존 테스트 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 편집 커맨드 (ops)

**Files:**
- Create: `editor/src/model/ops.ts`
- Test: `editor/src/model/ops.test.ts`

**Interfaces:**
- Consumes: Task 2 타입, `createIdGen`
- Produces (전부 불변 — 새 DeckDoc 반환, 대상 못 찾으면 한국어 메시지로 throw):
  - 요소: `moveElement(doc, slideId, elementId, dx, dy)`, `setElementFrame(doc, slideId, elementId, frame)`, `addElement(doc, slideId, element, index?)`, `removeElement(doc, slideId, elementId)`, `moveElementZ(doc, slideId, elementId, dir: 'forward'|'backward'|'front'|'back')`, `setTextHtml(doc, slideId, elementId, html)`
  - 슬라이드: `addSlide(doc, idGen, index?)`, `removeSlide(doc, slideId)`, `duplicateSlide(doc, slideId, idGen)`, `moveSlide(doc, fromIndex, toIndex)`, `setSlideBg(doc, slideId, bg)`
  - 팩토리: `createTextElement(idGen, frame, html)`, `createShapeElement(idGen, frame, background)`, `createImageElement(idGen, frame, src, alt)`

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/ops.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createIdGen } from './id.ts'
import {
  addElement,
  addSlide,
  createShapeElement,
  createTextElement,
  duplicateSlide,
  moveElement,
  moveElementZ,
  moveSlide,
  removeElement,
  removeSlide,
  setElementFrame,
  setSlideBg,
  setTextHtml,
} from './ops.ts'
import type { DeckDoc, Slide } from './types.ts'

function fixture(): DeckDoc {
  const gen = createIdGen()
  const slide: Slide = {
    id: gen(), // wd-1
    bg: '#ffffff',
    elements: [
      { type: 'shape', id: gen(), frame: { left: 0, top: 0, width: 100, height: 50 }, extraStyle: {}, extraAttrs: {}, shape: 'rect' }, // wd-2
      { type: 'text', id: gen(), frame: { left: 10, top: 60, width: 200, height: 80 }, extraStyle: {}, extraAttrs: {}, html: '<p>a</p>' }, // wd-3
      { type: 'opaque', id: gen(), html: '<div class="x"></div>' }, // wd-4
    ],
  }
  return { title: 't', slideWidth: 1280, slideHeight: 720, headExtra: '', bodyScript: '', htmlAttrs: { 'data-webdeck-version': '1' }, slides: [slide] }
}

describe('요소 커맨드', () => {
  test('moveElement는 프레임을 이동하고 원본을 변경하지 않는다', () => {
    const doc = fixture()
    const next = moveElement(doc, 'wd-1', 'wd-3', 5, -10)
    expect(next.slides[0]!.elements[1]).toMatchObject({ frame: { left: 15, top: 50, width: 200, height: 80 } })
    expect(doc.slides[0]!.elements[1]).toMatchObject({ frame: { left: 10, top: 60 } })
    expect(next).not.toBe(doc)
  })

  test('opaque 요소는 이동할 수 없다', () => {
    expect(() => moveElement(fixture(), 'wd-1', 'wd-4', 1, 1)).toThrow('편집할 수 없는 요소')
  })

  test('setElementFrame / setTextHtml', () => {
    const doc = fixture()
    const framed = setElementFrame(doc, 'wd-1', 'wd-2', { left: 1, top: 2, width: 3, height: 4 })
    expect(framed.slides[0]!.elements[0]).toMatchObject({ frame: { left: 1, top: 2, width: 3, height: 4 } })
    const texted = setTextHtml(doc, 'wd-1', 'wd-3', '<p>b</p>')
    expect(texted.slides[0]!.elements[1]).toMatchObject({ html: '<p>b</p>' })
    expect(() => setTextHtml(doc, 'wd-1', 'wd-2', '<p>b</p>')).toThrow('텍스트 요소가 아닙니다')
  })

  test('addElement / removeElement', () => {
    const doc = fixture()
    const gen = createIdGen('new')
    const added = addElement(doc, 'wd-1', createTextElement(gen, { left: 0, top: 0, width: 10, height: 10 }, '<p>n</p>'))
    expect(added.slides[0]!.elements).toHaveLength(4)
    const removed = removeElement(added, 'wd-1', 'new-1')
    expect(removed.slides[0]!.elements).toHaveLength(3)
    expect(() => removeElement(doc, 'wd-1', 'no-such')).toThrow('요소를 찾을 수 없습니다')
  })

  test('moveElementZ — DOM 순서가 z-order다', () => {
    const doc = fixture()
    const ids = (d: DeckDoc) => d.slides[0]!.elements.map((e) => e.id)
    expect(ids(moveElementZ(doc, 'wd-1', 'wd-2', 'forward'))).toEqual(['wd-3', 'wd-2', 'wd-4'])
    expect(ids(moveElementZ(doc, 'wd-1', 'wd-4', 'back'))).toEqual(['wd-4', 'wd-2', 'wd-3'])
    expect(ids(moveElementZ(doc, 'wd-1', 'wd-2', 'front'))).toEqual(['wd-3', 'wd-4', 'wd-2'])
    expect(ids(moveElementZ(doc, 'wd-1', 'wd-2', 'backward'))).toEqual(ids(doc)) // 이미 맨 뒤
  })
})

describe('슬라이드 커맨드', () => {
  test('addSlide는 빈 흰 슬라이드를 삽입한다', () => {
    const doc = fixture()
    const next = addSlide(doc, createIdGen('s'), 0)
    expect(next.slides).toHaveLength(2)
    expect(next.slides[0]).toMatchObject({ id: 's-1', bg: '#ffffff', elements: [] })
  })

  test('duplicateSlide는 새 id로 깊은 복제를 만든다', () => {
    const doc = fixture()
    const next = duplicateSlide(doc, 'wd-1', createIdGen('c'))
    expect(next.slides).toHaveLength(2)
    expect(next.slides[1]!.id).toBe('c-1')
    expect(next.slides[1]!.elements.map((e) => e.id)).toEqual(['c-2', 'c-3', 'c-4'])
    expect(next.slides[1]!.elements[1]).toMatchObject({ type: 'text', html: '<p>a</p>' })
    expect(next.slides[1]!.elements[1]).not.toBe(doc.slides[0]!.elements[1])
  })

  test('removeSlide / moveSlide / setSlideBg', () => {
    const doc = addSlide(fixture(), createIdGen('s'), 1) // [wd-1, s-1]
    expect(removeSlide(doc, 'wd-1').slides.map((s) => s.id)).toEqual(['s-1'])
    expect(() => removeSlide(removeSlide(doc, 'wd-1'), 's-1')).toThrow('마지막 슬라이드')
    expect(moveSlide(doc, 0, 1).slides.map((s) => s.id)).toEqual(['s-1', 'wd-1'])
    expect(setSlideBg(doc, 'wd-1', '#000000').slides[0]!.bg).toBe('#000000')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd editor && npm test`
Expected: FAIL — `./ops.ts` 모듈 없음

- [ ] **Step 3: 구현**

`editor/src/model/ops.ts`:

```ts
import type { DeckDoc, Frame, ImageElement, KnownElement, ShapeElement, Slide, SlideElement, TextElement } from './types.ts'
import { isKnownElement } from './types.ts'

// ---------- 내부 헬퍼 ----------

function slideIndexOf(doc: DeckDoc, slideId: string): number {
  const i = doc.slides.findIndex((s) => s.id === slideId)
  if (i === -1) throw new Error(`슬라이드를 찾을 수 없습니다: ${slideId}`)
  return i
}

function mapSlide(doc: DeckDoc, slideId: string, fn: (slide: Slide) => Slide): DeckDoc {
  const i = slideIndexOf(doc, slideId)
  const slides = doc.slides.slice()
  slides[i] = fn(slides[i]!)
  return { ...doc, slides }
}

function elementIndexOf(slide: Slide, elementId: string): number {
  const i = slide.elements.findIndex((e) => e.id === elementId)
  if (i === -1) throw new Error(`요소를 찾을 수 없습니다: ${elementId}`)
  return i
}

function mapKnownElement(doc: DeckDoc, slideId: string, elementId: string, fn: (el: KnownElement) => KnownElement): DeckDoc {
  return mapSlide(doc, slideId, (slide) => {
    const i = elementIndexOf(slide, elementId)
    const el = slide.elements[i]!
    if (!isKnownElement(el)) throw new Error(`편집할 수 없는 요소입니다 (보존된 원문 블록): ${elementId}`)
    const elements = slide.elements.slice()
    elements[i] = fn(el)
    return { ...slide, elements }
  })
}

// ---------- 요소 커맨드 ----------

export function moveElement(doc: DeckDoc, slideId: string, elementId: string, dx: number, dy: number): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) => ({
    ...el,
    frame: { ...el.frame, left: el.frame.left + dx, top: el.frame.top + dy },
  }))
}

export function setElementFrame(doc: DeckDoc, slideId: string, elementId: string, frame: Frame): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) => ({ ...el, frame: { ...frame } }))
}

export function setTextHtml(doc: DeckDoc, slideId: string, elementId: string, html: string): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) => {
    if (el.type !== 'text') throw new Error(`텍스트 요소가 아닙니다: ${elementId}`)
    return { ...el, html }
  })
}

export function addElement(doc: DeckDoc, slideId: string, element: SlideElement, index?: number): DeckDoc {
  return mapSlide(doc, slideId, (slide) => {
    const elements = slide.elements.slice()
    elements.splice(index ?? elements.length, 0, element)
    return { ...slide, elements }
  })
}

export function removeElement(doc: DeckDoc, slideId: string, elementId: string): DeckDoc {
  return mapSlide(doc, slideId, (slide) => {
    const i = elementIndexOf(slide, elementId)
    const elements = slide.elements.slice()
    elements.splice(i, 1)
    return { ...slide, elements }
  })
}

export type ZDirection = 'forward' | 'backward' | 'front' | 'back'

export function moveElementZ(doc: DeckDoc, slideId: string, elementId: string, dir: ZDirection): DeckDoc {
  return mapSlide(doc, slideId, (slide) => {
    const i = elementIndexOf(slide, elementId)
    const target = { forward: i + 1, backward: i - 1, front: slide.elements.length - 1, back: 0 }[dir]
    const clamped = Math.max(0, Math.min(slide.elements.length - 1, target))
    if (clamped === i) return slide
    const elements = slide.elements.slice()
    const [el] = elements.splice(i, 1)
    elements.splice(clamped, 0, el!)
    return { ...slide, elements }
  })
}

// ---------- 슬라이드 커맨드 ----------

export function addSlide(doc: DeckDoc, idGen: () => string, index?: number): DeckDoc {
  const slide: Slide = { id: idGen(), bg: '#ffffff', elements: [] }
  const slides = doc.slides.slice()
  slides.splice(index ?? slides.length, 0, slide)
  return { ...doc, slides }
}

export function removeSlide(doc: DeckDoc, slideId: string): DeckDoc {
  if (doc.slides.length <= 1) throw new Error('마지막 슬라이드는 삭제할 수 없습니다')
  const i = slideIndexOf(doc, slideId)
  const slides = doc.slides.slice()
  slides.splice(i, 1)
  return { ...doc, slides }
}

export function duplicateSlide(doc: DeckDoc, slideId: string, idGen: () => string): DeckDoc {
  const i = slideIndexOf(doc, slideId)
  const src = doc.slides[i]!
  const copy: Slide = {
    id: idGen(),
    bg: src.bg,
    elements: src.elements.map((el) =>
      el.type === 'opaque'
        ? { ...el, id: idGen() }
        : { ...structuredClone(el), id: idGen() },
    ),
  }
  const slides = doc.slides.slice()
  slides.splice(i + 1, 0, copy)
  return { ...doc, slides }
}

export function moveSlide(doc: DeckDoc, fromIndex: number, toIndex: number): DeckDoc {
  const max = doc.slides.length - 1
  if (fromIndex < 0 || fromIndex > max || toIndex < 0 || toIndex > max) {
    throw new Error(`슬라이드 위치가 범위를 벗어났습니다: ${fromIndex} → ${toIndex}`)
  }
  const slides = doc.slides.slice()
  const [slide] = slides.splice(fromIndex, 1)
  slides.splice(toIndex, 0, slide!)
  return { ...doc, slides }
}

export function setSlideBg(doc: DeckDoc, slideId: string, bg: string | null): DeckDoc {
  return mapSlide(doc, slideId, (slide) => ({ ...slide, bg }))
}

// ---------- 팩토리 ----------

export function createTextElement(idGen: () => string, frame: Frame, html: string): TextElement {
  return { type: 'text', id: idGen(), frame: { ...frame }, extraStyle: {}, extraAttrs: {}, html }
}

export function createShapeElement(idGen: () => string, frame: Frame, background: string): ShapeElement {
  return { type: 'shape', id: idGen(), frame: { ...frame }, extraStyle: { background }, extraAttrs: {}, shape: 'rect' }
}

export function createImageElement(idGen: () => string, frame: Frame, src: string, alt: string): ImageElement {
  return { type: 'image', id: idGen(), frame: { ...frame }, extraStyle: {}, extraAttrs: {}, src, alt, imgStyle: 'width:100%; height:100%;' }
}
```

- [ ] **Step 4: 테스트와 타입체크 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/
git commit -m "feat: 불변 편집 커맨드(요소/슬라이드/팩토리) 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: undo/redo 히스토리

**Files:**
- Create: `editor/src/model/history.ts`
- Test: `editor/src/model/history.test.ts`

**Interfaces:**
- Consumes: `DeckDoc` (불변이므로 스냅샷은 참조 저장)
- Produces: `createHistory(initial) → History`, `push(h, next)`, `undo(h)`, `redo(h)`, `canUndo(h)`, `canRedo(h)` — 전부 불변. `History { past: DeckDoc[], present: DeckDoc, future: DeckDoc[] }`. past는 `HISTORY_LIMIT`(100)개로 제한

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/history.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { HISTORY_LIMIT, canRedo, canUndo, createHistory, push, redo, undo } from './history.ts'
import type { DeckDoc } from './types.ts'

function doc(title: string): DeckDoc {
  return { title, slideWidth: 1280, slideHeight: 720, headExtra: '', bodyScript: '', htmlAttrs: {}, slides: [] }
}

describe('history', () => {
  test('push → undo → redo', () => {
    let h = createHistory(doc('v1'))
    expect(canUndo(h)).toBe(false)
    h = push(h, doc('v2'))
    h = push(h, doc('v3'))
    expect(h.present.title).toBe('v3')
    h = undo(h)
    expect(h.present.title).toBe('v2')
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present.title).toBe('v3')
  })

  test('경계에서 undo/redo는 상태를 그대로 반환한다', () => {
    const h = createHistory(doc('v1'))
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })

  test('undo 후 push는 future를 버린다', () => {
    let h = push(createHistory(doc('v1')), doc('v2'))
    h = undo(h)
    h = push(h, doc('v2b'))
    expect(canRedo(h)).toBe(false)
    expect(h.present.title).toBe('v2b')
  })

  test('past는 HISTORY_LIMIT으로 제한된다', () => {
    let h = createHistory(doc('v0'))
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = push(h, doc(`v${i}`))
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]!.title).toBe(`v${10}`)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd editor && npm test`
Expected: FAIL — `./history.ts` 모듈 없음

- [ ] **Step 3: 구현**

`editor/src/model/history.ts`:

```ts
import type { DeckDoc } from './types.ts'

export const HISTORY_LIMIT = 100

export interface History {
  past: DeckDoc[]
  present: DeckDoc
  future: DeckDoc[]
}

export function createHistory(initial: DeckDoc): History {
  return { past: [], present: initial, future: [] }
}

export function push(h: History, next: DeckDoc): History {
  const past = [...h.past, h.present]
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT)
  return { past, present: next, future: [] }
}

export function undo(h: History): History {
  if (h.past.length === 0) return h
  const past = h.past.slice(0, -1)
  const present = h.past[h.past.length - 1]!
  return { past, present, future: [h.present, ...h.future] }
}

export function redo(h: History): History {
  if (h.future.length === 0) return h
  const [present, ...future] = h.future
  return { past: [...h.past, h.present], present: present!, future }
}

export function canUndo(h: History): boolean {
  return h.past.length > 0
}

export function canRedo(h: History): boolean {
  return h.future.length > 0
}
```

- [ ] **Step 4: 테스트와 타입체크 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/
git commit -m "feat: undo/redo 히스토리 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 통합 시나리오 테스트 + 문서 갱신

**Files:**
- Create: `editor/src/model/integration.test.ts`
- Modify: `README.md`
- Modify: `package.json` (루트)

**Interfaces:**
- Consumes: 전체 모델 API (parse/serialize/ops/history), tools 검증기
- Produces: "열기 → 편집 → undo → 저장" 실전 시나리오의 회귀 테스트, 루트에서 에디터 테스트를 실행하는 `npm run test:editor`, 갱신된 README

- [ ] **Step 1: 통합 테스트 작성**

`editor/src/model/integration.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { validateWebdeck } from '../../../tools/lib/validate.mjs'
import { createHistory, push, undo } from './history.ts'
import { createIdGen } from './id.ts'
import { addSlide, createTextElement, addElement, moveElement, removeSlide, setTextHtml } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { serializeWebdeck } from './serialize.ts'

const TEMPLATE = fileURLToPath(new URL('../../../templates/business-report.html', import.meta.url))

test('열기 → 편집 → undo → 저장 시나리오', () => {
  // 열기
  const original = parseWebdeck(readFileSync(TEMPLATE, 'utf8'))
  let history = createHistory(original)
  const gen = createIdGen('edit')

  // 편집 1: 표지 제목 텍스트 교체 (첫 슬라이드의 첫 text 요소)
  const cover = history.present.slides[0]!
  const titleEl = cover.elements.find((e) => e.type === 'text')!
  history = push(history, setTextHtml(history.present, cover.id, titleEl.id, '<p><strong><span style="font-size:54px;">수정된 제목</span></strong></p>'))

  // 편집 2: 새 슬라이드 추가 + 텍스트 상자 삽입 + 이동
  let doc = addSlide(history.present, gen)
  const newSlide = doc.slides[doc.slides.length - 1]!
  doc = addElement(doc, newSlide.id, createTextElement(gen, { left: 96, top: 64, width: 800, height: 80 }, '<p><strong><span style="font-size:36px;">추가 슬라이드</span></strong></p>'))
  const newText = doc.slides[doc.slides.length - 1]!.elements[0]!
  doc = moveElement(doc, newSlide.id, newText.id, 0, 100)
  history = push(history, doc)

  // 편집 3: 마지막 슬라이드 삭제 → undo로 되돌림
  history = push(history, removeSlide(history.present, newSlide.id))
  expect(history.present.slides).toHaveLength(4)
  history = undo(history)
  expect(history.present.slides).toHaveLength(5)

  // 저장: 직렬화 결과가 검증기를 통과하고, 다시 열어도 같은 모델
  const saved = serializeWebdeck(history.present)
  const { errors, warnings } = validateWebdeck(saved)
  expect(errors).toEqual([])
  expect(warnings).toEqual([])

  const reopened = parseWebdeck(saved)
  expect(reopened.slides).toHaveLength(5)
  expect(serializeWebdeck(reopened)).toBe(saved)

  // 원본 모델은 처음부터 끝까지 오염되지 않았다
  expect(original.slides).toHaveLength(4)
  expect(original.slides[0]!.elements.find((e) => e.type === 'text')).toMatchObject({ html: expect.stringContaining('2026년 상반기 업무 보고') })
})
```

- [ ] **Step 2: 테스트 실행**

Run: `cd editor && npm test && npm run typecheck`
Expected: PASS — 전체 테스트 통과 (통합 1개 포함)

- [ ] **Step 3: 루트 package.json에 에디터 테스트 연결**

루트 `package.json`의 scripts를 다음으로 교체:

```json
  "scripts": {
    "test": "node --test 'tools/**/*.test.mjs'",
    "test:editor": "npm --prefix editor test",
    "test:all": "npm test && npm run test:editor",
    "validate": "node tools/validate-webdeck.mjs"
  },
```

Run: `npm run test:all`
Expected: tools 22개 + editor 전체 테스트 PASS

- [ ] **Step 4: README 갱신**

`README.md`의 「현재 제공 (Plan 1)」 섹션 제목을 「현재 제공」으로 바꾸고, 목록 끝에 추가:

```markdown
- **에디터 코어 (Plan 2)** — `editor/src/model/`: 문서 모델, HTML↔모델 파서/직렬화(왕복 보존), 편집 커맨드, undo/redo. UI 없이 완전히 테스트됨 (`npm run test:editor`)
```

「로드맵」 섹션을 다음으로 교체:

```markdown
## 로드맵

- ~~Plan 1: 포맷 & 도구~~ (완료)
- ~~Plan 2: 에디터 코어~~ (완료)
- Plan 3: 에디터 UI (캔버스 편집, 슬라이드 패널, 파일 열기/저장)
```

- [ ] **Step 5: 최종 확인 및 커밋**

Run: `npm run test:all`
Expected: PASS

```bash
git add editor/src/model/integration.test.ts package.json README.md
git commit -m "feat: 통합 시나리오 테스트와 test:all 스크립트, README 갱신

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
