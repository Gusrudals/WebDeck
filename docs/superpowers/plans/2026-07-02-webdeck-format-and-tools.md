# WebDeck 포맷 & 도구 구현 계획 (Plan 1/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebDeck 표준 포맷 v1을 실체화한다 — 포맷 검증 라이브러리/CLI, 브라우저에서 바로 열리는 완성 템플릿 3종, AI Agent용 생성 가이드.

**Architecture:** 검증 로직은 순수 함수 라이브러리(`tools/lib/validate.mjs`)로 만들고 CLI는 얇은 래퍼로 감싼다. 템플릿은 자기완결형 단일 .html 파일(뷰어 CSS/JS 인라인)이며, 템플릿 검증 테스트가 `templates/*.html` 전체를 자동으로 검사한다. 스펙: `docs/superpowers/specs/2026-07-02-webdeck-design.md`

**Tech Stack:** Node 20+ (ESM), `node-html-parser`(유일한 의존성), `node --test`(내장 테스트 러너)

**전체 로드맵:** Plan 1(본 문서: 포맷 & 도구) → Plan 2(에디터 코어: 모델/파서/직렬화/undo) → Plan 3(에디터 UI). Plan 2·3은 Plan 1 완료 후 별도 작성.

## Global Constraints

- Node 20 이상, ESM 모듈(`.mjs`), 외부 의존성은 `node-html-parser` 1개만 (테스트는 내장 `node --test`, 다른 테스트 프레임워크 금지)
- 포맷 v1 규칙 (스펙 §5): `<html data-webdeck-version="1">`, 캔버스 1280×720(`data-slide-width/height`), 슬라이드는 `<section class="slide">`(deck의 유일한 자식 타입), 요소는 `.el` + 타입 클래스(`el-text`/`el-image`/`el-shape`), 인라인 style의 `left/top/width/height`는 px 단위, z-order는 DOM 순서, 이미지는 data URI, 외부 `<script src>`/`<link rel="stylesheet">` 금지(자기완결형)
- 테마 변수 이름(고정): `--wd-primary`, `--wd-accent`, `--wd-text`, `--wd-muted`, `--wd-font-heading`, `--wd-font-body`
- 사용자에게 보이는 모든 문구(오류 메시지, 문서, 템플릿 내용)는 한국어
- 커밋 메시지는 conventional commits(`feat:`/`docs:`) + 마지막 줄에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 모든 명령은 리포지토리 루트(`webdeck/`)에서 실행

---

### Task 1: 포맷 검증 라이브러리

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tools/lib/validate.mjs`
- Create: `tools/lib/test-helpers.mjs`
- Test: `tools/lib/validate.test.mjs`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `validateWebdeck(html: string) → { errors: string[], warnings: string[] }` — 문서 전체 검증. 오류 0건이면 유효한 문서
  - `parseInlineStyle(styleText: string) → { [prop: string]: string }` — 인라인 style 문자열을 소문자 속성 맵으로 파싱
  - `ELEMENT_TYPES = ['el-text', 'el-image', 'el-shape']`
  - 테스트 헬퍼: `makeDoc({ version, deckAttrs, slides, extraHead })` — 유효한 WebDeck 문서 문자열 생성, `DEFAULT_SLIDE` — 기본 슬라이드 HTML

- [ ] **Step 1: 프로젝트 스캐폴드**

`package.json` 생성:

```json
{
  "name": "webdeck",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test tools/",
    "validate": "node tools/validate-webdeck.mjs"
  },
  "dependencies": {
    "node-html-parser": "^7.0.1"
  }
}
```

`.gitignore` 생성:

```
node_modules/
dist/
.DS_Store
```

의존성 설치:

```bash
npm install
```

Expected: `node_modules/`에 node-html-parser 설치됨, `package-lock.json` 생성됨

- [ ] **Step 2: 테스트 헬퍼 작성**

`tools/lib/test-helpers.mjs`:

```js
export const DEFAULT_SLIDE = `<section class="slide" data-bg="#ffffff">
  <div class="el el-text" style="left:96px; top:80px; width:1088px; height:120px;"><p>제목</p></div>
</section>`

export function makeDoc({
  version = '1',
  deckAttrs = 'data-slide-width="1280" data-slide-height="720"',
  slides = DEFAULT_SLIDE,
  extraHead = '',
} = {}) {
  const versionAttr = version === null ? '' : ` data-webdeck-version="${version}"`
  return `<!DOCTYPE html>
<html lang="ko"${versionAttr}>
<head>
<meta charset="utf-8">
<title>테스트 문서</title>
<style>.el { position: absolute; }</style>
${extraHead}
</head>
<body>
<main class="deck" ${deckAttrs}>
${slides}
</main>
</body>
</html>`
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

`tools/lib/validate.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateWebdeck, parseInlineStyle } from './validate.mjs'
import { makeDoc } from './test-helpers.mjs'

test('유효한 문서는 오류와 경고가 없다', () => {
  const { errors, warnings } = validateWebdeck(makeDoc())
  assert.deepEqual(errors, [])
  assert.deepEqual(warnings, [])
})

test('data-webdeck-version 누락은 오류', () => {
  const { errors } = validateWebdeck(makeDoc({ version: null }))
  assert.ok(errors.some((e) => e.includes('data-webdeck-version')))
})

test('deck의 크기 속성 누락은 오류', () => {
  const { errors } = validateWebdeck(makeDoc({ deckAttrs: '' }))
  assert.ok(errors.some((e) => e.includes('data-slide-width')))
  assert.ok(errors.some((e) => e.includes('data-slide-height')))
})

test('슬라이드가 없으면 오류', () => {
  const { errors } = validateWebdeck(makeDoc({ slides: '' }))
  assert.ok(errors.some((e) => e.includes('슬라이드')))
})

test('슬라이드 자식이 .el이 아니면 오류', () => {
  const slides = `<section class="slide"><p>맨몸 텍스트</p></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('.el')))
})

