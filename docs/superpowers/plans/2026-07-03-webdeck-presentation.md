# WebDeck Plan 6 — 발표 모드·런타임 갱신 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저장된 WebDeck 문서를 브라우저에서 전체화면 발표(전환 효과·노트 포함)할 수 있게 하고, 에디터가 문서를 열 때 내장 런타임을 항상 최신으로 정규화한다.

**Architecture:** 런타임 전체를 `<script data-webdeck-runtime="2">` 단일 마킹 스크립트로 통합(발표 CSS·버튼도 스크립트가 브라우저에서 주입 — DOMParser는 실행하지 않으므로 에디터·저장물 무오염). 에디터는 열기 시 `normalizeRuntime`으로 bodyScript를 정규화하고, `Slide`에 `transition`/`notes` 1급 필드를 추가(v1.1, 버전 속성은 "1" 유지)한다.

**Tech Stack:** React 19 + TypeScript strict + Vite 8, Vitest + happy-dom + RTL (에디터), node:test + node-html-parser (tools)

**스펙:** `docs/superpowers/specs/2026-07-03-webdeck-presentation-design.md`

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess`, 상대 import에 `.ts`/`.tsx` 확장자 필수. 신규 의존성 금지
- 런타임 마커: `data-webdeck-runtime="2"` — 템플릿 3종의 스크립트 블록은 `runtime.ts`의 `RUNTIME_SCRIPT`와 **바이트 단위 동일** (동기화 테스트가 강제)
- 런타임 스크립트는 ES5 스타일(백틱·`${` 금지 — TS 템플릿 리터럴에 안전하게 내장하기 위함), `</script>` 문자열 미포함
- 정규화 규칙(스펙 §2.3): 마킹 스크립트 교체 → v1 시그니처(`dataset.slideWidth` **와** `beforeprint` 모두 포함) 교체 → 그 외 보존 → 스크립트 0개면 추가, 미인식만 있으면 추가 안 함 → 교체 대상 여럿이면 첫 자리에 1개로 정리. 변경 없으면 **같은 객체 반환**(멱등)
- `data-webdeck-version="1"` 유지. 신규 속성: `data-transition="fade"|"push"`, `data-notes="평문"` — 전부 선택적
- 미지원 transition 값: 파서는 extraAttrs에 원문 보존(1급 승격 안 함), 검증기는 오류
- 1 조작 = 1 APPLY_DOC undo 규율: 전환 select는 같은 값 재선택 no-dispatch, 노트는 드래프트(blur 커밋·Escape 취소·같은 값 no-dispatch)
- 사용자 노출 문구 한국어. 발표 버튼 텍스트 `발표`, 패널 라벨 `전환 효과`/`노트`, select 옵션 `없음`/`페이드`/`밀기`
- 테스트: 에디터 `cd editor && npx vitest run <파일>`, tools `npm test`(루트), 전체 `npm run test:all`

---

### Task 1: 모델 확장 — Slide.transition / Slide.notes

**Files:**
- Modify: `editor/src/model/types.ts:47-55` (Slide 인터페이스)
- Modify: `editor/src/model/parse.ts:79-88` (parseSlide)
- Modify: `editor/src/model/serialize.ts:38-45` (serializeSlide)
- Modify: `editor/src/model/ops.ts` (addSlide·duplicateSlide 리터럴 + 신규 ops 2개)
- Test: `editor/src/model/parse.test.ts`, `editor/src/model/ops.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: 기존 `mapSlide`, `escapeAttr` (파일 내부)
- Produces (Task 4가 사용):
  - `Slide.transition: 'fade' | 'push' | null`, `Slide.notes: string`
  - `setSlideTransition(doc: DeckDoc, slideId: string, transition: 'fade' | 'push' | null): DeckDoc`
  - `setSlideNotes(doc: DeckDoc, slideId: string, notes: string): DeckDoc`

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/parse.test.ts` 끝에 추가 (파일의 기존 import 그대로 사용, 필요 시 `checkRoundTrip`/`serializeWebdeck` import 추가):

```ts
const P6_WRAP = (section: string) => `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
${section}
</main></body></html>`

describe('v1.1 슬라이드 속성 (transition·notes)', () => {
  test('data-transition/data-notes를 1급 필드로 추출하고 extraAttrs에 남기지 않는다', () => {
    const doc = parseWebdeck(P6_WRAP('<section class="slide" data-transition="fade" data-notes="발표 멘트"></section>'))
    const s = doc.slides[0]!
    expect(s.transition).toBe('fade')
    expect(s.notes).toBe('발표 멘트')
    expect(s.extraAttrs['data-transition']).toBeUndefined()
    expect(s.extraAttrs['data-notes']).toBeUndefined()
  })

  test('속성이 없으면 transition은 null, notes는 빈 문자열', () => {
    const doc = parseWebdeck(P6_WRAP('<section class="slide"></section>'))
    expect(doc.slides[0]!.transition).toBeNull()
    expect(doc.slides[0]!.notes).toBe('')
  })

  test('미지원 transition 값은 extraAttrs에 원문 보존된다', () => {
    const doc = parseWebdeck(P6_WRAP('<section class="slide" data-transition="zoom"></section>'))
    const s = doc.slides[0]!
    expect(s.transition).toBeNull()
    expect(s.extraAttrs['data-transition']).toBe('zoom')
  })

  test('transition·notes는 왕복 보존된다 (직렬화 출력 포함)', () => {
    const doc = parseWebdeck(P6_WRAP('<section class="slide" data-transition="push" data-notes="한 줄 &quot;멘트&quot;"></section>'))
    expect(checkRoundTrip(doc)).toBeNull()
    const html = serializeWebdeck(doc)
    expect(html).toContain('data-transition="push"')
    expect(html).toContain('data-notes="한 줄 &quot;멘트&quot;"')
  })

  test('notes가 빈 문자열이면 data-notes를 출력하지 않는다', () => {
    const doc = parseWebdeck(P6_WRAP('<section class="slide"></section>'))
    expect(serializeWebdeck(doc)).not.toContain('data-notes')
    expect(serializeWebdeck(doc)).not.toContain('data-transition')
  })

  test('미지원 transition 값도 왕복 보존된다', () => {
    const doc = parseWebdeck(P6_WRAP('<section class="slide" data-transition="zoom"></section>'))
    expect(checkRoundTrip(doc)).toBeNull()
    expect(serializeWebdeck(doc)).toContain('data-transition="zoom"')
  })
})
```

`editor/src/model/ops.test.ts` 끝에 추가 (기존 import에 `setSlideNotes, setSlideTransition` 추가):

```ts
describe('setSlideTransition / setSlideNotes', () => {
  test('해당 슬라이드만 갱신하고 새 문서를 반환한다', () => {
    const doc = parseWebdeck(TWO_SLIDE_DOC) // 파일에 2슬라이드 픽스처가 없으면 P6 전용으로 아래 헬퍼 사용
    const id = doc.slides[0]!.id
    const d1 = setSlideTransition(doc, id, 'fade')
    expect(d1).not.toBe(doc)
    expect(d1.slides[0]!.transition).toBe('fade')
    expect(d1.slides[1]!.transition).toBeNull()
    const d2 = setSlideNotes(d1, id, '멘트')
    expect(d2.slides[0]!.notes).toBe('멘트')
  })

  test('duplicateSlide는 transition·notes를 복제한다', () => {
    const doc = setSlideNotes(setSlideTransition(parseWebdeck(TWO_SLIDE_DOC), parseWebdeck(TWO_SLIDE_DOC).slides[0]!.id, 'push'), parseWebdeck(TWO_SLIDE_DOC).slides[0]!.id, 'n')
    // 위 한 줄이 어색하면: const base = parseWebdeck(TWO_SLIDE_DOC); const id = base.slides[0]!.id;
    // const doc = setSlideNotes(setSlideTransition(base, id, 'push'), id, 'n') 로 풀어 쓴다 (동일 동작)
    const id = doc.slides[0]!.id
    const dup = duplicateSlide(doc, id, createIdGen('d'))
    expect(dup.slides[1]!.transition).toBe('push')
    expect(dup.slides[1]!.notes).toBe('n')
  })

  test('addSlide 새 슬라이드는 transition null·notes 빈 문자열', () => {
    const doc = addSlide(parseWebdeck(TWO_SLIDE_DOC), createIdGen('a'))
    expect(doc.slides.at(-1)!.transition).toBeNull()
    expect(doc.slides.at(-1)!.notes).toBe('')
  })
})
```

주의: `TWO_SLIDE_DOC`은 ops.test.ts에 이미 있는 2슬라이드 픽스처를 재사용한다. 없으면 P6_WRAP 스타일로 섹션 2개짜리 문자열 상수를 테스트 블록 위에 정의한다(이름은 자유, 위 코드의 참조만 일치시킬 것). 두 번째 테스트의 풀어 쓰기 주석 버전을 사용해도 된다.

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/parse.test.ts src/model/ops.test.ts`
Expected: FAIL — `transition`/`setSlideTransition` 미존재

- [ ] **Step 3: 구현**

`editor/src/model/types.ts` — Slide에 필드 2개 추가 (bg 다음):

```ts
export interface Slide {
  id: string
  bg: string | null
  /** 발표 전환 효과 — data-transition. fade/push만 1급, 그 외 값은 extraAttrs에 보존 */
  transition: 'fade' | 'push' | null
  /** 슬라이드 노트 — data-notes 평문 (없으면 '') */
  notes: string
  /** class/data-bg 외의 section 속성 — 왕복 보존 */
  extraAttrs: Record<string, string>
  /** slide 외의 class 토큰 — 왕복 보존 */
  extraClasses: string[]
  elements: SlideElement[]
}
```

`editor/src/model/parse.ts`의 `parseSlide` 교체:

```ts
function parseSlide(section: Element, idGen: () => string): Slide {
  const id = idGen()
  const rawTransition = section.getAttribute('data-transition')
  const transition = rawTransition === 'fade' || rawTransition === 'push' ? rawTransition : null
  const notes = section.getAttribute('data-notes') ?? ''
  const extraAttrs: Record<string, string> = {}
  for (const attr of Array.from(section.attributes)) {
    if (attr.name === 'class' || attr.name === 'data-bg' || attr.name === 'data-notes') continue
    // 유효한 transition만 1급 필드로 승격 — 미지원 값은 extraAttrs에 원문 보존
    if (attr.name === 'data-transition' && transition !== null) continue
    extraAttrs[attr.name] = attr.value
  }
  const elements = Array.from(section.children).map((el) => parseElement(el, idGen))
  return { id, bg: section.getAttribute('data-bg'), transition, notes, extraAttrs, extraClasses: extraClassesOf(section, ['slide']), elements }
}
```

`editor/src/model/serialize.ts`의 `serializeSlide` 교체:

```ts
function serializeSlide(slide: Slide): string {
  const cls = escapeAttr(['slide', ...slide.extraClasses].join(' '))
  const bg = slide.bg === null ? '' : ` data-bg="${escapeAttr(slide.bg)}"`
  const transition = slide.transition === null ? '' : ` data-transition="${escapeAttr(slide.transition)}"`
  const notes = slide.notes === '' ? '' : ` data-notes="${escapeAttr(slide.notes)}"`
  const extra = attrsString(slide.extraAttrs)
  const els = slide.elements.map((el) => `    ${serializeElement(el)}`).join('\n')
  const body = els ? `\n${els}\n  ` : '\n  '
  return `  <section class="${cls}"${bg}${transition}${notes}${extra}>${body}</section>`
}
```

`editor/src/model/ops.ts`:

- `addSlide`의 리터럴: `const slide: Slide = { id: idGen(), bg: '#ffffff', transition: null, notes: '', extraAttrs: {}, extraClasses: [], elements: [] }`
- `duplicateSlide`의 copy 리터럴에 `transition: src.transition,`과 `notes: src.notes,` 추가 (bg 다음)
- `setSlideBg` 아래에 추가:

```ts
export function setSlideTransition(doc: DeckDoc, slideId: string, transition: Slide['transition']): DeckDoc {
  return mapSlide(doc, slideId, (slide) => ({ ...slide, transition }))
}

export function setSlideNotes(doc: DeckDoc, slideId: string, notes: string): DeckDoc {
  return mapSlide(doc, slideId, (slide) => ({ ...slide, notes }))
}
```

- [ ] **Step 4: 통과 확인 + 전체 에디터 테스트·타입 검사**

Run: `cd editor && npx vitest run src/model/parse.test.ts src/model/ops.test.ts && npm test && npm run typecheck`
Expected: 전부 PASS. typecheck에서 Slide 리터럴을 만드는 다른 코드/테스트가 오류 나면 해당 리터럴에 `transition: null, notes: ''`를 추가한다 (필드 추가 외 로직 변경 금지)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/model/
git commit -m "feat(model): Slide에 transition·notes 1급 필드 (v1.1, 미지원 값 extraAttrs 보존)"
```

---

### Task 2: 런타임 v2 — RUNTIME_SCRIPT·normalizeRuntime·템플릿 3종·동기화 테스트

**Files:**
- Create: `editor/src/model/runtime.ts`
- Test: `editor/src/model/runtime.test.ts`
- Modify: `templates/minimal.html:58-73`, `templates/business-report.html:107-122`, `templates/project-proposal.html:131-146` (기존 `<script>...</script>` 블록 교체)
- Modify: `editor/src/file/templates.test.ts` (동기화 테스트 추가)

**Interfaces:**
- Consumes: `DeckDoc` 타입
- Produces (Task 4가 사용): `RUNTIME_VERSION: number`(=2), `RUNTIME_SCRIPT: string`(`<script …>` 태그 전체), `normalizeRuntime(doc: DeckDoc): DeckDoc`

**런타임 스크립트 원문** — 아래 블록이 유일한 원본이다. runtime.ts의 템플릿 리터럴 내용과 템플릿 3종의 교체 블록에 **동일하게** 들어간다 (동기화 테스트 `t.html.includes(RUNTIME_SCRIPT)`가 바이트 일치를 강제하므로 들여쓰기·개행까지 그대로 옮길 것):

```html
<script data-webdeck-runtime="2">
(function () {
  'use strict';
  document.querySelectorAll('.slide').forEach(function (slide) {
    if (slide.dataset.bg) slide.style.background = slide.dataset.bg;
  });
  var deck = document.querySelector('.deck');
  if (!deck) return;
  var slideWidth = Number(deck.dataset.slideWidth) || 1280;
  var slideHeight = Number(deck.dataset.slideHeight) || 720;
  function fit() {
    deck.style.zoom = Math.min(1, (window.innerWidth - 48) / slideWidth);
  }
  window.addEventListener('resize', fit);
  window.addEventListener('beforeprint', function () { deck.style.zoom = 1; });
  window.addEventListener('afterprint', fit);
  fit();

  var slides = Array.prototype.slice.call(deck.querySelectorAll('.slide'));
  if (slides.length === 0) return;

  var style = document.createElement('style');
  style.textContent =
    '.wd-present-btn { position: fixed; top: 16px; right: 16px; z-index: 9000;' +
    ' font: 14px sans-serif; padding: 8px 16px; border: none; border-radius: 6px;' +
    ' background: rgba(17, 24, 39, 0.8); color: #fff; cursor: pointer; opacity: 0.35; }\n' +
    '.wd-present-btn:hover { opacity: 1; }\n' +
    '.wd-stage { position: fixed; inset: 0; z-index: 9500; background: #000; overflow: hidden; }\n' +
    '.wd-stage .slide { position: absolute; left: 50%; top: 50%; margin: 0; box-shadow: none;' +
    ' transform: translate(-50%, -50%) scale(var(--wd-scale, 1)); }\n' +
    '.wd-enter-fade { animation: wd-fade 0.35s ease both; }\n' +
    '@keyframes wd-fade { from { opacity: 0; } to { opacity: 1; } }\n' +
    '.wd-enter-push-next { animation: wd-push-next 0.3s ease both; }\n' +
    '@keyframes wd-push-next { from { transform: translate(calc(-50% + 100vw), -50%) scale(var(--wd-scale, 1)); }' +
    ' to { transform: translate(-50%, -50%) scale(var(--wd-scale, 1)); } }\n' +
    '.wd-enter-push-prev { animation: wd-push-prev 0.3s ease both; }\n' +
    '@keyframes wd-push-prev { from { transform: translate(calc(-50% - 100vw), -50%) scale(var(--wd-scale, 1)); }' +
    ' to { transform: translate(-50%, -50%) scale(var(--wd-scale, 1)); } }\n' +
    '@media print { .wd-present-btn { display: none; } }';
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'wd-present-btn';
  btn.textContent = '발표';
  document.body.appendChild(btn);

  var stage = null;
  var current = 0;

  function render(direction) {
    var src = slides[current];
    var clone = src.cloneNode(true);
    var scale = Math.min(window.innerWidth / slideWidth, window.innerHeight / slideHeight);
    clone.style.width = slideWidth + 'px';
    clone.style.height = slideHeight + 'px';
    clone.style.setProperty('--wd-scale', String(scale));
    var t = src.getAttribute('data-transition');
    if (direction > 0 && t === 'push') clone.classList.add('wd-enter-push-next');
    if (direction < 0 && t === 'push') clone.classList.add('wd-enter-push-prev');
    if (direction !== 0 && t === 'fade') clone.classList.add('wd-enter-fade');
    stage.textContent = '';
    stage.appendChild(clone);
  }

  function enter() {
    if (stage) return;
    stage = document.createElement('div');
    stage.className = 'wd-stage';
    stage.addEventListener('click', function () { move(1); });
    document.body.appendChild(stage);
    btn.style.display = 'none';
    current = 0;
    render(0);
    if (document.documentElement.requestFullscreen) {
      var p = document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function exit() {
    if (!stage) return;
    stage.remove();
    stage = null;
    btn.style.display = '';
    if (document.fullscreenElement && document.exitFullscreen) {
      var p = document.exitFullscreen();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function move(delta) {
    var next = Math.max(0, Math.min(slides.length - 1, current + delta));
    if (next === current) return;
    var direction = next > current ? 1 : -1;
    current = next;
    render(direction);
  }

  btn.addEventListener('click', enter);
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && stage) exit();
  });
  window.addEventListener('resize', function () {
    if (stage) render(0);
  });
  document.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!stage) {
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); enter(); }
      return;
    }
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); move(-slides.length); }
    else if (e.key === 'End') { e.preventDefault(); move(slides.length); }
    else if (e.key === 'Escape') { e.preventDefault(); exit(); }
  });
})();
</script>
```

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/model/runtime.test.ts` (신규):

```ts
import { describe, expect, test } from 'vitest'
import { parseWebdeck } from './parse.ts'
import { RUNTIME_SCRIPT, RUNTIME_VERSION, normalizeRuntime } from './runtime.ts'
import type { DeckDoc } from './types.ts'

const BASE = `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
</main></body></html>`

/** 현행(구) v1 런타임 — 마킹 없음, 시그니처(dataset.slideWidth + beforeprint) 포함 */
const OLD_V1 = `<script>
  (function () {
    var deck = document.querySelector('.deck');
    var slideWidth = Number(deck.dataset.slideWidth) || 1280;
    function fit() { deck.style.zoom = 1; }
    window.addEventListener('beforeprint', function () { deck.style.zoom = 1; });
    fit();
  })();
</script>`

const CUSTOM = '<script>console.log("사용자 커스텀");</script>'
const OLD_MARKED = '<script data-webdeck-runtime="1">(function(){})();</script>'

function docWith(bodyScript: string): DeckDoc {
  return { ...parseWebdeck(BASE), bodyScript }
}

describe('normalizeRuntime', () => {
  test('RUNTIME_SCRIPT는 현재 버전 마커를 갖는다', () => {
    expect(RUNTIME_SCRIPT).toContain(`data-webdeck-runtime="${RUNTIME_VERSION}"`)
    expect(RUNTIME_VERSION).toBe(2)
  })

  test('마킹된 구버전 런타임을 최신본으로 교체한다', () => {
    const out = normalizeRuntime(docWith(OLD_MARKED))
    expect(out.bodyScript).toBe(RUNTIME_SCRIPT)
  })

  test('마킹 없는 v1 시그니처 런타임을 교체한다', () => {
    const out = normalizeRuntime(docWith(OLD_V1))
    expect(out.bodyScript).toBe(RUNTIME_SCRIPT)
  })

  test('커스텀 스크립트는 순서 그대로 보존한다', () => {
    const out = normalizeRuntime(docWith(`${CUSTOM}\n${OLD_V1}`))
    expect(out.bodyScript.startsWith(CUSTOM)).toBe(true)
    expect(out.bodyScript).toContain(`data-webdeck-runtime="${RUNTIME_VERSION}"`)
  })

  test('스크립트가 하나도 없으면 런타임을 추가한다', () => {
    const out = normalizeRuntime(docWith(''))
    expect(out.bodyScript).toBe(RUNTIME_SCRIPT)
  })

  test('미인식 스크립트만 있으면 아무것도 추가·변경하지 않는다 (같은 객체)', () => {
    const doc = docWith(CUSTOM)
    expect(normalizeRuntime(doc)).toBe(doc)
  })

  test('교체 대상이 여럿이면 첫 자리에 1개로 정리한다', () => {
    const out = normalizeRuntime(docWith(`${OLD_MARKED}\n${CUSTOM}\n${OLD_V1}`))
    const occurrences = out.bodyScript.split(`data-webdeck-runtime="${RUNTIME_VERSION}"`).length - 1
    expect(occurrences).toBe(1)
    expect(out.bodyScript.indexOf(RUNTIME_SCRIPT)).toBeLessThan(out.bodyScript.indexOf(CUSTOM))
  })

  test('멱등: 정규화 결과를 다시 정규화하면 같은 객체를 반환한다', () => {
    const once = normalizeRuntime(docWith(OLD_V1))
    expect(normalizeRuntime(once)).toBe(once)
  })
})
```