test('.el에 타입 클래스가 없으면 오류', () => {
  const slides = `<section class="slide"><div class="el" style="left:0px; top:0px; width:100px; height:100px;"></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('타입 클래스')))
})

test('위치/크기 style 누락은 오류', () => {
  const slides = `<section class="slide"><div class="el el-text" style="left:0px; top:0px;"><p>x</p></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('width')))
  assert.ok(errors.some((e) => e.includes('height')))
})

test('px가 아닌 단위는 오류', () => {
  const slides = `<section class="slide"><div class="el el-text" style="left:10%; top:0px; width:100px; height:100px;"><p>x</p></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('px 단위')))
})

test('캔버스를 벗어난 요소는 경고', () => {
  const slides = `<section class="slide"><div class="el el-text" style="left:1200px; top:0px; width:200px; height:100px;"><p>x</p></div></section>`
  const { errors, warnings } = validateWebdeck(makeDoc({ slides }))
  assert.deepEqual(errors, [])
  assert.ok(warnings.some((w) => w.includes('밖으로')))
})

test('el-shape에 data-shape="rect"가 없으면 오류', () => {
  const slides = `<section class="slide"><div class="el el-shape" style="left:0px; top:0px; width:100px; height:100px;"></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('data-shape')))
})

test('data URI가 아닌 이미지는 경고', () => {
  const slides = `<section class="slide"><div class="el el-image" style="left:0px; top:0px; width:100px; height:100px;"><img src="https://example.com/a.png" alt="외부"></div></section>`
  const { errors, warnings } = validateWebdeck(makeDoc({ slides }))
  assert.deepEqual(errors, [])
  assert.ok(warnings.some((w) => w.includes('data URI')))
})

test('외부 스크립트는 오류', () => {
  const doc = makeDoc({ extraHead: '<script src="https://cdn.example.com/x.js"></script>' })
  const { errors } = validateWebdeck(doc)
  assert.ok(errors.some((e) => e.includes('script')))
})

test('parseInlineStyle은 선언을 소문자 속성 맵으로 파싱한다', () => {
  assert.deepEqual(parseInlineStyle('LEFT: 10px; top:20px ; color: var(--wd-text)'), {
    left: '10px',
    top: '20px',
    color: 'var(--wd-text)',
  })
})
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module ... tools/lib/validate.mjs` (ERR_MODULE_NOT_FOUND)

- [ ] **Step 5: 검증 라이브러리 구현**

`tools/lib/validate.mjs`:

```js
import { parse } from 'node-html-parser'

export const ELEMENT_TYPES = ['el-text', 'el-image', 'el-shape']

const REQUIRED_STYLE_PROPS = ['left', 'top', 'width', 'height']
const PX_VALUE = /^-?\d+(\.\d+)?px$/

export function parseInlineStyle(styleText) {
  const out = {}
  for (const decl of String(styleText).split(';')) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const value = decl.slice(idx + 1).trim()
    if (prop) out[prop] = value
  }
  return out
}

export function validateWebdeck(html) {
  const errors = []
  const warnings = []
  const root = parse(html)

  const htmlEl = root.querySelector('html')
  if (!htmlEl) {
    errors.push('문서: <html> 태그가 없습니다')
    return { errors, warnings }
  }
  if (htmlEl.getAttribute('data-webdeck-version') !== '1') {
    errors.push('문서: <html>에 data-webdeck-version="1" 속성이 필요합니다')
  }

  const charset = root.querySelector('meta[charset]')
  if (!charset || (charset.getAttribute('charset') || '').toLowerCase() !== 'utf-8') {
    warnings.push('문서: <meta charset="utf-8">가 필요합니다')
  }
  const title = root.querySelector('title')
  if (!title || !title.text.trim()) {
    warnings.push('문서: <title>이 비어 있습니다')
  }
  if (root.querySelector('script[src]')) {
    errors.push('문서: 외부 <script src="...">는 허용되지 않습니다 (자기완결형 원칙)')
  }
  if (root.querySelector('link[rel="stylesheet"]')) {
    errors.push('문서: 외부 스타일시트 <link>는 허용되지 않습니다 (자기완결형 원칙)')
  }

  const decks = root.querySelectorAll('main.deck')
  if (decks.length !== 1) {
    errors.push(`문서: <main class="deck">가 정확히 1개여야 합니다 (현재 ${decks.length}개)`)
    return { errors, warnings }
  }
  const deck = decks[0]
  const canvasW = Number(deck.getAttribute('data-slide-width'))
  const canvasH = Number(deck.getAttribute('data-slide-height'))
  if (!Number.isFinite(canvasW) || canvasW <= 0) errors.push('deck: data-slide-width는 양수여야 합니다')
  if (!Number.isFinite(canvasH) || canvasH <= 0) errors.push('deck: data-slide-height는 양수여야 합니다')

  const deckChildren = deck.childNodes.filter((n) => n.nodeType === 1)
  const slides = deckChildren.filter(
    (n) => n.rawTagName.toLowerCase() === 'section' && n.classList.contains('slide'),
  )
  if (slides.length !== deckChildren.length) {
    errors.push('deck: <main class="deck">의 자식은 <section class="slide">만 허용됩니다')
  }
  if (slides.length === 0) {
    errors.push('deck: 슬라이드(<section class="slide">)가 1개 이상 필요합니다')
  }

  slides.forEach((slide, i) => {
    validateSlide(slide, i + 1, { canvasW, canvasH, errors, warnings })
  })

  return { errors, warnings }
}