`editor/src/file/templates.test.ts`에 추가 (import에 `RUNTIME_SCRIPT` 추가: `import { RUNTIME_SCRIPT } from '../model/runtime.ts'`):

```ts
test('모든 템플릿은 최신 런타임을 바이트 단위로 내장한다', () => {
  for (const t of TEMPLATES) {
    expect(t.html.includes(RUNTIME_SCRIPT), t.key).toBe(true)
  }
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/runtime.test.ts src/file/templates.test.ts`
Expected: FAIL — `Cannot find module './runtime.ts'`

- [ ] **Step 3: runtime.ts 구현**

`editor/src/model/runtime.ts` (신규). `RUNTIME_SCRIPT`는 백틱 템플릿 리터럴이고 내용은 위 **런타임 스크립트 원문** 블록 그대로 (첫 줄 `<script data-webdeck-runtime="2">`부터 마지막 줄 `</script>`까지, 앞뒤 개행 없이):

```ts
import type { DeckDoc } from './types.ts'

export const RUNTIME_VERSION = 2

/** 문서에 내장되는 뷰어 런타임 전체 — 템플릿 3종과 바이트 단위 동일해야 한다 (templates.test.ts가 강제) */
export const RUNTIME_SCRIPT = `<script data-webdeck-runtime="2">
…(런타임 스크립트 원문 블록의 2번째 줄부터 마지막 줄 </script>까지 그대로)…
</script>`

const V1_SIGNATURES = ['dataset.slideWidth', 'beforeprint']

/** WebDeck 런타임 스크립트 판정 — 마커 우선, 없으면 v1 시그니처 휴리스틱 */
function isRuntimeScript(el: Element): boolean {
  if (el.hasAttribute('data-webdeck-runtime')) return true
  const text = el.textContent ?? ''
  return V1_SIGNATURES.every((sig) => text.includes(sig))
}

/**
 * bodyScript의 런타임을 최신본으로 정규화한다 (문서 열기 시 1회 — 스펙 §2.3).
 * 인식된 런타임은 첫 자리에 1개로 교체, 그 외 스크립트는 원문 보존.
 * 스크립트가 하나도 없으면 런타임을 추가. 변경 없으면 같은 객체 반환(멱등).
 */
export function normalizeRuntime(doc: DeckDoc): DeckDoc {
  const dom = new DOMParser().parseFromString(`<body>${doc.bodyScript}</body>`, 'text/html')
  const scripts = Array.from(dom.body.querySelectorAll('script'))
  const parts: string[] = []
  let replaced = false
  for (const s of scripts) {
    if (isRuntimeScript(s)) {
      if (!replaced) {
        parts.push(RUNTIME_SCRIPT)
        replaced = true
      }
    } else {
      parts.push(s.outerHTML)
    }
  }
  if (!replaced && scripts.length === 0) parts.push(RUNTIME_SCRIPT)
  const bodyScript = parts.join('\n')
  return bodyScript === doc.bodyScript ? doc : { ...doc, bodyScript }
}
```

(위의 `…그대로…` 표시 부분에 원문 블록을 실제로 붙여 넣는다 — 이 플랜 문서 안에서만 생략 표기이며 소스에는 전문이 들어간다. 원문에는 백틱·`${`가 없으므로 이스케이프 불필요)

- [ ] **Step 4: 템플릿 3종 교체**

`templates/minimal.html`(58-73행), `templates/business-report.html`(107-122행), `templates/project-proposal.html`(131-146행)의 기존 `<script>…</script>` 블록을 **런타임 스크립트 원문** 블록으로 교체한다. 행 번호는 현재 기준이므로 실제로는 각 파일에서 `<script>`로 시작해 `</script>`로 끝나는 유일한 블록을 찾아 교체할 것.

- [ ] **Step 5: 통과 확인**

Run: `cd editor && npx vitest run src/model/runtime.test.ts src/file/templates.test.ts && npm test && npm run typecheck`
Expected: 전부 PASS (templates.test.ts의 기존 왕복·파싱 테스트 포함)

- [ ] **Step 6: tools 테스트 확인**

Run: 리포 루트에서 `npm test`
Expected: PASS — 템플릿 검증 테스트(tools/templates.test.mjs)가 새 런타임 포함 템플릿을 여전히 통과시킨다 (인라인 스크립트는 원래 허용)