function validateSlide(slide, num, ctx) {
  const { canvasW, canvasH, errors, warnings } = ctx
  const label = `슬라이드 ${num}`
  const children = slide.childNodes.filter((n) => n.nodeType === 1)

  for (const el of children) {
    if (!el.classList.contains('el')) {
      errors.push(`${label}: 슬라이드의 자식은 .el 요소여야 합니다 (<${el.rawTagName}> 발견)`)
      continue
    }
    const type = ELEMENT_TYPES.find((t) => el.classList.contains(t))
    if (!type) {
      errors.push(`${label}: .el 요소에 타입 클래스(${ELEMENT_TYPES.join('/')})가 없습니다`)
      continue
    }

    const style = parseInlineStyle(el.getAttribute('style') || '')
    let hasAllProps = true
    for (const prop of REQUIRED_STYLE_PROPS) {
      const value = style[prop]
      if (value === undefined) {
        errors.push(`${label}: ${type} 요소의 style에 ${prop}가 없습니다`)
        hasAllProps = false
      } else if (!PX_VALUE.test(value)) {
        errors.push(`${label}: ${type} 요소의 ${prop}는 px 단위여야 합니다 (현재 "${value}")`)
        hasAllProps = false
      }
    }
    if (hasAllProps && canvasW > 0 && canvasH > 0) {
      const left = parseFloat(style.left)
      const top = parseFloat(style.top)
      const width = parseFloat(style.width)
      const height = parseFloat(style.height)
      if (left < 0 || top < 0 || left + width > canvasW || top + height > canvasH) {
        warnings.push(`${label}: ${type} 요소가 캔버스(${canvasW}×${canvasH}) 밖으로 나갑니다`)
      }
    }

    if (type === 'el-image') validateImage(el, label, ctx)
    if (type === 'el-shape' && el.getAttribute('data-shape') !== 'rect') {
      errors.push(`${label}: el-shape는 data-shape="rect"만 지원합니다 (v1)`)
    }
  }
}

function validateImage(el, label, { errors, warnings }) {
  const imgs = el.querySelectorAll('img')
  if (imgs.length !== 1) {
    errors.push(`${label}: el-image에는 <img>가 정확히 1개 있어야 합니다 (현재 ${imgs.length}개)`)
    return
  }
  const img = imgs[0]
  const src = img.getAttribute('src') || ''
  if (!src) {
    errors.push(`${label}: <img>에 src가 없습니다`)
  } else if (!src.startsWith('data:')) {
    warnings.push(`${label}: 이미지 src가 data URI가 아닙니다 (단일 파일 유통이 깨질 수 있음)`)
  }
  if (img.getAttribute('alt') === undefined || img.getAttribute('alt') === null) {
    warnings.push(`${label}: <img>에 alt 속성이 없습니다`)
  }
}
```

- [ ] **Step 6: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 13개 테스트 전부 통과

주의: `node-html-parser`의 API 차이로 실패하면 확인할 것 — 요소 노드는 `nodeType === 1`, 태그명은 `rawTagName`(원문 그대로), 클래스는 `classList.contains()`. `getAttribute`는 속성이 없으면 `undefined`를 반환한다.

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json .gitignore tools/
git commit -m "feat: WebDeck 포맷 검증 라이브러리 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 검증 CLI

**Files:**
- Create: `tools/validate-webdeck.mjs`
- Test: `tools/cli.test.mjs`

**Interfaces:**
- Consumes: `validateWebdeck(html)` (Task 1), `makeDoc()` (Task 1 테스트 헬퍼)
- Produces: CLI `node tools/validate-webdeck.mjs <문서.html>` — 종료 코드 0(통과)/1(오류 있음)/2(사용법·파일 오류). AI Agent가 생성→검증→수정 루프에 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`tools/cli.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeDoc } from './lib/test-helpers.mjs'

const CLI = fileURLToPath(new URL('./validate-webdeck.mjs', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'webdeck-'))

function run(args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }) }
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

test('유효한 문서는 종료 코드 0과 "통과" 출력', () => {
  const file = join(dir, 'valid.html')
  writeFileSync(file, makeDoc())
  const { code, out } = run([file])
  assert.equal(code, 0)
  assert.ok(out.includes('통과'))
})

test('오류가 있는 문서는 종료 코드 1과 오류 목록 출력', () => {
  const file = join(dir, 'invalid.html')
  writeFileSync(file, makeDoc({ version: null }))
  const { code, out } = run([file])
  assert.equal(code, 1)
  assert.ok(out.includes('오류:'))
  assert.ok(out.includes('실패'))
})

test('인자가 없으면 종료 코드 2와 사용법 출력', () => {
  const { code, out } = run([])
  assert.equal(code, 2)
  assert.ok(out.includes('사용법'))
})