- [ ] **Step 7: 커밋**

```bash
git add editor/src/model/runtime.ts editor/src/model/runtime.test.ts editor/src/file/templates.test.ts templates/
git commit -m "feat(runtime): 런타임 v2 — 발표 모드 내장·normalizeRuntime·템플릿 동기화"
```

---

### Task 3: 검증기 확장 + AI 가이드 갱신

**Files:**
- Modify: `tools/lib/validate.mjs` (validateSlide에 data-transition 값 검증)
- Test: `tools/lib/validate.test.mjs` (기존 파일에 추가)
- Modify: `docs/ai-guide.md`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (독립 검증 규칙)

- [ ] **Step 1: 실패하는 테스트 작성**

`tools/lib/validate.test.mjs`에 추가 (파일의 기존 import·헬퍼 관례를 따른다 — node:test의 `test`와 `assert`, 문서 래퍼 헬퍼가 있으면 재사용):

```js
test('data-transition은 fade/push만 허용한다', () => {
  const bad = validateWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide" data-transition="zoom"></section>
</main></body></html>`)
  assert.ok(bad.errors.some((e) => e.includes('data-transition')))

  const good = validateWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide" data-transition="fade" data-notes="멘트"></section>
<section class="slide" data-transition="push"></section>
</main></body></html>`)
  assert.deepStrictEqual(good.errors, [])
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test` (리포 루트)
Expected: 새 테스트 FAIL (zoom이 오류로 잡히지 않음)