test('없는 파일은 종료 코드 2', () => {
  const { code, out } = run([join(dir, 'no-such-file.html')])
  assert.equal(code, 2)
  assert.ok(out.includes('읽을 수 없습니다'))
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — cli.test.mjs의 4개 테스트가 실패 (CLI 파일 없음 → `run()`의 code가 기대값과 다름). Task 1의 13개 테스트는 계속 통과

- [ ] **Step 3: CLI 구현**

`tools/validate-webdeck.mjs`:

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { validateWebdeck } from './lib/validate.mjs'

const file = process.argv[2]
if (!file) {
  console.error('사용법: node tools/validate-webdeck.mjs <문서.html>')
  process.exit(2)
}

let html
try {
  html = readFileSync(file, 'utf8')
} catch {
  console.error(`파일을 읽을 수 없습니다: ${file}`)
  process.exit(2)
}

const { errors, warnings } = validateWebdeck(html)
for (const w of warnings) console.log(`경고: ${w}`)
for (const e of errors) console.log(`오류: ${e}`)

if (errors.length === 0) {
  console.log(`통과: ${file} (경고 ${warnings.length}건)`)
  process.exit(0)
}
console.log(`실패: ${file} — 오류 ${errors.length}건, 경고 ${warnings.length}건`)
process.exit(1)
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 17개 테스트 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add tools/validate-webdeck.mjs tools/cli.test.mjs
git commit -m "feat: 포맷 검증 CLI 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 템플릿 검증 테스트 + minimal 템플릿

**Files:**
- Create: `templates/minimal.html`
- Test: `tools/templates.test.mjs`

**Interfaces:**
- Consumes: `validateWebdeck(html)` (Task 1)
- Produces: `templates/` 디렉토리의 모든 .html이 오류·경고 0건임을 보장하는 테스트(이후 템플릿 태스크가 자동으로 검증됨), `templates/minimal.html`(AI Agent의 시작점이 되는 최소 골격 — 뷰어 런타임의 원본)

**뷰어 런타임 참고:** 이 태스크의 `<style>`/`<script>` 블록이 뷰어 런타임의 원본이다. Task 4·5의 템플릿도 동일한 블록을 사용한다(자기완결형 원칙 때문에 파일마다 인라인으로 반복 — 의도된 중복).

- [ ] **Step 1: 실패하는 테스트 작성**

`tools/templates.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateWebdeck } from './lib/validate.mjs'

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url))

test('모든 템플릿이 포맷 검증을 통과한다 (오류·경고 0건)', () => {
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.html'))
  assert.ok(files.length >= 1, 'templates/에 .html 템플릿이 없습니다')
  for (const f of files) {
    const { errors, warnings } = validateWebdeck(readFileSync(join(TEMPLATES_DIR, f), 'utf8'))
    assert.deepEqual(errors, [], `${f} 오류: ${errors.join(' / ')}`)
    assert.deepEqual(warnings, [], `${f} 경고: ${warnings.join(' / ')}`)
  }
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `templates/` 디렉토리가 없어 readdirSync에서 ENOENT

- [ ] **Step 3: minimal 템플릿 작성**

`templates/minimal.html` (전체 내용):

```html
<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head>
<meta charset="utf-8">
<title>WebDeck 문서</title>
<style>
  :root {
    --wd-primary: #1a56db;
    --wd-accent: #e8f0fe;
    --wd-text: #1f2937;
    --wd-muted: #6b7280;
    --wd-font-heading: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
    --wd-font-body: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e5e7eb; font-family: var(--wd-font-body); color: var(--wd-text); }
  .deck { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 0; }
  .slide {
    position: relative; width: 1280px; height: 720px; flex: none;
    background: #fff; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }
  .el { position: absolute; }
  .el-text p { margin: 0; }
  @media print {
    body { background: none; }
    .deck { display: block; padding: 0; }
    .slide { box-shadow: none; page-break-after: always; }
  }
  @page { size: 1280px 720px; margin: 0; }
</style>
</head>
<body>
<main class="deck" data-slide-width="1280" data-slide-height="720">

  <section class="slide" data-bg="#ffffff">
    <div class="el el-shape" data-shape="rect" style="left:0px; top:600px; width:1280px; height:120px; background:var(--wd-accent);"></div>
    <div class="el el-text" style="left:96px; top:240px; width:1088px; height:140px;">
      <p><strong><span style="font-size:54px;">문서 제목</span></strong></p>
    </div>
    <div class="el el-text" style="left:96px; top:400px; width:1088px; height:60px;">
      <p><span style="font-size:24px; color:var(--wd-muted);">부제목 · 부서명 · 2026. 07.</span></p>
    </div>
  </section>

  <section class="slide" data-bg="#ffffff">
    <div class="el el-text" style="left:96px; top:64px; width:1088px; height:80px;">
      <p><strong><span style="font-size:36px;">섹션 제목</span></strong></p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:150px; width:64px; height:6px; background:var(--wd-primary);"></div>
    <div class="el el-text" style="left:96px; top:200px; width:1088px; height:440px;">
      <p><span style="font-size:24px;">본문 내용을 여기에 작성합니다.</span></p>
    </div>
  </section>

</main>
<script>
  (function () {
    document.querySelectorAll('.slide').forEach(function (slide) {
      if (slide.dataset.bg) slide.style.background = slide.dataset.bg;
    });
    var deck = document.querySelector('.deck');
    var slideWidth = Number(deck.dataset.slideWidth) || 1280;
    function fit() {
      deck.style.zoom = Math.min(1, (window.innerWidth - 48) / slideWidth);
    }
    window.addEventListener('resize', fit);
    window.addEventListener('beforeprint', function () { deck.style.zoom = 1; });
    window.addEventListener('afterprint', fit);
    fit();
  })();
</script>
</body>
</html>
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 18개 테스트 전부 통과

- [ ] **Step 5: 브라우저 육안 확인**

Run: `open templates/minimal.html`
Expected: 슬라이드 2장이 세로로 나열되어 보이고, 창 폭을 줄이면 슬라이드가 축소된다. 인쇄 미리보기(Cmd+P)에서 슬라이드 1장 = 1페이지

- [ ] **Step 6: 커밋**

```bash
git add templates/minimal.html tools/templates.test.mjs
git commit -m "feat: minimal 템플릿과 템플릿 자동 검증 테스트 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 업무 보고서 템플릿

**Files:**
- Create: `templates/business-report.html`

**Interfaces:**
- Consumes: Task 3의 템플릿 자동 검증 테스트(추가 테스트 코드 불필요), Task 3과 동일한 뷰어 런타임 블록
- Produces: 표지/목차/본문 2단/요약 카드 구성의 완성 예제 — AI 가이드(Task 6)가 참조하는 한국 보고서 표준 레이아웃

- [ ] **Step 1: 템플릿 작성**

`templates/business-report.html` (전체 내용). `<style>`·`<script>` 블록은 Task 3 Step 3의 minimal.html과 완전히 동일하므로 그대로 복사한다. `<body>`의 deck 내용:

```html
<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head>
<meta charset="utf-8">
<title>2026년 상반기 업무 보고</title>
<style>
  :root {
    --wd-primary: #1a56db;
    --wd-accent: #e8f0fe;
    --wd-text: #1f2937;
    --wd-muted: #6b7280;
    --wd-font-heading: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
    --wd-font-body: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e5e7eb; font-family: var(--wd-font-body); color: var(--wd-text); }
  .deck { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 0; }
  .slide {
    position: relative; width: 1280px; height: 720px; flex: none;
    background: #fff; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }
  .el { position: absolute; }
  .el-text p { margin: 0; }
  @media print {
    body { background: none; }
    .deck { display: block; padding: 0; }
    .slide { box-shadow: none; page-break-after: always; }
  }
  @page { size: 1280px 720px; margin: 0; }
</style>
</head>
<body>
<main class="deck" data-slide-width="1280" data-slide-height="720">

  <!-- 1. 표지 -->
  <section class="slide" data-bg="#ffffff">
    <div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:1280px; height:12px; background:var(--wd-primary);"></div>
    <div class="el el-text" style="left:96px; top:240px; width:1088px; height:140px;">
      <p><strong><span style="font-size:54px;">2026년 상반기 업무 보고</span></strong></p>
    </div>
    <div class="el el-text" style="left:96px; top:400px; width:1088px; height:60px;">
      <p><span style="font-size:24px; color:var(--wd-muted);">경영기획팀 · 2026. 07. 02.</span></p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:0px; top:600px; width:1280px; height:120px; background:var(--wd-accent);"></div>
    <div class="el el-text" style="left:96px; top:644px; width:600px; height:40px;">
      <p><span style="font-size:18px; color:var(--wd-muted);">WebDeck — AI 생성 · 사람 편집 HTML 보고서</span></p>
    </div>
  </section>

  <!-- 2. 목차 -->
  <section class="slide" data-bg="#ffffff">
    <div class="el el-text" style="left:96px; top:64px; width:400px; height:80px;">
      <p><strong><span style="font-size:36px;">목차</span></strong></p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:150px; width:64px; height:6px; background:var(--wd-primary);"></div>
    <div class="el el-text" style="left:96px; top:200px; width:1088px; height:400px;">
      <p style="font-size:26px; margin-bottom:20px;">1. 상반기 주요 성과</p>
      <p style="font-size:26px; margin-bottom:20px;">2. 핵심 지표 현황</p>
      <p style="font-size:26px; margin-bottom:20px;">3. 하반기 계획</p>
      <p style="font-size:26px;">4. 요청 사항</p>
    </div>
  </section>

  <!-- 3. 본문 2단 -->
  <section class="slide" data-bg="#ffffff">
    <div class="el el-text" style="left:96px; top:64px; width:900px; height:80px;">
      <p><strong><span style="font-size:36px;">1. 상반기 주요 성과</span></strong></p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:150px; width:64px; height:6px; background:var(--wd-primary);"></div>
    <div class="el el-text" style="left:96px; top:200px; width:520px; height:440px;">
      <p style="font-size:22px; margin-bottom:16px;">• 신규 고객 12개사 확보</p>
      <p style="font-size:22px; margin-bottom:16px;">• 주요 프로젝트 3건 완료</p>
      <p style="font-size:22px; margin-bottom:16px;">• 고객 만족도 4.6/5.0 달성</p>
      <p style="font-size:22px;">• 운영 비용 8% 절감</p>
    </div>
    <div class="el el-image" style="left:664px; top:200px; width:520px; height:440px;">
      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='520' height='440'%3E%3Crect width='520' height='440' fill='%23e8f0fe'/%3E%3Ctext x='260' y='226' text-anchor='middle' font-family='sans-serif' font-size='22' fill='%236b7280'%3EIMAGE%3C/text%3E%3C/svg%3E" alt="성과 차트 자리" style="width:100%; height:100%;">
    </div>
  </section>

  <!-- 4. 요약 카드 3열 -->
  <section class="slide" data-bg="#ffffff">
    <div class="el el-text" style="left:96px; top:64px; width:900px; height:80px;">
      <p><strong><span style="font-size:36px;">하반기 계획 요약</span></strong></p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:150px; width:64px; height:6px; background:var(--wd-primary);"></div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:220px; width:344px; height:300px; background:var(--wd-accent);"></div>
    <div class="el el-text" style="left:120px; top:252px; width:296px; height:236px;">
      <p style="font-size:24px; margin-bottom:16px;"><strong>고객 확대</strong></p>
      <p style="font-size:18px; color:var(--wd-muted);">신규 시장 진출 및 파트너십 확대</p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:468px; top:220px; width:344px; height:300px; background:var(--wd-accent);"></div>
    <div class="el el-text" style="left:492px; top:252px; width:296px; height:236px;">
      <p style="font-size:24px; margin-bottom:16px;"><strong>제품 고도화</strong></p>
      <p style="font-size:18px; color:var(--wd-muted);">핵심 기능 개선과 품질 안정화</p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:840px; top:220px; width:344px; height:300px; background:var(--wd-accent);"></div>
    <div class="el el-text" style="left:864px; top:252px; width:296px; height:236px;">
      <p style="font-size:24px; margin-bottom:16px;"><strong>운영 효율화</strong></p>
      <p style="font-size:18px; color:var(--wd-muted);">프로세스 자동화로 비용 절감</p>
    </div>
  </section>

</main>
<script>
  (function () {
    document.querySelectorAll('.slide').forEach(function (slide) {
      if (slide.dataset.bg) slide.style.background = slide.dataset.bg;
    });
    var deck = document.querySelector('.deck');
    var slideWidth = Number(deck.dataset.slideWidth) || 1280;
    function fit() {
      deck.style.zoom = Math.min(1, (window.innerWidth - 48) / slideWidth);
    }
    window.addEventListener('resize', fit);
    window.addEventListener('beforeprint', function () { deck.style.zoom = 1; });
    window.addEventListener('afterprint', fit);
    fit();
  })();
</script>
</body>
</html>
```

- [ ] **Step 2: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 템플릿 자동 검증 테스트가 business-report.html도 검사 (오류·경고 0건)

- [ ] **Step 3: 브라우저 육안 확인**

Run: `open templates/business-report.html`
Expected: 표지·목차·2단 본문·카드 3열 슬라이드 4장이 정상 표시

- [ ] **Step 4: 커밋**

```bash
git add templates/business-report.html
git commit -m "feat: 업무 보고서 템플릿 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 기획 제안서 템플릿

**Files:**
- Create: `templates/project-proposal.html`

**Interfaces:**
- Consumes: Task 3의 템플릿 자동 검증 테스트, Task 3과 동일한 뷰어 런타임 블록
- Produces: 풀블리드 표지/문제 정의/제안 개요 2단/로드맵 구성의 완성 예제

- [ ] **Step 1: 템플릿 작성**

`templates/project-proposal.html` (전체 내용). `<style>`·`<script>` 블록은 Task 3 Step 3의 minimal.html과 완전히 동일하므로 그대로 복사한다:

```html
<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head>
<meta charset="utf-8">
<title>신규 프로젝트 제안</title>
<style>
  :root {
    --wd-primary: #1a56db;
    --wd-accent: #e8f0fe;
    --wd-text: #1f2937;
    --wd-muted: #6b7280;
    --wd-font-heading: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
    --wd-font-body: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e5e7eb; font-family: var(--wd-font-body); color: var(--wd-text); }
  .deck { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 0; }
  .slide {
    position: relative; width: 1280px; height: 720px; flex: none;
    background: #fff; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }
  .el { position: absolute; }
  .el-text p { margin: 0; }
  @media print {
    body { background: none; }
    .deck { display: block; padding: 0; }
    .slide { box-shadow: none; page-break-after: always; }
  }
  @page { size: 1280px 720px; margin: 0; }
</style>
</head>
<body>
<main class="deck" data-slide-width="1280" data-slide-height="720">

  <!-- 1. 표지 (풀블리드) -->
  <section class="slide" data-bg="#ffffff">
    <div class="el el-shape" data-shape="rect" style="left:0px; top:0px; width:1280px; height:720px; background:var(--wd-primary);"></div>
    <div class="el el-text" style="left:96px; top:260px; width:1088px; height:140px;">
      <p><strong><span style="font-size:54px; color:#ffffff;">신규 프로젝트 제안</span></strong></p>
    </div>
    <div class="el el-text" style="left:96px; top:420px; width:1088px; height:60px;">
      <p><span style="font-size:24px; color:#dbeafe;">프로젝트명 · 제안 부서 · 2026. 07.</span></p>
    </div>
  </section>

  <!-- 2. 문제 정의 -->
  <section class="slide" data-bg="#ffffff">
    <div class="el el-text" style="left:96px; top:64px; width:900px; height:80px;">
      <p><strong><span style="font-size:36px;">문제 정의</span></strong></p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:150px; width:64px; height:6px; background:var(--wd-primary);"></div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:200px; width:8px; height:120px; background:var(--wd-primary);"></div>
    <div class="el el-text" style="left:128px; top:200px; width:1056px; height:120px;">
      <p style="font-size:24px; margin-bottom:12px;"><strong>수작업 반복</strong></p>
      <p style="font-size:20px; color:var(--wd-muted);">보고서 작성에 팀당 주 10시간 이상 소요</p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:350px; width:8px; height:120px; background:var(--wd-primary);"></div>
    <div class="el el-text" style="left:128px; top:350px; width:1056px; height:120px;">
      <p style="font-size:24px; margin-bottom:12px;"><strong>포맷 비일관</strong></p>
      <p style="font-size:20px; color:var(--wd-muted);">부서마다 다른 양식으로 취합 비용 증가</p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:500px; width:8px; height:120px; background:var(--wd-primary);"></div>
    <div class="el el-text" style="left:128px; top:500px; width:1056px; height:120px;">
      <p style="font-size:24px; margin-bottom:12px;"><strong>데이터 단절</strong></p>
      <p style="font-size:20px; color:var(--wd-muted);">원본 데이터와 보고서가 분리되어 최신성 유지 곤란</p>
    </div>
  </section>

  <!-- 3. 제안 개요 (2단) -->
  <section class="slide" data-bg="#ffffff">
    <div class="el el-text" style="left:96px; top:64px; width:900px; height:80px;">
      <p><strong><span style="font-size:36px;">제안 개요</span></strong></p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:150px; width:64px; height:6px; background:var(--wd-primary);"></div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:200px; width:420px; height:120px; background:var(--wd-accent);"></div>
    <div class="el el-text" style="left:120px; top:216px; width:372px; height:88px;">
      <p style="font-size:22px; margin-bottom:8px;"><strong>1단계 · 표준화</strong></p>
      <p style="font-size:18px; color:var(--wd-muted);">공통 문서 포맷 정의</p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:350px; width:420px; height:120px; background:var(--wd-accent);"></div>
    <div class="el el-text" style="left:120px; top:366px; width:372px; height:88px;">
      <p style="font-size:22px; margin-bottom:8px;"><strong>2단계 · 자동화</strong></p>
      <p style="font-size:18px; color:var(--wd-muted);">AI 초안 생성 파이프라인 구축</p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:500px; width:420px; height:120px; background:var(--wd-accent);"></div>
    <div class="el el-text" style="left:120px; top:516px; width:372px; height:88px;">
      <p style="font-size:22px; margin-bottom:8px;"><strong>3단계 · 확산</strong></p>
      <p style="font-size:18px; color:var(--wd-muted);">전사 교육 및 표준 정착</p>
    </div>
    <div class="el el-text" style="left:600px; top:200px; width:584px; height:440px;">
      <p style="font-size:22px; margin-bottom:16px;"><strong>기대 효과</strong></p>
      <p style="font-size:20px; margin-bottom:12px;">• 보고서 작성 시간 70% 단축</p>
      <p style="font-size:20px; margin-bottom:12px;">• 전사 문서 양식 일원화</p>
      <p style="font-size:20px; margin-bottom:12px;">• 데이터 기반 의사결정 가속</p>
      <p style="font-size:20px;">• 편집 가능한 산출물로 후속 협업 지원</p>
    </div>
  </section>

  <!-- 4. 추진 로드맵 -->
  <section class="slide" data-bg="#ffffff">
    <div class="el el-text" style="left:96px; top:64px; width:900px; height:80px;">
      <p><strong><span style="font-size:36px;">추진 로드맵</span></strong></p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:150px; width:64px; height:6px; background:var(--wd-primary);"></div>
    <div class="el el-shape" data-shape="rect" style="left:96px; top:260px; width:344px; height:140px; background:var(--wd-accent);"></div>
    <div class="el el-text" style="left:96px; top:310px; width:344px; height:60px;">
      <p style="font-size:24px; text-align:center;"><strong>1단계 (7~8월)</strong></p>
    </div>
    <div class="el el-text" style="left:96px; top:430px; width:344px; height:120px;">
      <p style="font-size:18px; text-align:center; color:var(--wd-muted);">포맷 정의 및 파일럿</p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:468px; top:260px; width:344px; height:140px; background:var(--wd-accent);"></div>
    <div class="el el-text" style="left:468px; top:310px; width:344px; height:60px;">
      <p style="font-size:24px; text-align:center;"><strong>2단계 (9~10월)</strong></p>
    </div>
    <div class="el el-text" style="left:468px; top:430px; width:344px; height:120px;">
      <p style="font-size:18px; text-align:center; color:var(--wd-muted);">부서 확산 및 교육</p>
    </div>
    <div class="el el-shape" data-shape="rect" style="left:840px; top:260px; width:344px; height:140px; background:var(--wd-accent);"></div>
    <div class="el el-text" style="left:840px; top:310px; width:344px; height:60px;">
      <p style="font-size:24px; text-align:center;"><strong>3단계 (11~12월)</strong></p>
    </div>
    <div class="el el-text" style="left:840px; top:430px; width:344px; height:120px;">
      <p style="font-size:18px; text-align:center; color:var(--wd-muted);">전사 표준 정착</p>
    </div>
  </section>

</main>
<script>
  (function () {
    document.querySelectorAll('.slide').forEach(function (slide) {
      if (slide.dataset.bg) slide.style.background = slide.dataset.bg;
    });
    var deck = document.querySelector('.deck');
    var slideWidth = Number(deck.dataset.slideWidth) || 1280;
    function fit() {
      deck.style.zoom = Math.min(1, (window.innerWidth - 48) / slideWidth);
    }
    window.addEventListener('resize', fit);
    window.addEventListener('beforeprint', function () { deck.style.zoom = 1; });
    window.addEventListener('afterprint', fit);
    fit();
  })();
</script>
</body>
</html>
```

- [ ] **Step 2: 테스트가 통과하는지 확인**

Run: `npm test`
Expected: PASS — 템플릿 3개 전부 오류·경고 0건

- [ ] **Step 3: 브라우저 육안 확인**

Run: `open templates/project-proposal.html`
Expected: 풀블리드 표지·문제 정의·제안 개요·로드맵 슬라이드 4장이 정상 표시

- [ ] **Step 4: 커밋**

```bash
git add templates/project-proposal.html
git commit -m "feat: 기획 제안서 템플릿 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: AI 생성 가이드

**Files:**
- Create: `docs/ai-guide.md`

**Interfaces:**
- Consumes: 포맷 v1 규칙(Task 1의 검증 규칙과 반드시 일치), 템플릿 3종(Task 3~5), CLI(Task 2)
- Produces: AI Agent에게 그대로 주입할 수 있는 생성 가이드 문서

- [ ] **Step 1: 가이드 작성**

`docs/ai-guide.md` (전체 내용):

````markdown
# WebDeck 문서 생성 가이드 (AI Agent용)

이 가이드는 AI Agent가 **WebDeck 표준 포맷 v1** HTML 슬라이드 문서를 생성하기 위한 규칙과 레시피다.
완성 예제는 `templates/` 디렉토리에 있다 — 새 문서는 `templates/minimal.html`을 복사해 시작하는 것을 권장한다.

## 필수 규칙 (검증 항목)

1. `<html>`에 `data-webdeck-version="1"` 속성 필수
2. `<head>`에 `<meta charset="utf-8">`와 비어 있지 않은 `<title>` 필수
3. 본문은 정확히 1개의 `<main class="deck" data-slide-width="1280" data-slide-height="720">`
4. deck의 자식은 `<section class="slide">`만 허용 (1개 이상)
5. 슬라이드의 자식은 전부 `.el` 요소 — `el-text` / `el-image` / `el-shape` 중 하나의 타입 클래스 필수
6. 모든 `.el`은 인라인 style에 `left / top / width / height`를 **px 단위**로 명시
7. 요소는 캔버스(1280×720) 안에 완전히 들어와야 함 (벗어나면 경고)
8. 이미지는 **data URI**만 사용 (외부 URL 금지 — 단일 파일 유통 원칙)
9. `<img>`에는 `alt` 속성 필수
10. 외부 `<script src>` / `<link rel="stylesheet">` 금지 (자기완결형 원칙)
11. `el-shape`는 `data-shape="rect"`만 지원 (v1)
12. `.el` 안에 다른 `.el`을 중첩하지 않는다 — 겹침은 절대 좌표 + DOM 순서(z-order)로 표현

## 문서 골격

`templates/minimal.html`의 `<style>`(뷰어 CSS)과 `<script>`(뷰어 스크립트) 블록을 그대로 복사하고,
`<main class="deck">` 안에 슬라이드를 채운다. 슬라이드 배경은 `data-bg="#ffffff"` 속성으로 지정한다.

## 좌표 체계

- 캔버스: 1280×720px, 원점은 좌상단
- 기본 여백: 좌우 96px (본문 폭 = 1088px)
- 관례: 슬라이드 제목 `top:64px height:80px`, 제목 밑줄(포인트 바) `left:96px top:150px width:64px height:6px`, 본문 시작 `top:200px`
- z-order = DOM 순서 (나중에 쓴 요소가 위에 그려짐) — 도형 위에 텍스트를 올리려면 도형을 먼저 쓴다

## 테마 변수

| 변수 | 용도 | 기본값 |
|------|------|--------|
| `--wd-primary` | 강조색 (제목 바, 포인트) | `#1a56db` |
| `--wd-accent` | 옅은 배경 (카드, 밴드) | `#e8f0fe` |
| `--wd-text` | 본문 글자색 | `#1f2937` |
| `--wd-muted` | 보조 글자색 | `#6b7280` |
| `--wd-font-heading` | 제목 글꼴 | Pretendard 계열 |
| `--wd-font-body` | 본문 글꼴 | Pretendard 계열 |

색은 가급적 변수로 지정한다 (`color:var(--wd-muted)`, `background:var(--wd-accent)`).

## 요소 레시피

**텍스트 상자** — 내용은 `<p>` 단위. 서식은 `<strong>`(굵게), `<em>`(기울임), `<u>`(밑줄), `<span style>`(크기·색):

```html
<div class="el el-text" style="left:96px; top:200px; width:520px; height:440px;">
  <p style="font-size:22px; margin-bottom:16px;">• 첫 번째 항목</p>
  <p style="font-size:22px;"><strong>강조</strong>와 <span style="color:var(--wd-muted);">보조색</span></p>
</div>
```

**이미지** — data URI, alt 필수, img에 `width:100%; height:100%`:

```html
<div class="el el-image" style="left:664px; top:200px; width:520px; height:440px;">
  <img src="data:image/png;base64,..." alt="설명" style="width:100%; height:100%;">
</div>
```

**도형(사각형)** — 배경색·밴드·카드·포인트 바에 사용:

```html
<div class="el el-shape" data-shape="rect" style="left:96px; top:220px; width:344px; height:300px; background:var(--wd-accent);"></div>
```

## 레이아웃 레시피 (검증된 좌표)

- **표지**: 제목 `96,240,1088,140`(54px bold) + 부제 `96,400,1088,60`(24px muted) + 하단 밴드 `0,600,1280,120`(accent)
- **풀블리드 표지**: 배경 rect `0,0,1280,720`(primary) + 흰색 제목 텍스트
- **목차**: 제목 + 밑줄 + 목록 텍스트 `96,200,1088,400`(26px, 줄 간격 margin-bottom:20px)
- **본문 2단**: 좌 `96,200,520,440` + 우 `664,200,520,440`
- **카드 3열**: rect `96/468/840, 220, 344, 300` + 텍스트 오버레이 `120/492/864, 252, 296, 236`
- **로드맵 3단계**: rect `96/468/840, 260, 344, 140` + 단계명 오버레이 + 설명 `430`부터

각 레시피의 실물은 `templates/business-report.html`, `templates/project-proposal.html` 참고.

## 생성 워크플로우

1. 문서 생성 (minimal.html 복사 → 내용 교체)
2. 검증: `node tools/validate-webdeck.mjs <문서.html>`
3. 오류·경고를 모두 해결할 때까지 2를 반복 (종료 코드 0 = 통과)

## 자주 하는 실수

- 요소 좌표 합이 캔버스를 벗어남 (`left + width > 1280`)
- `px` 생략 (`left:96` ❌ → `left:96px` ✅)
- 슬라이드 직속에 `.el`이 아닌 태그 배치 (`<h1>` ❌ — 텍스트는 항상 `el-text` 안에)
- 외부 이미지 URL 사용 (data URI로 변환할 것)
- 텍스트를 도형 안에 중첩 (`el-shape` 안에 `<p>` ❌ — 별도 `el-text`를 위에 겹칠 것)
````

- [ ] **Step 2: 가이드-검증기 일치 확인**

가이드의 "필수 규칙" 12개 항목을 `tools/lib/validate.mjs`의 검사 항목과 대조한다. 가이드에만 있고 검증기에 없는 규칙(12번 중첩 금지 등)은 "검증되지 않는 관례"임을 인지하고, 검증기에 있는데 가이드에 없는 규칙이 있으면 가이드에 추가한다.

Run: `npm test`
Expected: PASS (기존 테스트 영향 없음)

- [ ] **Step 3: 커밋**

```bash
git add docs/ai-guide.md
git commit -m "docs: AI Agent용 문서 생성 가이드 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: 전체 산출물 (CLI, 템플릿, 가이드)
- Produces: 프로젝트 소개 및 사용법 문서

- [ ] **Step 1: README 작성**

`README.md` (전체 내용):

```markdown
# WebDeck

AI가 생성하고 사람이 편집하는 HTML 슬라이드 문서 도구.

마크다운은 레이아웃 표현이 부족하고, AI가 만든 PPT는 편집이 안 된다.
WebDeck은 **HTML을 PPT처럼 쓰는** 접근이다 — AI Agent가 표준 포맷의 HTML 슬라이드를
생성하면, 브라우저만으로 보고 인쇄(PDF)할 수 있고, 앞으로 제공될 WYSIWYG 에디터로
비개발자도 PowerPoint처럼 편집할 수 있다.

## 현재 제공 (Plan 1)

- **표준 포맷 v1** — 1280×720 슬라이드, 절대 위치 요소, 자기완결형 단일 .html
- **템플릿** — `templates/` (minimal / 업무 보고서 / 기획 제안서). 브라우저로 바로 열어 확인
- **검증 CLI** — `node tools/validate-webdeck.mjs <문서.html>` (통과: 종료 코드 0)
- **AI 생성 가이드** — `docs/ai-guide.md`를 AI Agent에게 주입하면 포맷에 맞는 문서를 생성

## 사용법

```bash
npm install          # 최초 1회
npm test             # 전체 테스트
npm run validate -- templates/minimal.html   # 문서 검증
open templates/business-report.html          # 브라우저로 보기 (인쇄 → PDF 저장 가능)
```

## 로드맵

- Plan 2: 에디터 코어 (문서 모델, 파서/직렬화, undo)
- Plan 3: 에디터 UI (캔버스 편집, 슬라이드 패널, 파일 열기/저장)

설계 문서: `docs/superpowers/specs/2026-07-02-webdeck-design.md`
```

- [ ] **Step 2: 최종 전체 테스트**

Run: `npm test`
Expected: PASS — 전체 테스트 통과

- [ ] **Step 3: 커밋**

```bash
git add README.md
git commit -m "docs: README 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