- [ ] **Step 3: 검증기 구현**

`tools/lib/validate.mjs`의 `validateSlide` 함수 첫머리(`const children = ...` 앞)에 추가:

```js
  const transition = slide.getAttribute('data-transition')
  if (transition != null && !['fade', 'push'].includes(transition)) {
    errors.push(`${label}: data-transition은 fade/push만 지원합니다 (현재 "${transition}")`)
  }
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 5: AI 가이드 갱신**

`docs/ai-guide.md` 수정 2곳:

(1) "필수 규칙 (검증 항목)" 목록 끝(13번 다음)에 추가:

```markdown
14. `data-transition`(슬라이드 전환)은 `fade`/`push`만 지원 — 선택 속성 (오류)
```

(2) "문서 골격" 섹션의 기존 문단 뒤에 추가:

```markdown
슬라이드에는 선택 속성 2개를 쓸 수 있다: `data-transition="fade|push"`(발표 전환 효과),
`data-notes="평문"`(발표 노트). 문서를 브라우저로 열면 우상단 "발표" 버튼(또는 `P` 키)으로
전체화면 발표 모드가 시작된다(`→`/`←` 이동, `Esc` 종료). 뷰어 스크립트 블록은
`data-webdeck-runtime` 마커가 붙은 최신본을 템플릿에서 그대로 복사한다 —
에디터가 문서를 열어 저장하면 이 블록은 항상 최신 런타임으로 자동 갱신된다.
```

- [ ] **Step 6: 커밋**

```bash
git add tools/lib/validate.mjs tools/lib/validate.test.mjs docs/ai-guide.md
git commit -m "feat(tools): data-transition 검증·AI 가이드 v1.1 갱신"
```

---

### Task 4: 에디터 통합 — 열기 시 정규화 + 속성 패널 전환·노트 UI

**Files:**
- Modify: `editor/src/App.tsx` (handleStart·handleOpen에서 normalizeRuntime 적용)
- Modify: `editor/src/panels/PropertiesPanel.tsx` (슬라이드 모드에 전환 select + 노트 textarea)
- Modify: `editor/src/app.css` (`.prop-col` 규칙)
- Test: `editor/src/App.test.tsx`, `editor/src/panels/PropertiesPanel.test.tsx` (기존 파일에 추가)

**Interfaces:**
- Consumes: Task 1 `setSlideTransition`/`setSlideNotes`, Task 2 `normalizeRuntime`/`RUNTIME_VERSION`
- Produces: 없음 (최종 통합)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/App.test.tsx`에 추가:

```tsx
test('구버전 런타임 문서는 저장 시 최신 런타임으로 기록된다', async () => {
  const OLD_RUNTIME_DOC = VALID_DOC.replace(
    '</body>',
    `<script>
  (function () {
    var deck = document.querySelector('.deck');
    var slideWidth = Number(deck.dataset.slideWidth) || 1280;
    window.addEventListener('beforeprint', function () { deck.style.zoom = 1; });
  })();
</script>
</body>`,
  )
  const written = stubPickerWithWritable('old.html', OLD_RUNTIME_DOC)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await vi.waitFor(() => expect(written).toHaveLength(1))
  expect(written[0]).toContain('data-webdeck-runtime="2"')
  // 구 런타임 본문이 교체되어 1개만 남는다
  expect(written[0]!.split('data-webdeck-runtime').length - 1).toBe(1)
})
```

`editor/src/panels/PropertiesPanel.test.tsx`에 추가:

```tsx
test('전환 효과 선택은 1회 APPLY_DOC 한다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  fireEvent.change(getByLabelText('전환 효과'), { target: { value: 'fade' } })
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.transition).toBe('fade')
})

test('같은 전환 값(없음) 재선택은 디스패치하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  fireEvent.change(getByLabelText('전환 효과'), { target: { value: 'none' } })
  expect(dispatch).not.toHaveBeenCalled()
})

test('노트는 입력 중 디스패치 없이 blur에서 1회 커밋된다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  const ta = getByLabelText('노트')
  fireEvent.change(ta, { target: { value: '첫 줄' } })
  fireEvent.change(ta, { target: { value: '첫 줄 둘째' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.blur(ta)
  const applies = dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')
  expect(applies).toHaveLength(1)
  expect((applies[0]![0].doc as DeckDoc).slides[0]!.notes).toBe('첫 줄 둘째')
})

test('노트 Escape는 드래프트를 버리고 커밋하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  const ta = getByLabelText('노트')
  fireEvent.change(ta, { target: { value: '버릴 내용' } })
  fireEvent.keyDown(ta, { key: 'Escape' })
  fireEvent.blur(ta)
  expect(dispatch).not.toHaveBeenCalled()
})

test('노트를 같은 내용으로 blur하면 디스패치하지 않는다', () => {
  const { dispatch, getByLabelText } = renderPanel()
  const ta = getByLabelText('노트')
  fireEvent.change(ta, { target: { value: '' } })
  fireEvent.blur(ta)
  expect(dispatch).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/App.test.tsx src/panels/PropertiesPanel.test.tsx`
Expected: 신규 테스트 FAIL (`전환 효과` 라벨 없음, 런타임 마커 없음), 기존은 PASS

- [ ] **Step 3: App.tsx 수정**

import 추가: `import { normalizeRuntime } from './model/runtime.ts'`

`handleStart`의 `const doc = parseWebdeck(template.html)` →

```tsx
      const doc = normalizeRuntime(parseWebdeck(template.html))
```

`handleOpen`의 `const doc = parseWebdeck(opened.text)` →

```tsx
      const doc = normalizeRuntime(parseWebdeck(opened.text))
```

- [ ] **Step 4: PropertiesPanel.tsx 수정**

import 수정: `useState` 옆에 `useRef` 추가, ops import에 `setSlideNotes, setSlideTransition` 추가.

컴포넌트 상단 상태 추가 (opacityDraft 아래):

```tsx
  /** 노트 드래프트 — 슬라이드 id를 함께 저장해 슬라이드 전환 시 다른 슬라이드에 커밋되는 것을 방지 */
  const [notesDraft, setNotesDraft] = useState<{ slideId: string; text: string } | null>(null)
  /** Escape 취소 플래그 — blur 핸들러가 취소를 커밋으로 오인하지 않게 ref로 전달 */
  const notesEscRef = useRef(false)
```

슬라이드 모드 return의 배경색 `<label>` 다음에 추가:

```tsx
        <label className="prop-row">
          전환 효과
          <select
            aria-label="전환 효과"
            value={slide.transition ?? 'none'}
            onChange={(e) => {
              const v = e.target.value === 'none' ? null : (e.target.value as 'fade' | 'push')
              if (v !== slide.transition) {
                dispatch({ type: 'APPLY_DOC', doc: setSlideTransition(doc, slide.id, v) })
              }
            }}
          >
            <option value="none">없음</option>
            <option value="fade">페이드</option>
            <option value="push">밀기</option>
          </select>
        </label>
        <label className="prop-col">
          노트
          <textarea
            aria-label="노트"
            rows={6}
            value={notesDraft?.slideId === slide.id ? notesDraft.text : slide.notes}
            onChange={(e) => setNotesDraft({ slideId: slide.id, text: e.target.value })}
            onBlur={() => {
              const cancelled = notesEscRef.current
              notesEscRef.current = false
              if (!cancelled && notesDraft?.slideId === slide.id && notesDraft.text !== slide.notes) {
                dispatch({ type: 'APPLY_DOC', doc: setSlideNotes(doc, slide.id, notesDraft.text) })
              }
              setNotesDraft(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                notesEscRef.current = true
                e.currentTarget.blur()
              }
            }}
          />
        </label>
```

`editor/src/app.css` 끝에 추가:

```css
/* 속성 패널 세로 배치 행 (노트 등) */
.prop-col { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #374151; }
.prop-col textarea { font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; resize: vertical; }
```

- [ ] **Step 5: 통과 확인 + 전체 검증**

Run: `cd editor && npx vitest run src/App.test.tsx src/panels/PropertiesPanel.test.tsx && npm test && npm run typecheck`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add editor/src/App.tsx editor/src/panels/PropertiesPanel.tsx editor/src/app.css editor/src/App.test.tsx editor/src/panels/PropertiesPanel.test.tsx
git commit -m "feat(editor): 열기 시 런타임 정규화·슬라이드 전환/노트 편집 UI"
```

---

### Task 5: 문서 갱신과 최종 검증

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-webdeck-design.md` (§12 이력 추가)
- Modify: `README.md` ("현재 제공" 목록)
- Modify: `docs/roadmap.md` (Plan 6 완료 표시)

**Interfaces:** 없음 (문서만)

- [ ] **Step 1: 마스터 스펙 §12에 이력 추가**

`## 12. MVP 이후 확장 이력` 목록 끝(문서 모드 항목 다음)에 추가:

```markdown
- **Plan 6 — 발표 모드·런타임 갱신 (2026-07-03)**: 포맷 v1.1 — 슬라이드 선택 속성 `data-transition="fade|push"`·`data-notes`(1급 필드, 미지원 값은 extraAttrs 보존), 런타임을 `<script data-webdeck-runtime="2">` 단일 마킹 스크립트로 통합(발표 CSS·버튼은 브라우저에서 주입), 문서 자체 전체화면 발표 모드(발표 버튼/`P`, `←→`·`Space`·`Home/End`·`Esc`, fullscreen 거부 시 오버레이 폴백). 에디터는 열기 시 `normalizeRuntime`으로 런타임 자동 최신화(마커→v1 시그니처 휴리스틱→보존, 멱등), 속성 패널에서 전환·노트 편집. 버전 속성은 "1" 유지(신규 속성 전부 선택적). 상세: `2026-07-03-webdeck-presentation-design.md`
```

- [ ] **Step 2: README "현재 제공" 갱신**

"현재 제공" 목록의 "**문서 모드**" 항목 다음에 추가:

```markdown
- **발표 모드** — 저장된 문서를 브라우저로 열고 우상단 "발표"(또는 `P`)로 전체화면 발표. 슬라이드 전환 효과(페이드/밀기)와 노트는 에디터 속성 패널에서 지정. 에디터로 저장하면 문서 내장 런타임이 항상 최신으로 갱신됨
```

- [ ] **Step 3: roadmap.md Plan 6 완료 표시**

`### Plan 6 — 발표 모드와 런타임 갱신` 제목을 `### Plan 6 — 발표 모드와 런타임 갱신 ✅ (완료)`로 바꾸고, 해당 문단 끝에 한 줄 추가:

```markdown
— 2026-07-03 완료. 발표자 뷰·요소 애니메이션은 미착수(로드맵 G 잔여), 슬라이드 노트는 data-notes로 포함됨.
```

- [ ] **Step 4: 전체 검증**

Run (리포 루트): `npm run test:all && cd editor && npm run typecheck && npm run build`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add docs/superpowers/specs/2026-07-02-webdeck-design.md README.md docs/roadmap.md
git commit -m "docs: Plan 6 이력·README·로드맵 갱신"
```

---

## 알려진 한계 (구현하지 않음 — 스펙 §6)

- 전체화면 거부 시 고정 오버레이 폴백(브라우저 UI 잔존)
- 발표 모드는 저장된 문서에서만 — 에디터 미리보기 없음
- 런타임 미인식 문서(커스텀 스크립트만)는 발표 모드 미탑재 (보존 우선)
- 노트는 발표 중 미표시 (발표자 뷰 후속)

## 수동 확인 (사람 확인 — 머지 후)

1. 에디터에서 새 문서 저장 → 브라우저로 열기 → 우상단 "발표" 버튼/`P`로 전체화면 진입, `←→`/`Space`/클릭 이동, `Esc` 종료
2. 속성 패널에서 슬라이드 전환을 페이드/밀기로 지정·노트 입력 → 저장 → 발표에서 전환 효과 확인
3. 구버전 문서(기존에 만든 파일) 열기 → 저장 → 브라우저로 열면 발표 버튼이 생겼는지, 기존 스크롤 보기·인쇄가 그대로인지
4. `node tools/validate-webdeck.mjs <저장 문서>` 통과
5. 발표 중 창 크기 변경 시 슬라이드 재스케일 확인
