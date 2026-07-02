# WebDeck Plan 3b — 편집 상호작용 + 저장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 3a의 뷰어 앱에 PPT식 편집 상호작용(선택/드래그/리사이즈/스냅, 텍스트 인라인 편집, 서식 툴바, 슬라이드 관리, 단축키, undo/redo)과 안전한 저장(왕복 검증 안전망 + FSA/다운로드 폴백)을 붙여 MVP를 완성한다.

**Architecture:** "모델이 진실, HTML은 저장 포맷" 유지 — 모든 편집은 순수 ops로 새 DeckDoc을 만들고 `APPLY_DOC` 액션으로 history에 push한다. 제스처(드래그/리사이즈) 중에는 history에 넣지 않고 미리보기 doc만 렌더하다가 pointerup에 1회 커밋한다(undo 1스텝 = 제스처 1회). 텍스트 편집만 예외적으로 contentEditable DOM을 쓰되, 종료 시 `setTextHtml`로 모델에 커밋한다. 저장 직전에는 serialize→parse 왕복 동등성 검사를 최후 안전망으로 실행해 문서 파괴를 차단한다.

**Tech Stack:** React 19 + TypeScript(strict) + Vite 8, Vitest + happy-dom + React Testing Library + user-event. 런타임 의존성은 react/react-dom만.

## Global Constraints

- 에디터 런타임 의존성은 `react`, `react-dom` **둘뿐** — 새 런타임 의존성 추가 금지 (스펙 §6.1, editor/package.json dependencies)
- TypeScript strict + `noUncheckedIndexedAccess` — 인덱스 접근은 `!` 또는 가드 필요. import는 확장자 포함 (`./x.ts`, allowImportingTsExtensions)
- 모든 UI 문구·오류 메시지는 한국어
- **모델이 진실**: DOM 직접 편집 금지. 유일한 예외는 텍스트 편집 중 contentEditable 내부이며, 편집 종료 시 `setTextHtml`로 모델에 커밋한다 (스펙 §6.2)
- **undo granularity**: history 1엔트리 = 완료된 편집 1회 (드래그/리사이즈는 pointerup에 1회, 텍스트는 편집 종료에 1회). pointermove마다 push 금지
- **왕복 보존 원칙**: 파서가 이해하지 못하는 내용은 opaque 보존. 기존 왕복 계약 3종(모델 동등성, 2회차 문자열 고정점, 검증기 0오류/0경고) 테스트는 계속 통과해야 한다
- opaque 요소는 편집 대상이 아니다: 선택/이동/삭제 UI 비노출 (frame이 없음)
- 문서의 추가 class 토큰은 모델에 보존만 하고 **에디터 렌더링 className에는 넣지 않는다** (에디터 CSS와 충돌 위험 — 예: 문서의 `error` 클래스가 에디터 `.error` 스타일을 상속받는 사고 방지)
- frame의 캔버스 밖 이동은 막지 않는다 (PPT와 동일, 검증기는 경고만) — 클램핑 없음
- 테스트: `cd editor && npm test` (vitest run, happy-dom, globals: true). 타입체크: `npm run typecheck`. 전체 검증: 루트에서 `node --test 'tools/**/*.test.mjs'`도 통과 유지
- happy-dom에는 `fileURLToPath(new URL(...))` 버그가 있다 — 파일 경로가 필요한 테스트는 기존 패턴 `import.meta.dirname ? ... : fileURLToPath(...)` 사용 (serialize.test.ts 참고)
- happy-dom에 없는 브라우저 API(`document.execCommand`, `URL.createObjectURL`, `showSaveFilePicker` 등)는 테스트에서 스텁한다 — 구현 코드는 옵셔널 가드 필수
- 커밋 메시지는 기존 스타일: `feat:`/`fix:`/`test:` + 한국어 요약

## 파일 구조 (이 플랜에서 만들거나 고치는 것)

| 파일 | 책임 |
|---|---|
| `editor/src/model/types.ts` (수정) | `extraClasses`(Slide·요소), `deckExtraClasses`/`deckExtraAttrs`(DeckDoc) 추가 |
| `editor/src/model/parse.ts` (수정) | class 토큰·deck 속성 보존 파싱 |
| `editor/src/model/serialize.ts` (수정) | 위 보존 필드 직렬화 |
| `editor/src/model/ops.ts` (수정) | 팩토리·addSlide·duplicateSlide에 extraClasses 반영 |
| `editor/src/model/roundtrip.ts` (신규) | 저장 전 안전망 `checkRoundTrip(doc)` |
| `editor/src/state/store.ts` (수정) | 선택·텍스트편집·클립보드·저장 상태 + APPLY_DOC/UNDO/REDO 등 액션 |
| `editor/src/canvas/geometry.ts` (신규) | 순수 기하: `resizeFrame`, `snapMove`, `buildSnapTargets`, `alignFrame` |
| `editor/src/canvas/ElementView.tsx` (수정) | 선택/더블클릭 핸들러, 텍스트 편집 모드 렌더 |
| `editor/src/canvas/SlideView.tsx` (수정) | `interaction` prop 전달 (썸네일은 미전달 → 기존과 동일) |
| `editor/src/canvas/SelectionOverlay.tsx` (신규) | 선택 테두리 + 8방향 핸들 + 스냅 가이드 라인 |
| `editor/src/canvas/TextEditable.tsx` (신규) | contentEditable 래퍼 (mount 시 1회 innerHTML, blur/Escape 커밋) |
| `editor/src/canvas/CanvasArea.tsx` (수정) | 제스처 상태(이동/리사이즈), 미리보기 doc, 커밋 dispatch |
| `editor/src/panels/Toolbar.tsx` (신규) | 삽입·텍스트 서식·개체 정렬·z순서·삭제·배경색 |
| `editor/src/panels/SlidePanel.tsx` (수정) | 추가/복제/삭제 버튼, 드래그 순서 변경 |
| `editor/src/file/fileAccess.ts` (수정) | `saveHtmlFile`, `downloadHtml` 추가 |
| `editor/src/hooks/useShortcuts.ts` (신규) | 전역 단축키 (Ctrl+Z/Y/C/V/D/S, Delete, 방향키, Escape) |
| `editor/src/ai/adapter.ts` (신규) | `AIServiceAdapter` 인터페이스만 (스펙 §6.4, UI 미노출) |
| `editor/src/App.tsx` (수정) | 저장/undo·redo 버튼, 툴바 배치, 단축키 훅, dirty 표시 |
| `editor/src/app.css` (수정) | 선택 박스·핸들·가이드·툴바 스타일 |
| `docs/ai-guide.md` (수정) | 왕복 보존 비목표 문단 추가 |
| `docs/plan-3-backlog.md` (수정) | 해결된 항목 정리 |

## 태스크 개요 (의존 순서)

1. class 토큰·deck 속성 왕복 보존 (저장 출시 전 필수 갭)
2. 스토어 확장 — 선택/편집/클립보드/저장 상태와 액션
3. 기하 모듈 — 리사이즈·스냅·정렬 순수 함수
4. 캔버스 선택 (클릭/Shift 토글/빈 곳 해제 + 선택 테두리)
5. 드래그 이동 + 스냅 가이드
6. 8방향 리사이즈 핸들
7. 텍스트 인라인 편집 (더블클릭 → contentEditable → 커밋)
8. 툴바 — 삽입/서식/개체 정렬/z순서/삭제/배경색
9. 전역 단축키 + 클립보드 (복사/붙여넣기/복제/삭제/방향키/undo·redo)
10. 슬라이드 패널 편집 — 추가/복제/삭제/드래그 순서
11. 저장 — 왕복 검증 안전망 + FSA 저장 + 다운로드 폴백 + dirty 표시
12. AIServiceAdapter 인터페이스 + 문서·백로그 정리

---

### Task 1: class 토큰·deck 속성 왕복 보존

`<section class="slide intro">`의 `intro`, `<div class="el el-text fancy">`의 `fancy`, `<main class="deck" id="x" style="...">`의 부가 속성이 현재 왕복에서 소리 없이 유실된다(검증기는 0오류/0경고 통과). 저장 기능이 올라가기 전에 반드시 닫아야 하는 데이터 파괴 갭이다 (docs/plan-3-backlog.md 최상단 항목).

**Files:**
- Modify: `editor/src/model/types.ts`
- Modify: `editor/src/model/parse.ts`
- Modify: `editor/src/model/serialize.ts`
- Modify: `editor/src/model/ops.ts`
- Test: `editor/src/model/preservation.test.ts` (추가), `editor/src/model/ops.test.ts` (수정)

**Interfaces:**
- Consumes: 기존 `DeckDoc`/`Slide`/`SlideElement` 모델, `parseWebdeck`, `serializeWebdeck`
- Produces: `Slide.extraClasses: string[]`, `ElementBase.extraClasses: string[]`, `DeckDoc.deckExtraClasses: string[]`, `DeckDoc.deckExtraAttrs: Record<string, string>` — 이후 모든 태스크가 이 모델 형태를 사용. 팩토리(`createTextElement` 등)와 `addSlide`는 `extraClasses: []`로 생성

- [ ] **Step 1: 실패하는 보존 테스트 작성**

`editor/src/model/preservation.test.ts`의 describe 블록 안에 추가:

```ts
  test('슬라이드·요소의 추가 class 토큰이 보존된다', () => {
    const html = doc(`<section class="slide intro cover"><div class="el el-text fancy" style="left:0px; top:0px; width:100px; height:50px;"><p>a</p></div></section>`)
    const m = parseWebdeck(html)
    expect(m.slides[0]!.extraClasses).toEqual(['intro', 'cover'])
    const el = m.slides[0]!.elements[0]!
    expect(el.type).toBe('text')
    if (el.type === 'text') expect(el.extraClasses).toEqual(['fancy'])
    const out = serializeWebdeck(m)
    expect(out).toContain('class="slide intro cover"')
    expect(out).toContain('class="el el-text fancy"')
    expect(parseWebdeck(out)).toEqual(m)
  })

  test('deck(main)의 추가 class·속성이 보존된다', () => {
    const html = doc('BASIC').replace(
      '<main class="deck" data-slide-width="1280" data-slide-height="720">',
      '<main class="deck presentation" data-slide-width="1280" data-slide-height="720" id="deck-1" data-owner="hr">',
    ).replace('BASIC', BASIC_SLIDE)
    const m = parseWebdeck(html)
    expect(m.deckExtraClasses).toEqual(['presentation'])
    expect(m.deckExtraAttrs).toEqual({ id: 'deck-1', 'data-owner': 'hr' })
    const out = serializeWebdeck(m)
    expect(out).toContain('class="deck presentation"')
    expect(out).toContain('id="deck-1"')
    expect(parseWebdeck(out)).toEqual(m)
  })

  test('class 토큰이 없는 문서는 빈 배열로 파싱된다 (회귀 없음)', () => {
    const m = parseWebdeck(doc(BASIC_SLIDE))
    expect(m.deckExtraClasses).toEqual([])
    expect(m.deckExtraAttrs).toEqual({})
    expect(m.slides[0]!.extraClasses).toEqual([])
  })
```

주의: 두 번째 테스트의 `doc('BASIC').replace(...)` 체인은 헬퍼 `doc()`이 만든 `<main ...>` 문자열을 통째로 치환한다. 헬퍼 시그니처는 그대로 둔다.

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/preservation.test.ts`
Expected: FAIL — `extraClasses`/`deckExtraClasses` 프로퍼티 없음 (타입 오류 또는 undefined 비교 실패)

- [ ] **Step 3: types.ts에 필드 추가**

`editor/src/model/types.ts`에서 `ElementBase`, `Slide`, `DeckDoc`을 수정:

```ts
interface ElementBase {
  id: string
  frame: Frame
  /** frame(left/top/width/height) 외의 인라인 스타일 — background 등. 왕복 보존 */
  extraStyle: Record<string, string>
  /** class/style/data-shape 외의 속성 — 왕복 보존 */
  extraAttrs: Record<string, string>
  /** el/el-text·el-image·el-shape 외의 class 토큰 — 왕복 보존 (에디터 렌더에는 미적용) */
  extraClasses: string[]
}
```

`Slide`에 추가 (`bg` 아래):

```ts
  /** slide 외의 class 토큰 — 왕복 보존 */
  extraClasses: string[]
```

`DeckDoc`에 추가 (`slideHeight` 아래):

```ts
  /** deck 외의 main class 토큰 — 왕복 보존 */
  deckExtraClasses: string[]
  /** class/data-slide-width/data-slide-height 외의 main 속성 — 왕복 보존 */
  deckExtraAttrs: Record<string, string>
```

- [ ] **Step 4: parse.ts에 보존 파싱 추가**

`editor/src/model/parse.ts`에 헬퍼를 추가하고 세 곳에서 사용:

```ts
/** class 속성에서 known 토큰을 제외한 나머지를 원문 순서대로 반환 */
function extraClassesOf(el: Element, known: string[]): string[] {
  return (el.getAttribute('class') ?? '')
    .split(/\s+/)
    .filter((t) => t !== '' && !known.includes(t))
}
```

`parseWebdeck` 안에서 deck 파싱 직후(slideWidth/Height 검증 뒤)에:

```ts
  const deckExtraClasses = extraClassesOf(deck, ['deck'])
  const deckExtraAttrs: Record<string, string> = {}
  for (const attr of Array.from(deck.attributes)) {
    if (attr.name === 'class' || attr.name === 'data-slide-width' || attr.name === 'data-slide-height') continue
    deckExtraAttrs[attr.name] = attr.value
  }
```

반환 객체에 `deckExtraClasses, deckExtraAttrs` 추가.

`parseSlide`에서:

```ts
  return { id, bg: section.getAttribute('data-bg'), extraClasses: extraClassesOf(section, ['slide']), extraAttrs, elements }
```

`parseElement`에서 `extraAttrs` 계산 직후에 타입별 known 토큰으로 계산해 세 known 분기 반환 객체에 `extraClasses` 필드를 추가:

```ts
  const extraClasses = extraClassesOf(el, ['el', 'el-text', 'el-image', 'el-shape'])
```

(`el-text` 요소에 `el-image` 토큰이 같이 붙는 병리적 경우는 첫 매칭 분기 — 기존 파서의 분기 순서 — 를 따르므로 known 목록은 세 타입 공통으로 써도 왕복이 유지된다. 단 그런 문서는 이미 검증기가 다루지 않는 영역이다.)

- [ ] **Step 5: serialize.ts에 보존 직렬화 추가**

`serializeWebdeck`의 `<main ...>` 줄을 다음으로 교체:

```ts
  const deckClass = ['deck', ...doc.deckExtraClasses].join(' ')
  const deckExtra = attrsString(doc.deckExtraAttrs)
```

```ts
<main class="${deckClass}" data-slide-width="${doc.slideWidth}" data-slide-height="${doc.slideHeight}"${deckExtra}>
```

`serializeSlide`:

```ts
function serializeSlide(slide: Slide): string {
  const cls = ['slide', ...slide.extraClasses].join(' ')
  const bg = slide.bg === null ? '' : ` data-bg="${escapeAttr(slide.bg)}"`
  const extra = attrsString(slide.extraAttrs)
  const els = slide.elements.map((el) => `    ${serializeElement(el)}`).join('\n')
  const body = els ? `\n${els}\n  ` : '\n  '
  return `  <section class="${cls}"${bg}${extra}>${body}</section>`
}
```

`serializeElement`의 세 분기에서 class 문자열을 조립 (예: text):

```ts
function elementClass(el: KnownElement): string {
  const base = { text: 'el el-text', image: 'el el-image', shape: 'el el-shape' }[el.type]
  return [base, ...el.extraClasses].join(' ')
}
```

```ts
    case 'text':
      return `<div class="${elementClass(el)}" style="${escapeAttr(style)}"${attrs}>${el.html}</div>`
```

image/shape 분기도 동일하게 `class="${elementClass(el)}"`로 교체 (shape는 `data-shape="rect"` 유지).

- [ ] **Step 6: ops.ts 팩토리·addSlide 반영**

`addSlide`의 슬라이드 리터럴과 팩토리 3종에 `extraClasses: []` 추가, `duplicateSlide`의 슬라이드 복사에 `extraClasses: [...src.extraClasses]` 추가. (요소 복사는 `structuredClone`이라 자동 반영.)

- [ ] **Step 7: 전체 테스트·타입체크로 파급 수정**

Run: `cd editor && npm test && npm run typecheck`
Expected: ops.test.ts·store.test.ts·integration.test.ts 등에서 슬라이드/요소 리터럴을 직접 만드는 테스트가 타입 오류로 깨질 수 있다 — 해당 리터럴에 `extraClasses: []`(및 DeckDoc 리터럴엔 `deckExtraClasses: [], deckExtraAttrs: {}`)를 추가해서 고친다. 동작 기대값 변경은 없어야 한다. 최종적으로 editor 전체 PASS + 루트 `node --test 'tools/**/*.test.mjs'` 22개 PASS.

- [ ] **Step 8: 커밋**

```bash
git add editor/src/model
git commit -m "fix: class 토큰·deck 속성 왕복 보존 (저장 전 필수 갭 해소)"
```

---

### Task 2: 스토어 확장 — 선택/편집/클립보드/저장 상태

**Files:**
- Modify: `editor/src/state/store.ts`
- Test: `editor/src/state/store.test.ts`

**Interfaces:**
- Consumes: `History`/`push`/`undo`/`redo` (`../model/history.ts`), `DeckDoc`/`KnownElement` (`../model/types.ts`)
- Produces: 확장된 `EditorState`(아래 전체 코드), `EditorAction`의 신규 액션 `APPLY_DOC`/`UNDO`/`REDO`/`SELECT_ELEMENTS`/`TOGGLE_SELECT`/`CLEAR_SELECTION`/`START_TEXT_EDIT`/`END_TEXT_EDIT`/`SET_CLIPBOARD`/`MARK_SAVED`/`SAVE_ERROR`, 파생 함수 `isDirty(state): boolean`. 이후 모든 UI 태스크는 편집 결과 doc을 `dispatch({ type: 'APPLY_DOC', doc, select? })`로 커밋한다

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/state/store.test.ts`에 추가 (기존 테스트는 유지하되, 상태 리터럴이 있으면 새 필드를 채워 컴파일을 고친다):

```ts
import { describe, expect, test } from 'vitest'
import { moveElement } from '../model/ops.ts'
import { parseWebdeck } from '../model/parse.ts'
import { editorReducer, initialEditorState, isDirty } from './store.ts'
import type { EditorState } from './store.ts'

const TWO_SLIDES = `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>a</p></div></section>
<section class="slide"></section>
</main></body></html>`

function opened(): EditorState {
  return editorReducer(initialEditorState, {
    type: 'OPEN_SUCCESS',
    doc: parseWebdeck(TWO_SLIDES),
    fileName: 't.html',
    fileHandle: null,
  })
}

describe('편집 상태', () => {
  test('OPEN_SUCCESS는 savedDoc을 설정하고 dirty가 아니다', () => {
    const s = opened()
    expect(s.savedDoc).toBe(s.doc)
    expect(isDirty(s)).toBe(false)
  })

  test('APPLY_DOC은 history에 push하고 dirty가 된다', () => {
    const s0 = opened()
    const elId = s0.doc!.slides[0]!.elements[0]!.id
    const s1 = editorReducer(s0, { type: 'APPLY_DOC', doc: moveElement(s0.doc!, s0.doc!.slides[0]!.id, elId, 10, 0) })
    expect(s1.history!.past).toHaveLength(1)
    expect(isDirty(s1)).toBe(true)
  })

  test('UNDO/REDO는 doc을 되돌리고 선택·텍스트 편집을 정리한다', () => {
    const s0 = opened()
    const slide = s0.doc!.slides[0]!
    const elId = slide.elements[0]!.id
    let s = editorReducer(s0, { type: 'SELECT_ELEMENTS', ids: [elId] })
    s = editorReducer(s, { type: 'APPLY_DOC', doc: moveElement(s.doc!, slide.id, elId, 10, 0) })
    s = editorReducer(s, { type: 'START_TEXT_EDIT', id: elId })
    s = editorReducer(s, { type: 'UNDO' })
    expect(s.doc).toBe(s0.doc)
    expect(s.editingTextId).toBeNull()
    s = editorReducer(s, { type: 'REDO' })
    expect(s.doc!.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 10 } })
  })

  test('TOGGLE_SELECT는 추가/제거를 오간다', () => {
    let s = editorReducer(opened(), { type: 'TOGGLE_SELECT', id: 'a' })
    expect(s.selectedIds).toEqual(['a'])
    s = editorReducer(s, { type: 'TOGGLE_SELECT', id: 'a' })
    expect(s.selectedIds).toEqual([])
  })

  test('SELECT_SLIDE는 선택과 텍스트 편집을 해제한다', () => {
    let s = editorReducer(opened(), { type: 'SELECT_ELEMENTS', ids: ['x'] })
    s = editorReducer(s, { type: 'START_TEXT_EDIT', id: 'x' })
    s = editorReducer(s, { type: 'SELECT_SLIDE', index: 1 })
    expect(s.currentSlideIndex).toBe(1)
    expect(s.selectedIds).toEqual([])
    expect(s.editingTextId).toBeNull()
  })

  test('APPLY_DOC에서 사라진 요소는 선택에서 걷어낸다', () => {
    const s0 = opened()
    const slide = s0.doc!.slides[0]!
    const elId = slide.elements[0]!.id
    let s = editorReducer(s0, { type: 'SELECT_ELEMENTS', ids: [elId] })
    const removed = { ...s.doc!, slides: [{ ...slide, elements: [] }, s.doc!.slides[1]!] }
    s = editorReducer(s, { type: 'APPLY_DOC', doc: removed })
    expect(s.selectedIds).toEqual([])
  })

  test('MARK_SAVED는 dirty를 해제하고 SAVE_ERROR는 메시지를 남긴다', () => {
    const s0 = opened()
    const elId = s0.doc!.slides[0]!.elements[0]!.id
    let s = editorReducer(s0, { type: 'APPLY_DOC', doc: moveElement(s0.doc!, s0.doc!.slides[0]!.id, elId, 1, 1) })
    s = editorReducer(s, { type: 'MARK_SAVED', doc: s.doc! })
    expect(isDirty(s)).toBe(false)
    s = editorReducer(s, { type: 'SAVE_ERROR', message: '실패' })
    expect(s.saveError).toBe('실패')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/state/store.test.ts`
Expected: FAIL — `isDirty` 미정의, 신규 액션 타입 오류

- [ ] **Step 3: store.ts 구현**

`editor/src/state/store.ts` 전체를 다음으로 교체:

```ts
import { createHistory, push, redo, undo } from '../model/history.ts'
import type { History } from '../model/history.ts'
import type { DeckDoc, KnownElement } from '../model/types.ts'

export interface EditorState {
  doc: DeckDoc | null
  history: History | null
  fileName: string | null
  fileHandle: FileSystemFileHandle | null
  currentSlideIndex: number
  opaqueCount: number
  loadError: string | null
  /** 현재 슬라이드에서 선택된 요소 id들 (opaque 제외) */
  selectedIds: string[]
  /** 인라인 텍스트 편집 중인 요소 id */
  editingTextId: string | null
  /** 복사된 요소들 — 붙여넣기 시 id 재발급 */
  clipboard: KnownElement[]
  /** 마지막 저장 시점의 doc — dirty 판정은 참조 비교 */
  savedDoc: DeckDoc | null
  saveError: string | null
}

export const initialEditorState: EditorState = {
  doc: null,
  history: null,
  fileName: null,
  fileHandle: null,
  currentSlideIndex: 0,
  opaqueCount: 0,
  loadError: null,
  selectedIds: [],
  editingTextId: null,
  clipboard: [],
  savedDoc: null,
  saveError: null,
}

export type EditorAction =
  | { type: 'OPEN_SUCCESS'; doc: DeckDoc; fileName: string; fileHandle: FileSystemFileHandle | null }
  | { type: 'OPEN_ERROR'; message: string }
  | { type: 'SELECT_SLIDE'; index: number }
  | { type: 'APPLY_DOC'; doc: DeckDoc; select?: string[] }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SELECT_ELEMENTS'; ids: string[] }
  | { type: 'TOGGLE_SELECT'; id: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'START_TEXT_EDIT'; id: string }
  | { type: 'END_TEXT_EDIT' }
  | { type: 'SET_CLIPBOARD'; elements: KnownElement[] }
  | { type: 'MARK_SAVED'; doc: DeckDoc }
  | { type: 'SAVE_ERROR'; message: string }

export function countOpaque(doc: DeckDoc): number {
  return doc.slides.reduce((n, s) => n + s.elements.filter((e) => e.type === 'opaque').length, 0)
}

export function isDirty(state: EditorState): boolean {
  return state.doc !== null && state.doc !== state.savedDoc
}

/** doc 교체 후 파생 상태(인덱스 클램프·선택 정리) 일괄 갱신 */
function withDoc(state: EditorState, doc: DeckDoc, history: History, select?: string[]): EditorState {
  const index = Math.max(0, Math.min(doc.slides.length - 1, state.currentSlideIndex))
  const alive = new Set(doc.slides[index]?.elements.map((e) => e.id) ?? [])
  const selectedIds = (select ?? state.selectedIds).filter((id) => alive.has(id))
  const editingTextId = state.editingTextId !== null && alive.has(state.editingTextId) ? state.editingTextId : null
  return { ...state, doc, history, currentSlideIndex: index, opaqueCount: countOpaque(doc), selectedIds, editingTextId }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'OPEN_SUCCESS':
      return {
        ...initialEditorState,
        doc: action.doc,
        history: createHistory(action.doc),
        fileName: action.fileName,
        fileHandle: action.fileHandle,
        opaqueCount: countOpaque(action.doc),
        savedDoc: action.doc,
        clipboard: state.clipboard,
      }
    case 'OPEN_ERROR':
      return { ...state, loadError: action.message }
    case 'SELECT_SLIDE': {
      if (!state.doc) return state
      const max = state.doc.slides.length - 1
      const index = Math.max(0, Math.min(max, action.index))
      return { ...state, currentSlideIndex: index, selectedIds: [], editingTextId: null }
    }
    case 'APPLY_DOC': {
      if (!state.history) return state
      return withDoc(state, action.doc, push(state.history, action.doc), action.select)
    }
    case 'UNDO': {
      if (!state.history) return state
      const h = undo(state.history)
      return withDoc({ ...state, editingTextId: null }, h.present, h)
    }
    case 'REDO': {
      if (!state.history) return state
      const h = redo(state.history)
      return withDoc({ ...state, editingTextId: null }, h.present, h)
    }
    case 'SELECT_ELEMENTS':
      return { ...state, selectedIds: action.ids }
    case 'TOGGLE_SELECT':
      return {
        ...state,
        selectedIds: state.selectedIds.includes(action.id)
          ? state.selectedIds.filter((id) => id !== action.id)
          : [...state.selectedIds, action.id],
      }
    case 'CLEAR_SELECTION':
      return { ...state, selectedIds: [], editingTextId: null }
    case 'START_TEXT_EDIT':
      return { ...state, editingTextId: action.id, selectedIds: [action.id] }
    case 'END_TEXT_EDIT':
      return { ...state, editingTextId: null }
    case 'SET_CLIPBOARD':
      return { ...state, clipboard: action.elements }
    case 'MARK_SAVED':
      return { ...state, savedDoc: action.doc, saveError: null }
    case 'SAVE_ERROR':
      return { ...state, saveError: action.message }
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS (App.test.tsx 등 기존 테스트 포함)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/state
git commit -m "feat: 에디터 스토어에 선택·클립보드·undo/redo·저장 상태 추가"
```

---

### Task 3: 기하 모듈 — 리사이즈·스냅·정렬 순수 함수

**Files:**
- Create: `editor/src/canvas/geometry.ts`
- Test: `editor/src/canvas/geometry.test.ts`

**Interfaces:**
- Consumes: `Frame` (`../model/types.ts`)
- Produces:
  - `type ResizeHandle = 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'`, `RESIZE_HANDLES: ResizeHandle[]`, `MIN_SIZE = 8`
  - `resizeFrame(orig: Frame, handle: ResizeHandle, dx: number, dy: number): Frame`
  - `SNAP_THRESHOLD = 6`, `interface SnapTargets { xs: number[]; ys: number[] }`, `buildSnapTargets(slideWidth: number, slideHeight: number, otherFrames: Frame[]): SnapTargets`
  - `interface Guide { axis: 'x'|'y'; position: number }`, `interface SnapResult { dx: number; dy: number; guides: Guide[] }`, `snapMove(frame: Frame, dx: number, dy: number, targets: SnapTargets): SnapResult`
  - `type AlignMode = 'left'|'center-h'|'right'|'top'|'middle'|'bottom'`, `alignFrame(frame: Frame, slideWidth: number, slideHeight: number, mode: AlignMode): Frame`
- Task 5(이동 스냅), Task 6(리사이즈), Task 8(개체 정렬)이 사용한다. 스냅은 v1에서 **이동에만** 적용한다(리사이즈 스냅은 추후)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/geometry.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { alignFrame, buildSnapTargets, resizeFrame, snapMove } from './geometry.ts'

const F = { left: 100, top: 100, width: 200, height: 100 }

describe('resizeFrame', () => {
  test('se 핸들은 너비·높이만 키운다', () => {
    expect(resizeFrame(F, 'se', 30, 20)).toEqual({ left: 100, top: 100, width: 230, height: 120 })
  })
  test('nw 핸들은 left/top을 옮기며 크기를 줄인다', () => {
    expect(resizeFrame(F, 'nw', 30, 20)).toEqual({ left: 130, top: 120, width: 170, height: 80 })
  })
  test('n 핸들은 세로만 바꾼다', () => {
    expect(resizeFrame(F, 'n', 999, -10)).toEqual({ left: 100, top: 90, width: 200, height: 110 })
  })
  test('최소 크기(8px) 아래로 줄어들지 않는다', () => {
    const r = resizeFrame(F, 'se', -500, -500)
    expect(r.width).toBe(8)
    expect(r.height).toBe(8)
    const r2 = resizeFrame(F, 'nw', 500, 500)
    expect(r2).toEqual({ left: 292, top: 192, width: 8, height: 8 })
  })
})

describe('snapMove', () => {
  const targets = buildSnapTargets(1280, 720, [{ left: 500, top: 0, width: 100, height: 50 }])
  test('임계값(6px) 안이면 슬라이드 중앙에 스냅하고 가이드를 낸다', () => {
    // frame 중심 = left+dx+100 → 목표 640: left=100,dx=436 → 중심 636, 오프셋 +4
    const r = snapMove(F, 436, 0, targets)
    expect(r.dx).toBe(440)
    expect(r.guides).toContainEqual({ axis: 'x', position: 640 })
  })
  test('임계값 밖이면 스냅하지 않는다', () => {
    // dx 150 → 변 250/350/450, 대상 xs {0,640,1280,500,550,600} 어디에도 6px 내 없음
    const r = snapMove(F, 150, 150, targets)
    expect(r).toEqual({ dx: 150, dy: 150, guides: [] })
  })
  test('다른 요소의 왼쪽 변에도 스냅한다', () => {
    // frame left = 100+dx → 목표 500: dx=395 → 495, 오프셋 +5
    const r = snapMove(F, 395, 300, targets)
    expect(r.dx).toBe(400)
    expect(r.guides).toContainEqual({ axis: 'x', position: 500 })
  })
})

describe('alignFrame', () => {
  test('가로 중앙 정렬', () => {
    expect(alignFrame(F, 1280, 720, 'center-h')).toEqual({ ...F, left: 540 })
  })
  test('아래 정렬', () => {
    expect(alignFrame(F, 1280, 720, 'bottom')).toEqual({ ...F, top: 620 })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/canvas/geometry.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: geometry.ts 구현**

```ts
import type { Frame } from '../model/types.ts'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const MIN_SIZE = 8
export const SNAP_THRESHOLD = 6

export function resizeFrame(orig: Frame, handle: ResizeHandle, dx: number, dy: number): Frame {
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
  return { left, top, width, height }
}

export interface SnapTargets {
  xs: number[]
  ys: number[]
}

/** 스냅 대상: 슬라이드 가장자리·중앙 + 다른 요소들의 변·중앙 */
export function buildSnapTargets(slideWidth: number, slideHeight: number, otherFrames: Frame[]): SnapTargets {
  const xs = [0, slideWidth / 2, slideWidth]
  const ys = [0, slideHeight / 2, slideHeight]
  for (const f of otherFrames) {
    xs.push(f.left, f.left + f.width / 2, f.left + f.width)
    ys.push(f.top, f.top + f.height / 2, f.top + f.height)
  }
  return { xs, ys }
}

export interface Guide {
  axis: 'x' | 'y'
  position: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: Guide[]
}

function bestOffset(edges: number[], targets: number[]): { offset: number; target: number } | null {
  let best: { offset: number; target: number } | null = null
  for (const edge of edges) {
    for (const target of targets) {
      const offset = target - edge
      if (Math.abs(offset) <= SNAP_THRESHOLD && (!best || Math.abs(offset) < Math.abs(best.offset))) {
        best = { offset, target }
      }
    }
  }
  return best
}

/** 이동 중 스냅: 이동한 frame의 변·중앙을 대상 라인에 끌어붙인 보정 delta와 가이드를 반환 */
export function snapMove(frame: Frame, dx: number, dy: number, targets: SnapTargets): SnapResult {
  const xs = [frame.left + dx, frame.left + dx + frame.width / 2, frame.left + dx + frame.width]
  const ys = [frame.top + dy, frame.top + dy + frame.height / 2, frame.top + dy + frame.height]
  const bx = bestOffset(xs, targets.xs)
  const by = bestOffset(ys, targets.ys)
  const guides: Guide[] = []
  if (bx) guides.push({ axis: 'x', position: bx.target })
  if (by) guides.push({ axis: 'y', position: by.target })
  return { dx: dx + (bx?.offset ?? 0), dy: dy + (by?.offset ?? 0), guides }
}

export type AlignMode = 'left' | 'center-h' | 'right' | 'top' | 'middle' | 'bottom'

export function alignFrame(frame: Frame, slideWidth: number, slideHeight: number, mode: AlignMode): Frame {
  switch (mode) {
    case 'left':
      return { ...frame, left: 0 }
    case 'center-h':
      return { ...frame, left: (slideWidth - frame.width) / 2 }
    case 'right':
      return { ...frame, left: slideWidth - frame.width }
    case 'top':
      return { ...frame, top: 0 }
    case 'middle':
      return { ...frame, top: (slideHeight - frame.height) / 2 }
    case 'bottom':
      return { ...frame, top: slideHeight - frame.height }
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/canvas/geometry.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add editor/src/canvas/geometry.ts editor/src/canvas/geometry.test.ts
git commit -m "feat: 리사이즈·스냅·정렬 기하 모듈 추가"
```

---

### Task 4: 캔버스 선택 — 클릭/Shift 토글/빈 곳 해제 + 선택 테두리

**Files:**
- Modify: `editor/src/canvas/ElementView.tsx`
- Modify: `editor/src/canvas/SlideView.tsx`
- Create: `editor/src/canvas/SelectionOverlay.tsx`
- Modify: `editor/src/canvas/CanvasArea.tsx`
- Modify: `editor/src/App.tsx` (CanvasArea에 새 props 전달)
- Modify: `editor/src/app.css`
- Test: `editor/src/canvas/CanvasArea.test.tsx` (신규)

**Interfaces:**
- Consumes: `EditorAction`(Task 2), `isKnownElement`, `Guide`(Task 3)
- Produces:
  - `SlideView`의 옵션 prop `interaction?: SlideInteraction` — `interface SlideInteraction { selectedIds: string[]; editingTextId: string | null; onElementPointerDown: (e: ReactPointerEvent, id: string) => void }` (SlideView.tsx에서 export). 썸네일(SlidePanel)은 계속 interaction 없이 사용 → 기존 렌더와 동일
  - `ElementView`의 옵션 prop `interaction?: ElementInteraction` — `interface ElementInteraction { selected: boolean; editing: boolean; onPointerDown: (e: ReactPointerEvent) => void }` (ElementView.tsx에서 export)
  - `SelectionOverlay({ slide, selectedIds, guides }: { slide: Slide; selectedIds: string[]; guides: Guide[] })`
  - `CanvasAreaProps { doc: DeckDoc; slideIndex: number; selectedIds: string[]; editingTextId: string | null; dispatch: Dispatch<EditorAction> }`
- 선택 규칙(PPT 동일): 클릭 → 단일 선택, Shift+클릭 → 토글, 이미 선택된 요소 클릭 → 선택 유지(다중 드래그 준비), 빈 영역 클릭 → 전체 해제. opaque 요소는 핸들러를 달지 않는다

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/CanvasArea.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import { CanvasArea } from './CanvasArea.tsx'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>제목</p></div>
<div class="el el-shape" data-shape="rect" style="left:300px; top:300px; width:80px; height:80px;"></div>
</section>
</main></body></html>`)

const EL_TEXT = DOC.slides[0]!.elements[0]!.id
const EL_SHAPE = DOC.slides[0]!.elements[1]!.id

function renderCanvas(selectedIds: string[] = []) {
  const dispatch = vi.fn()
  const utils = render(
    <CanvasArea doc={DOC} slideIndex={0} selectedIds={selectedIds} editingTextId={null} dispatch={dispatch} />,
  )
  return { dispatch, ...utils }
}

test('요소 클릭은 단일 선택을 dispatch한다', () => {
  const { dispatch, getByText } = renderCanvas()
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  expect(dispatch).toHaveBeenCalledWith({ type: 'SELECT_ELEMENTS', ids: [EL_TEXT] })
})

test('Shift+클릭은 토글을 dispatch한다', () => {
  const { dispatch, getByText } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(getByText('제목'), { shiftKey: true, clientX: 10, clientY: 10 })
  expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_SELECT', id: EL_TEXT })
})

test('빈 영역 클릭은 선택을 해제한다', () => {
  const { dispatch, container } = renderCanvas([EL_TEXT])
  fireEvent.pointerDown(container.querySelector('.slide-view')!)
  expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_SELECTION' })
})

test('선택된 요소에 선택 테두리가 그려진다', () => {
  const { container } = renderCanvas([EL_SHAPE])
  const box = container.querySelector('.selection-box') as HTMLElement
  expect(box).toBeTruthy()
  expect(box.style.left).toBe('300px')
  expect(box.style.width).toBe('80px')
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/canvas/CanvasArea.test.tsx`
Expected: FAIL — CanvasArea가 새 props를 받지 않음 (타입 오류)

- [ ] **Step 3: ElementView에 interaction prop 추가**

`editor/src/canvas/ElementView.tsx` 전체 교체:

```tsx
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SlideElement } from '../model/types.ts'
import { cssTextToReact, styleFromModel } from './styleFromModel.ts'

export interface ElementInteraction {
  selected: boolean
  editing: boolean
  onPointerDown: (e: ReactPointerEvent) => void
}

export function ElementView({ element, interaction }: { element: SlideElement; interaction?: ElementInteraction }) {
  const handlers = interaction ? { onPointerDown: interaction.onPointerDown } : {}
  switch (element.type) {
    case 'text':
      return (
        <div
          className="el el-text"
          style={styleFromModel(element.frame, element.extraStyle)}
          dangerouslySetInnerHTML={{ __html: element.html }}
          {...handlers}
        />
      )
    case 'image':
      return (
        <div className="el el-image" style={styleFromModel(element.frame, element.extraStyle)} {...handlers}>
          <img src={element.src} alt={element.alt} style={cssTextToReact(element.imgStyle)} />
        </div>
      )
    case 'shape':
      return <div className="el el-shape" style={styleFromModel(element.frame, element.extraStyle)} {...handlers} />
    case 'opaque':
      return <div className="el-opaque" dangerouslySetInnerHTML={{ __html: element.html }} />
  }
}
```

(`editing`은 Task 7에서 사용한다 — 지금은 인터페이스만 확정.)

- [ ] **Step 4: SlideView에 interaction 전달 추가**

`editor/src/canvas/SlideView.tsx` 전체 교체:

```tsx
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Slide } from '../model/types.ts'
import { ElementView } from './ElementView.tsx'

export interface SlideInteraction {
  selectedIds: string[]
  editingTextId: string | null
  onElementPointerDown: (e: ReactPointerEvent, id: string) => void
}

export function SlideView({
  slide,
  width,
  height,
  themeVars,
  interaction,
}: {
  slide: Slide
  width: number
  height: number
  themeVars: Record<string, string>
  interaction?: SlideInteraction
}) {
  return (
    <section
      className={interaction ? 'slide-view editable' : 'slide-view'}
      style={{ width: `${width}px`, height: `${height}px`, background: slide.bg ?? '#ffffff', ...themeVars }}
    >
      {slide.elements.map((el) => (
        <ElementView
          key={el.id}
          element={el}
          interaction={
            interaction && el.type !== 'opaque'
              ? {
                  selected: interaction.selectedIds.includes(el.id),
                  editing: interaction.editingTextId === el.id,
                  onPointerDown: (e) => interaction.onElementPointerDown(e, el.id),
                }
              : undefined
          }
        />
      ))}
    </section>
  )
}
```

- [ ] **Step 5: SelectionOverlay 생성**

`editor/src/canvas/SelectionOverlay.tsx`:

```tsx
import type { Slide } from '../model/types.ts'
import { isKnownElement } from '../model/types.ts'
import type { Guide } from './geometry.ts'

export function SelectionOverlay({
  slide,
  selectedIds,
  guides,
}: {
  slide: Slide
  selectedIds: string[]
  guides: Guide[]
}) {
  const selected = slide.elements.filter(isKnownElement).filter((el) => selectedIds.includes(el.id))
  return (
    <div className="selection-overlay">
      {selected.map((el) => (
        <div
          key={el.id}
          className="selection-box"
          style={{ left: el.frame.left, top: el.frame.top, width: el.frame.width, height: el.frame.height }}
        />
      ))}
      {guides.map((g, i) => (
        <div
          key={`${g.axis}-${g.position}-${i}`}
          className={g.axis === 'x' ? 'snap-guide snap-guide-x' : 'snap-guide snap-guide-y'}
          style={g.axis === 'x' ? { left: g.position } : { top: g.position }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 6: CanvasArea에 선택 배선**

`editor/src/canvas/CanvasArea.tsx` 전체 교체:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent } from 'react'
import type { DeckDoc } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'
import { SelectionOverlay } from './SelectionOverlay.tsx'
import { SlideView } from './SlideView.tsx'
import { extractThemeVars } from './styleFromModel.ts'

const MARGIN = 48

export interface CanvasAreaProps {
  doc: DeckDoc
  slideIndex: number
  selectedIds: string[]
  editingTextId: string | null
  dispatch: Dispatch<EditorAction>
}

export function CanvasArea({ doc, slideIndex, selectedIds, editingTextId, dispatch }: CanvasAreaProps) {
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

  const onElementPointerDown = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation()
    // 텍스트 편집 중이면 아무 요소든 첫 클릭은 편집 종료(blur 커밋)만 담당 — PPT와 동일
    if (editingTextId !== null) return
    if (e.shiftKey) {
      dispatch({ type: 'TOGGLE_SELECT', id })
      return
    }
    if (!selectedIds.includes(id)) dispatch({ type: 'SELECT_ELEMENTS', ids: [id] })
  }

  const themeVars = extractThemeVars(doc.headExtra)
  return (
    <main className="canvas-area" ref={ref} onPointerDown={() => dispatch({ type: 'CLEAR_SELECTION' })}>
      <div style={{ width: doc.slideWidth * scale, height: doc.slideHeight * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div className="slide-stage" style={{ position: 'relative', width: doc.slideWidth, height: doc.slideHeight }}>
            <SlideView
              slide={slide}
              width={doc.slideWidth}
              height={doc.slideHeight}
              themeVars={themeVars}
              interaction={{ selectedIds, editingTextId, onElementPointerDown }}
            />
            <SelectionOverlay slide={slide} selectedIds={selectedIds} guides={[]} />
          </div>
        </div>
      </div>
    </main>
  )
}
```

이벤트 흐름: 요소 pointerdown은 `stopPropagation()`으로 main까지 오지 않고, 빈 슬라이드/회색 영역 pointerdown은 main의 `CLEAR_SELECTION`에 도달한다.

- [ ] **Step 7: App.tsx 배선 + CSS**

`editor/src/App.tsx`의 CanvasArea 렌더를 다음으로 교체:

```tsx
        <CanvasArea
          doc={state.doc}
          slideIndex={state.currentSlideIndex}
          selectedIds={state.selectedIds}
          editingTextId={state.editingTextId}
          dispatch={dispatch}
        />
```

`editor/src/app.css` 끝에 추가:

```css
.slide-view.editable .el { cursor: move; }
.selection-overlay { position: absolute; inset: 0; pointer-events: none; }
.selection-box { position: absolute; outline: 2px solid var(--wd-primary); }
.snap-guide { position: absolute; background: #f59e0b; z-index: 10; }
.snap-guide-x { top: 0; bottom: 0; width: 1px; }
.snap-guide-y { left: 0; right: 0; height: 1px; }
```

- [ ] **Step 8: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS (SlideView.test.tsx·SlidePanel.test.tsx는 interaction 미전달 경로라 그대로 통과)

- [ ] **Step 9: 커밋**

```bash
git add editor/src
git commit -m "feat: 캔버스 요소 선택(클릭·Shift 토글·해제)과 선택 테두리"
```

---

### Task 5: 드래그 이동 + 스냅 가이드

**Files:**
- Modify: `editor/src/canvas/CanvasArea.tsx`
- Modify: `editor/src/app.css`
- Test: `editor/src/canvas/CanvasArea.test.tsx` (추가)

**Interfaces:**
- Consumes: `moveElement`(ops), `buildSnapTargets`/`snapMove`/`Guide`/`SnapTargets`(Task 3), `SelectionOverlay`의 `guides` prop(Task 4)
- Produces: CanvasArea 내부 제스처 패턴 — pointerdown 시 window에 `pointermove`/`pointerup` 리스너를 걸고, 이동 delta를 `scale`로 나눠 캔버스 좌표로 환산, 미리보기 doc은 `useMemo`로 ops를 즉석 적용, pointerup에 `APPLY_DOC` 1회 dispatch. Task 6이 이 패턴에 리사이즈 제스처를 추가한다
- 스냅 규칙: **단일 요소 이동에만** 적용(다중 이동·리사이즈는 스냅 없음, v1 결정). 임계값 `SNAP_THRESHOLD`(6px, 캔버스 좌표). 3px 미만 이동은 클릭으로 간주(커밋 없음)

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/CanvasArea.test.tsx`에 추가 (파일 상단에 `import type { DeckDoc } from '../model/types.ts'` 추가):

```tsx
const DOC_ONE = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>홀로</p></div></section>
</main></body></html>`)

function appliedDoc(dispatch: ReturnType<typeof vi.fn>): DeckDoc | null {
  const action = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  return action ? (action.doc as DeckDoc) : null
}

test('드래그로 요소를 이동하고 pointerup에 1회만 커밋한다', () => {
  const { dispatch, getByText } = renderCanvas([EL_TEXT])
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { clientX: 60, clientY: 30 })
  fireEvent.pointerUp(window)
  const doc = appliedDoc(dispatch)
  expect(doc).toBeTruthy()
  expect(doc!.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 50, top: 20 } })
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')).toHaveLength(1)
})

test('3px 미만 이동은 클릭으로 간주하고 커밋하지 않는다', () => {
  const { dispatch, getByText } = renderCanvas([EL_TEXT])
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { clientX: 11, clientY: 11 })
  fireEvent.pointerUp(window)
  expect(appliedDoc(dispatch)).toBeNull()
})

test('단일 이동은 슬라이드 중앙에 스냅하고 가이드를 그린다', () => {
  const dispatch = vi.fn()
  const elId = DOC_ONE.slides[0]!.elements[0]!.id
  const { getByText, container } = render(
    <CanvasArea doc={DOC_ONE} slideIndex={0} selectedIds={[elId]} editingTextId={null} dispatch={dispatch} />,
  )
  fireEvent.pointerDown(getByText('홀로'), { clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 594, clientY: 100 })
  const guide = container.querySelector('.snap-guide-x') as HTMLElement
  expect(guide).toBeTruthy()
  expect(guide.style.left).toBe('640px')
  fireEvent.pointerUp(window)
  expect(appliedDoc(dispatch)!.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 590, top: 100 } })
})

test('다중 선택 드래그는 모두 함께 이동한다 (스냅 없음)', () => {
  const { dispatch, getByText } = renderCanvas([EL_TEXT, EL_SHAPE])
  fireEvent.pointerDown(getByText('제목'), { clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { clientX: 60, clientY: 30 })
  fireEvent.pointerUp(window)
  const doc = appliedDoc(dispatch)!
  expect(doc.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 50, top: 20 } })
  expect(doc.slides[0]!.elements[1]!).toMatchObject({ frame: { left: 350, top: 320 } })
})
```

happy-dom 참고: `fireEvent.pointerMove(window, ...)`가 좌표를 싣지 못하면 `fireEvent(window, new MouseEvent('pointermove', { clientX: 60, clientY: 30, bubbles: true }))` 형태로 대체한다 — window 리스너는 이벤트 타입 문자열만 보므로 MouseEvent로 충분하다.

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/canvas/CanvasArea.test.tsx`
Expected: 신규 4개 FAIL (드래그 미구현 — APPLY_DOC이 dispatch되지 않음)

- [ ] **Step 3: CanvasArea에 이동 제스처 구현**

`editor/src/canvas/CanvasArea.tsx` 전체 교체:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent } from 'react'
import { moveElement } from '../model/ops.ts'
import type { DeckDoc, Frame } from '../model/types.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'
import { buildSnapTargets, snapMove } from './geometry.ts'
import type { Guide, SnapTargets } from './geometry.ts'
import { SelectionOverlay } from './SelectionOverlay.tsx'
import { SlideView } from './SlideView.tsx'
import { extractThemeVars } from './styleFromModel.ts'

const MARGIN = 48
const DRAG_THRESHOLD = 3

interface MoveGesture {
  kind: 'move'
  slideId: string
  ids: string[]
  dx: number
  dy: number
  guides: Guide[]
  moved: boolean
}

export interface CanvasAreaProps {
  doc: DeckDoc
  slideIndex: number
  selectedIds: string[]
  editingTextId: string | null
  dispatch: Dispatch<EditorAction>
}

export function CanvasArea({ doc, slideIndex, selectedIds, editingTextId, dispatch }: CanvasAreaProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  scaleRef.current = scale
  const [gesture, setGesture] = useState<MoveGesture | null>(null)

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

  const previewDoc = useMemo(() => {
    if (!gesture || !gesture.moved) return doc
    let d = doc
    for (const id of gesture.ids) d = moveElement(d, gesture.slideId, id, gesture.dx, gesture.dy)
    return d
  }, [doc, gesture])

  const slide = doc.slides[slideIndex]
  if (!slide) return null

  const beginMove = (e: ReactPointerEvent, ids: string[]) => {
    const startX = e.clientX
    const startY = e.clientY
    const known = slide.elements.filter(isKnownElement)
    const single = ids.length === 1 ? known.find((el) => el.id === ids[0]) : undefined
    const targets: SnapTargets | null = single
      ? buildSnapTargets(doc.slideWidth, doc.slideHeight, known.filter((el) => el.id !== single.id).map((el) => el.frame))
      : null
    const startFrame: Frame | null = single ? single.frame : null
    const docAtStart = doc
    const g: MoveGesture = { kind: 'move', slideId: slide.id, ids, dx: 0, dy: 0, guides: [], moved: false }
    const onMove = (ev: PointerEvent) => {
      const rawDx = (ev.clientX - startX) / scaleRef.current
      const rawDy = (ev.clientY - startY) / scaleRef.current
      if (!g.moved && Math.abs(rawDx) < DRAG_THRESHOLD && Math.abs(rawDy) < DRAG_THRESHOLD) return
      g.moved = true
      if (startFrame && targets) {
        const s = snapMove(startFrame, rawDx, rawDy, targets)
        g.dx = s.dx
        g.dy = s.dy
        g.guides = s.guides
      } else {
        g.dx = rawDx
        g.dy = rawDy
        g.guides = []
      }
      setGesture({ ...g })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (g.moved) {
        let d = docAtStart
        for (const id of g.ids) d = moveElement(d, g.slideId, id, g.dx, g.dy)
        dispatch({ type: 'APPLY_DOC', doc: d })
      }
      setGesture(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onElementPointerDown = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation()
    // 텍스트 편집 중이면 첫 클릭은 편집 종료(blur 커밋)만 — preventDefault를 하면 blur가 막힌다
    if (editingTextId !== null) return
    e.preventDefault()
    if (e.shiftKey) {
      dispatch({ type: 'TOGGLE_SELECT', id })
      return
    }
    const ids = selectedIds.includes(id) ? selectedIds : [id]
    if (!selectedIds.includes(id)) dispatch({ type: 'SELECT_ELEMENTS', ids: [id] })
    beginMove(e, ids)
  }

  const previewSlide = previewDoc.slides[slideIndex] ?? slide
  const themeVars = extractThemeVars(doc.headExtra)
  return (
    <main className="canvas-area" ref={ref} onPointerDown={() => dispatch({ type: 'CLEAR_SELECTION' })}>
      <div style={{ width: doc.slideWidth * scale, height: doc.slideHeight * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div className="slide-stage" style={{ position: 'relative', width: doc.slideWidth, height: doc.slideHeight }}>
            <SlideView
              slide={previewSlide}
              width={doc.slideWidth}
              height={doc.slideHeight}
              themeVars={themeVars}
              interaction={{ selectedIds, editingTextId, onElementPointerDown }}
            />
            <SelectionOverlay slide={previewSlide} selectedIds={selectedIds} guides={gesture?.guides ?? []} />
          </div>
        </div>
      </div>
    </main>
  )
}
```

핵심: 리스너는 pointerdown 클로저 안에서 만들어 `g`(로컬 가변 객체)로 계산하고, 렌더용으로만 `setGesture({...g})`를 호출한다. happy-dom에서 `clientWidth`가 0이라 scale은 1로 유지된다(fit의 가드) — 테스트 좌표는 캔버스 좌표와 1:1.

`editor/src/app.css`의 `.slide-view.editable .el` 규칙을 다음으로 교체:

```css
.slide-view.editable .el { cursor: move; user-select: none; }
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add editor/src
git commit -m "feat: 요소 드래그 이동과 스냅 가이드"
```

---

### Task 6: 8방향 리사이즈 핸들

**Files:**
- Modify: `editor/src/canvas/SelectionOverlay.tsx`
- Modify: `editor/src/canvas/CanvasArea.tsx`
- Modify: `editor/src/app.css`
- Test: `editor/src/canvas/CanvasArea.test.tsx` (추가)

**Interfaces:**
- Consumes: `resizeFrame`/`ResizeHandle`/`RESIZE_HANDLES`(Task 3), `setElementFrame`(ops), Task 5의 제스처 패턴
- Produces: `SelectionOverlay`의 옵션 prop `resize?: ResizeInteraction` — `interface ResizeInteraction { elementId: string; onHandlePointerDown: (e: ReactPointerEvent, handle: ResizeHandle) => void }` (SelectionOverlay.tsx에서 export). 핸들은 **단일 선택 + 텍스트 편집 중 아님**일 때만 렌더된다. 핸들 DOM: `.handle.handle-nw` … `.handle.handle-w` 8개

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/CanvasArea.test.tsx`에 추가:

```tsx
test('단일 선택이면 8개 리사이즈 핸들이 보인다', () => {
  const { container } = renderCanvas([EL_SHAPE])
  expect(container.querySelectorAll('.handle')).toHaveLength(8)
})

test('다중 선택이면 핸들이 없다', () => {
  const { container } = renderCanvas([EL_TEXT, EL_SHAPE])
  expect(container.querySelectorAll('.handle')).toHaveLength(0)
})

test('se 핸들 드래그로 크기를 조절한다', () => {
  const { dispatch, container } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(container.querySelector('.handle-se')!, { clientX: 100, clientY: 100 })
  fireEvent.pointerMove(window, { clientX: 130, clientY: 120 })
  fireEvent.pointerUp(window)
  expect(appliedDoc(dispatch)!.slides[0]!.elements[1]!).toMatchObject({
    frame: { left: 300, top: 300, width: 110, height: 100 },
  })
})

test('nw 핸들 드래그는 left/top을 함께 옮긴다', () => {
  const { dispatch, container } = renderCanvas([EL_SHAPE])
  fireEvent.pointerDown(container.querySelector('.handle-nw')!, { clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 10, clientY: 20 })
  fireEvent.pointerUp(window)
  expect(appliedDoc(dispatch)!.slides[0]!.elements[1]!).toMatchObject({
    frame: { left: 310, top: 320, width: 70, height: 60 },
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/canvas/CanvasArea.test.tsx`
Expected: 신규 4개 FAIL (`.handle` 없음)

- [ ] **Step 3: SelectionOverlay에 핸들 렌더 추가**

`editor/src/canvas/SelectionOverlay.tsx` 전체 교체:

```tsx
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Slide } from '../model/types.ts'
import { isKnownElement } from '../model/types.ts'
import type { Guide, ResizeHandle } from './geometry.ts'
import { RESIZE_HANDLES } from './geometry.ts'

const HANDLE_POS: Record<ResizeHandle, { left: string; top: string }> = {
  nw: { left: '0%', top: '0%' },
  n: { left: '50%', top: '0%' },
  ne: { left: '100%', top: '0%' },
  e: { left: '100%', top: '50%' },
  se: { left: '100%', top: '100%' },
  s: { left: '50%', top: '100%' },
  sw: { left: '0%', top: '100%' },
  w: { left: '0%', top: '50%' },
}

export interface ResizeInteraction {
  elementId: string
  onHandlePointerDown: (e: ReactPointerEvent, handle: ResizeHandle) => void
}

export function SelectionOverlay({
  slide,
  selectedIds,
  guides,
  resize,
}: {
  slide: Slide
  selectedIds: string[]
  guides: Guide[]
  resize?: ResizeInteraction
}) {
  const selected = slide.elements.filter(isKnownElement).filter((el) => selectedIds.includes(el.id))
  return (
    <div className="selection-overlay">
      {selected.map((el) => (
        <div
          key={el.id}
          className="selection-box"
          style={{ left: el.frame.left, top: el.frame.top, width: el.frame.width, height: el.frame.height }}
        >
          {resize?.elementId === el.id &&
            RESIZE_HANDLES.map((h) => (
              <div
                key={h}
                className={`handle handle-${h}`}
                style={HANDLE_POS[h]}
                onPointerDown={(e) => resize.onHandlePointerDown(e, h)}
              />
            ))}
        </div>
      ))}
      {guides.map((g, i) => (
        <div
          key={`${g.axis}-${g.position}-${i}`}
          className={g.axis === 'x' ? 'snap-guide snap-guide-x' : 'snap-guide snap-guide-y'}
          style={g.axis === 'x' ? { left: g.position } : { top: g.position }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: CanvasArea에 리사이즈 제스처 추가**

`editor/src/canvas/CanvasArea.tsx` 수정 — Task 5 코드 기준 변경분:

import에 `setElementFrame` 추가, geometry import에 `resizeFrame`·`ResizeHandle` 추가:

```tsx
import { moveElement, setElementFrame } from '../model/ops.ts'
import { buildSnapTargets, resizeFrame, snapMove } from './geometry.ts'
import type { Guide, ResizeHandle, SnapTargets } from './geometry.ts'
```

`MoveGesture` 아래에 추가하고 gesture state를 union으로:

```tsx
interface ResizeGesture {
  kind: 'resize'
  slideId: string
  id: string
  frame: Frame
  resized: boolean
}

type Gesture = MoveGesture | ResizeGesture
```

```tsx
  const [gesture, setGesture] = useState<Gesture | null>(null)
```

`previewDoc` useMemo를 다음으로 교체:

```tsx
  const previewDoc = useMemo(() => {
    if (!gesture) return doc
    if (gesture.kind === 'move') {
      if (!gesture.moved) return doc
      let d = doc
      for (const id of gesture.ids) d = moveElement(d, gesture.slideId, id, gesture.dx, gesture.dy)
      return d
    }
    if (!gesture.resized) return doc
    return setElementFrame(doc, gesture.slideId, gesture.id, gesture.frame)
  }, [doc, gesture])
```

`beginMove` 아래에 추가:

```tsx
  const beginResize = (e: ReactPointerEvent, handle: ResizeHandle) => {
    e.stopPropagation()
    e.preventDefault()
    const el = slide.elements.filter(isKnownElement).find((k) => k.id === selectedIds[0])
    if (!el) return
    const startX = e.clientX
    const startY = e.clientY
    const orig = el.frame
    const docAtStart = doc
    const g: ResizeGesture = { kind: 'resize', slideId: slide.id, id: el.id, frame: orig, resized: false }
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scaleRef.current
      const dy = (ev.clientY - startY) / scaleRef.current
      g.frame = resizeFrame(orig, handle, dx, dy)
      g.resized = true
      setGesture({ ...g })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (g.resized) dispatch({ type: 'APPLY_DOC', doc: setElementFrame(docAtStart, g.slideId, g.id, g.frame) })
      setGesture(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
```

렌더 직전에 단일 선택 계산을 추가하고 SelectionOverlay에 `resize`를 전달 (가이드는 move 제스처일 때만):

```tsx
  const singleSelected =
    selectedIds.length === 1 ? slide.elements.filter(isKnownElement).find((el) => el.id === selectedIds[0]) : undefined
```

```tsx
            <SelectionOverlay
              slide={previewSlide}
              selectedIds={selectedIds}
              guides={gesture?.kind === 'move' ? gesture.guides : []}
              resize={
                singleSelected && editingTextId !== singleSelected.id
                  ? { elementId: singleSelected.id, onHandlePointerDown: beginResize }
                  : undefined
              }
            />
```

- [ ] **Step 5: 핸들 CSS 추가**

`editor/src/app.css` 끝에 추가:

```css
.handle { position: absolute; width: 8px; height: 8px; background: #fff; border: 1.5px solid var(--wd-primary); border-radius: 1px; transform: translate(-50%, -50%); pointer-events: auto; }
.handle-nw, .handle-se { cursor: nwse-resize; }
.handle-ne, .handle-sw { cursor: nesw-resize; }
.handle-n, .handle-s { cursor: ns-resize; }
.handle-e, .handle-w { cursor: ew-resize; }
```

- [ ] **Step 6: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 7: 커밋**

```bash
git add editor/src
git commit -m "feat: 8방향 리사이즈 핸들"
```

---

### Task 7: 텍스트 인라인 편집 (더블클릭 → contentEditable → 커밋)

**Files:**
- Create: `editor/src/canvas/TextEditable.tsx`
- Modify: `editor/src/canvas/ElementView.tsx`
- Modify: `editor/src/canvas/SlideView.tsx`
- Modify: `editor/src/canvas/CanvasArea.tsx`
- Modify: `editor/src/app.css`
- Test: `editor/src/canvas/CanvasArea.test.tsx` (추가)

**Interfaces:**
- Consumes: `setTextHtml`(ops), `START_TEXT_EDIT`/`END_TEXT_EDIT`/`APPLY_DOC`(Task 2), Task 4의 interaction 구조
- Produces:
  - `TextEditable({ html, onCommit }: { html: string; onCommit: (html: string) => void })` — mount 시 1회만 innerHTML 주입(재렌더로 편집 내용이 리셋되지 않게), blur·Escape에 `onCommit(innerHTML)` 호출. DOM class `.text-editable`
  - `SlideInteraction`에 추가: `onElementDoubleClick: (id: string) => void`, `onTextCommit: (id: string, html: string) => void`
  - `ElementInteraction`에 추가: `onDoubleClick: () => void`, `onTextCommit: (html: string) => void`
- 커밋 규칙: 내용이 모델과 같으면 `APPLY_DOC` 없이 `END_TEXT_EDIT`만 (불필요한 history push 방지). Escape는 커밋 후 종료(PPT와 동일). blur는 다른 곳 클릭 시 자연 발생
- 편집 중 App 전역 단축키는 전부 비활성(Task 9) — contentEditable의 브라우저 기본 undo/복사/붙여넣기를 그대로 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/canvas/CanvasArea.test.tsx`에 추가:

```tsx
test('텍스트 요소 더블클릭은 편집 시작을 dispatch한다', () => {
  const { dispatch, getByText } = renderCanvas([EL_TEXT])
  fireEvent.doubleClick(getByText('제목'))
  expect(dispatch).toHaveBeenCalledWith({ type: 'START_TEXT_EDIT', id: EL_TEXT })
})

test('도형 더블클릭은 편집을 시작하지 않는다', () => {
  const { dispatch, container } = renderCanvas([EL_SHAPE])
  fireEvent.doubleClick(container.querySelector('.el-shape')!)
  expect(dispatch.mock.calls.map(([a]) => a).some((a) => a?.type === 'START_TEXT_EDIT')).toBe(false)
})

function renderEditing() {
  const dispatch = vi.fn()
  const utils = render(
    <CanvasArea doc={DOC} slideIndex={0} selectedIds={[EL_TEXT]} editingTextId={EL_TEXT} dispatch={dispatch} />,
  )
  const editable = utils.container.querySelector('.text-editable') as HTMLElement
  return { dispatch, editable, ...utils }
}

test('편집 중에는 contentEditable이 뜨고 blur에 변경을 커밋한다', () => {
  const { dispatch, editable } = renderEditing()
  expect(editable).toBeTruthy()
  expect(editable.innerHTML).toContain('제목')
  editable.innerHTML = '<p>고친 제목</p>'
  fireEvent.blur(editable)
  const doc = appliedDoc(dispatch)!
  const el = doc.slides[0]!.elements[0]!
  expect(el.type).toBe('text')
  if (el.type === 'text') expect(el.html).toBe('<p>고친 제목</p>')
  expect(dispatch).toHaveBeenCalledWith({ type: 'END_TEXT_EDIT' })
})

test('내용이 같으면 blur에 커밋 없이 편집만 끝낸다', () => {
  const { dispatch, editable } = renderEditing()
  fireEvent.blur(editable)
  expect(appliedDoc(dispatch)).toBeNull()
  expect(dispatch).toHaveBeenCalledWith({ type: 'END_TEXT_EDIT' })
})

test('Escape는 커밋하고 편집을 끝낸다', () => {
  const { dispatch, editable } = renderEditing()
  editable.innerHTML = '<p>ESC</p>'
  fireEvent.keyDown(editable, { key: 'Escape' })
  const el = appliedDoc(dispatch)!.slides[0]!.elements[0]!
  if (el.type === 'text') expect(el.html).toBe('<p>ESC</p>')
  expect(dispatch).toHaveBeenCalledWith({ type: 'END_TEXT_EDIT' })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/canvas/CanvasArea.test.tsx`
Expected: 신규 5개 FAIL

- [ ] **Step 3: TextEditable 생성**

`editor/src/canvas/TextEditable.tsx`:

```tsx
import { useEffect, useRef } from 'react'

/**
 * contentEditable 래퍼 — "모델이 진실" 원칙의 유일한 예외 구간.
 * innerHTML은 mount 시 1회만 주입하고(재렌더에도 편집 내용 유지),
 * blur·Escape 시 onCommit(innerHTML)으로 모델에 되돌린다.
 */
export function TextEditable({ html, onCommit }: { html: string; onCommit: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = html
    el.focus()
    try {
      const sel = window.getSelection?.()
      if (sel && document.createRange) {
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    } catch {
      // happy-dom 등 Range 미지원 환경에서는 캐럿 이동 생략 (편집 자체는 동작)
    }
    // mount 시 1회만 — html prop 변화에 반응하면 편집 중 내용이 날아간다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = () => {
    const el = ref.current
    if (el) onCommit(el.innerHTML)
  }

  return (
    <div
      ref={ref}
      className="text-editable"
      contentEditable
      suppressContentEditableWarning
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          commit()
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  )
}
```

- [ ] **Step 4: ElementView·SlideView에 편집 경로 추가**

`editor/src/canvas/ElementView.tsx`에서 인터페이스와 text 분기를 교체:

```tsx
export interface ElementInteraction {
  selected: boolean
  editing: boolean
  onPointerDown: (e: ReactPointerEvent) => void
  onDoubleClick: () => void
  onTextCommit: (html: string) => void
}
```

```tsx
    case 'text': {
      if (interaction?.editing) {
        return (
          <div className="el el-text editing" style={styleFromModel(element.frame, element.extraStyle)}>
            <TextEditable html={element.html} onCommit={interaction.onTextCommit} />
          </div>
        )
      }
      return (
        <div
          className="el el-text"
          style={styleFromModel(element.frame, element.extraStyle)}
          dangerouslySetInnerHTML={{ __html: element.html }}
          {...handlers}
        />
      )
    }
```

`handlers`도 더블클릭을 포함하도록 교체 (import에 `TextEditable` 추가):

```tsx
  const handlers = interaction
    ? { onPointerDown: interaction.onPointerDown, onDoubleClick: interaction.onDoubleClick }
    : {}
```

`editor/src/canvas/SlideView.tsx`의 `SlideInteraction`과 전달부를 교체:

```tsx
export interface SlideInteraction {
  selectedIds: string[]
  editingTextId: string | null
  onElementPointerDown: (e: ReactPointerEvent, id: string) => void
  onElementDoubleClick: (id: string) => void
  onTextCommit: (id: string, html: string) => void
}
```

```tsx
          interaction={
            interaction && el.type !== 'opaque'
              ? {
                  selected: interaction.selectedIds.includes(el.id),
                  editing: interaction.editingTextId === el.id,
                  onPointerDown: (e) => interaction.onElementPointerDown(e, el.id),
                  onDoubleClick: () => interaction.onElementDoubleClick(el.id),
                  onTextCommit: (html) => interaction.onTextCommit(el.id, html),
                }
              : undefined
          }
```

- [ ] **Step 5: CanvasArea에 편집 핸들러 배선**

`editor/src/canvas/CanvasArea.tsx` — import에 `setTextHtml` 추가:

```tsx
import { moveElement, setElementFrame, setTextHtml } from '../model/ops.ts'
```

`onElementPointerDown` 아래에 추가:

```tsx
  const onElementDoubleClick = (id: string) => {
    const el = slide.elements.filter(isKnownElement).find((k) => k.id === id)
    if (el?.type === 'text') dispatch({ type: 'START_TEXT_EDIT', id })
  }

  const onTextCommit = (id: string, html: string) => {
    const el = slide.elements.filter(isKnownElement).find((k) => k.id === id)
    if (el?.type === 'text' && el.html !== html) {
      dispatch({ type: 'APPLY_DOC', doc: setTextHtml(doc, slide.id, id, html) })
    }
    dispatch({ type: 'END_TEXT_EDIT' })
  }
```

SlideView interaction prop을 교체:

```tsx
              interaction={{ selectedIds, editingTextId, onElementPointerDown, onElementDoubleClick, onTextCommit }}
```

main의 빈 영역 pointerdown은 편집 중이면 해제하지 않는다 (blur 커밋이 먼저 처리되도록 — PPT도 첫 클릭은 편집 종료만):

```tsx
    <main
      className="canvas-area"
      ref={ref}
      onPointerDown={() => {
        if (!editingTextId) dispatch({ type: 'CLEAR_SELECTION' })
      }}
    >
```

- [ ] **Step 6: CSS 추가**

`editor/src/app.css` 끝에 추가:

```css
.el-text.editing { outline: 2px dashed var(--wd-primary); cursor: text; }
.text-editable { width: 100%; height: 100%; outline: none; user-select: text; cursor: text; }
.text-editable p { margin: 0; }
```

- [ ] **Step 7: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 8: 커밋**

```bash
git add editor/src
git commit -m "feat: 더블클릭 텍스트 인라인 편집"
```

---

### Task 8: 툴바 — 삽입/텍스트 서식/개체 정렬/z순서/삭제/배경색

**Files:**
- Create: `editor/src/panels/format.ts`
- Create: `editor/src/panels/Toolbar.tsx`
- Modify: `editor/src/App.tsx`
- Modify: `editor/src/app.css`
- Test: `editor/src/panels/Toolbar.test.tsx` (신규)

**Interfaces:**
- Consumes: ops 전반(`addElement`/`removeElement`/`moveElementZ`/`setElementFrame`/`setSlideBg`/팩토리 3종), `alignFrame`/`AlignMode`(Task 3), `EditorState`/`EditorAction`(Task 2), `createIdGen`(model/id)
- Produces:
  - `Toolbar({ state, dispatch, idGen }: { state: EditorState; dispatch: Dispatch<EditorAction>; idGen: () => string })`
  - `format.ts`: `FONT_SIZES: number[]` = `[12, 16, 20, 28, 40, 56]`, `TEXT_COLORS: string[]`, `execFormat(cmd)`, `execColor(color)`, `execFontSize(px)`
  - App은 `useRef(createIdGen('n'))`으로 세션 id 생성기를 만들어 넘긴다 — 파서의 `wd-` 접두사와 충돌하지 않는 `n-` 접두사. **Task 9(붙여넣기)·Task 10(슬라이드 추가/복제)도 이 `idGenRef.current`를 사용한다**
- 텍스트 서식 스코프(v1 결정): **텍스트 편집 모드에서만 활성** — execCommand는 contentEditable 선택 영역에 작동하므로. 요소만 선택된 상태의 서식 버튼은 disabled. 서식 버튼·색상 스와치는 `onPointerDown={e => e.preventDefault()}`로 포커스를 뺏지 않는다(blur→커밋→편집 종료 사고 방지). **undo/redo/저장 등 비서식 버튼에는 preventDefault를 걸지 않는다** — 편집 중 클릭 시 blur 커밋이 먼저 일어나야 안전하다
- 글자 크기는 `document.execCommand('fontSize', false, '7')` 후 `<font size="7">`를 `<span style="font-size:Npx">`로 즉시 치환하는 표준 우회를 쓴다. 글자 색은 스와치 버튼(TEXT_COLORS) — `<input type="color">`는 포커스를 뺏어 편집이 끝나버리므로 쓰지 않는다

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/Toolbar.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import type { DeckDoc } from '../model/types.ts'
import { editorReducer, initialEditorState } from '../state/store.ts'
import type { EditorState } from '../state/store.ts'
import { Toolbar } from './Toolbar.tsx'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide" data-bg="#ffffff">
<div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>제목</p></div>
<div class="el el-shape" data-shape="rect" style="left:300px; top:300px; width:80px; height:80px;"></div>
</section>
</main></body></html>`)

const EL_TEXT = DOC.slides[0]!.elements[0]!.id
const EL_SHAPE = DOC.slides[0]!.elements[1]!.id

let seq = 0
const idGen = () => `n-${++seq}`

function makeState(over: Partial<EditorState> = {}): EditorState {
  const opened = editorReducer(initialEditorState, {
    type: 'OPEN_SUCCESS',
    doc: DOC,
    fileName: 't.html',
    fileHandle: null,
  })
  return { ...opened, ...over }
}

function renderToolbar(over: Partial<EditorState> = {}) {
  const dispatch = vi.fn()
  const utils = render(<Toolbar state={makeState(over)} dispatch={dispatch} idGen={idGen} />)
  return { dispatch, ...utils }
}

function appliedDoc(dispatch: ReturnType<typeof vi.fn>): DeckDoc | null {
  const action = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  return action ? (action.doc as DeckDoc) : null
}

beforeEach(() => {
  ;(document as unknown as { execCommand: unknown }).execCommand = vi.fn()
})

test('텍스트 상자 삽입은 새 요소를 추가하고 선택한다', () => {
  const { dispatch, getByRole } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '텍스트 상자' }))
  const call = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  expect(call).toBeTruthy()
  const els = (call.doc as DeckDoc).slides[0]!.elements
  expect(els).toHaveLength(3)
  const added = els[2]!
  expect(added.type).toBe('text')
  expect(call.select).toEqual([added.id])
})

test('도형 삽입은 사각형을 추가한다', () => {
  const { dispatch, getByRole } = renderToolbar()
  fireEvent.click(getByRole('button', { name: '도형' }))
  const els = appliedDoc(dispatch)!.slides[0]!.elements
  expect(els[2]!.type).toBe('shape')
})

test('편집 중이 아니면 서식 버튼은 disabled다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_TEXT] })
  expect((getByRole('button', { name: '굵게' }) as HTMLButtonElement).disabled).toBe(true)
})

test('편집 중 굵게 클릭은 execCommand를 호출한다', () => {
  const { getByRole } = renderToolbar({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.click(getByRole('button', { name: '굵게' }))
  expect(document.execCommand).toHaveBeenCalledWith('bold')
})

test('가로 가운데 정렬은 선택 요소의 left를 옮긴다', () => {
  const { dispatch, getByRole } = renderToolbar({ selectedIds: [EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '가로 가운데' }))
  expect(appliedDoc(dispatch)!.slides[0]!.elements[1]!).toMatchObject({ frame: { left: 600 } })
})

test('앞으로 보내기는 DOM 순서를 바꾼다', () => {
  const { dispatch, getByRole } = renderToolbar({ selectedIds: [EL_TEXT] })
  fireEvent.click(getByRole('button', { name: '앞으로' }))
  const els = appliedDoc(dispatch)!.slides[0]!.elements
  expect(els[1]!.id).toBe(EL_TEXT)
})

test('맨 뒤에서 뒤로 보내기는 dispatch하지 않는다 (경계 no-op)', () => {
  const { dispatch, getByRole } = renderToolbar({ selectedIds: [EL_TEXT] })
  fireEvent.click(getByRole('button', { name: '뒤로' }))
  expect(appliedDoc(dispatch)).toBeNull()
})

test('삭제는 선택 요소를 지우고 선택을 비운다', () => {
  const { dispatch, getByRole } = renderToolbar({ selectedIds: [EL_TEXT, EL_SHAPE] })
  fireEvent.click(getByRole('button', { name: '삭제' }))
  const call = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  expect((call.doc as DeckDoc).slides[0]!.elements).toHaveLength(0)
  expect(call.select).toEqual([])
})

test('배경색 변경은 슬라이드 bg를 바꾼다', () => {
  const { dispatch, getByLabelText } = renderToolbar()
  fireEvent.change(getByLabelText('배경색'), { target: { value: '#ff0000' } })
  expect(appliedDoc(dispatch)!.slides[0]!.bg).toBe('#ff0000')
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/panels/Toolbar.test.tsx`
Expected: FAIL — Toolbar 모듈 없음

- [ ] **Step 3: format.ts 구현**

`editor/src/panels/format.ts`:

```ts
export const FONT_SIZES = [12, 16, 20, 28, 40, 56]

/** 글자색 스와치 — input[type=color]는 포커스를 뺏어 편집이 끝나므로 버튼 팔레트 사용 */
export const TEXT_COLORS = ['#1f2937', '#1a56db', '#dc2626', '#16a34a', '#d97706', '#ffffff']

type FormatCommand = 'bold' | 'italic' | 'underline' | 'justifyLeft' | 'justifyCenter' | 'justifyRight'

export function execFormat(command: FormatCommand): void {
  document.execCommand?.(command)
}

export function execColor(color: string): void {
  document.execCommand?.('styleWithCSS', false, 'true')
  document.execCommand?.('foreColor', false, color)
  document.execCommand?.('styleWithCSS', false, 'false')
}

/** execCommand('fontSize')는 <font size>만 만든다 — 즉시 px span으로 치환하는 표준 우회 */
export function execFontSize(px: number): void {
  document.execCommand?.('fontSize', false, '7')
  for (const font of Array.from(document.querySelectorAll('font[size="7"]'))) {
    const span = document.createElement('span')
    span.style.fontSize = `${px}px`
    while (font.firstChild) span.appendChild(font.firstChild)
    font.replaceWith(span)
  }
}
```

- [ ] **Step 4: Toolbar.tsx 구현**

`editor/src/panels/Toolbar.tsx`:

```tsx
import type { Dispatch, PointerEvent as ReactPointerEvent } from 'react'
import { alignFrame } from '../canvas/geometry.ts'
import type { AlignMode } from '../canvas/geometry.ts'
import {
  addElement,
  createImageElement,
  createShapeElement,
  createTextElement,
  moveElementZ,
  removeElement,
  setElementFrame,
  setSlideBg,
} from '../model/ops.ts'
import type { ZDirection } from '../model/ops.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction, EditorState } from '../state/store.ts'
import { FONT_SIZES, TEXT_COLORS, execColor, execFontSize, execFormat } from './format.ts'

const keepFocus = (e: ReactPointerEvent) => e.preventDefault()

function pickImage(onLoad: (dataUrl: string, fileName: string) => void): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onLoad(reader.result, file.name)
    }
    reader.readAsDataURL(file)
  }
  input.click()
}

export function Toolbar({
  state,
  dispatch,
  idGen,
}: {
  state: EditorState
  dispatch: Dispatch<EditorAction>
  idGen: () => string
}) {
  const { doc, currentSlideIndex, selectedIds, editingTextId } = state
  const slide = doc?.slides[currentSlideIndex] ?? null
  const hasDoc = doc !== null && slide !== null
  const hasSelection = hasDoc && selectedIds.length > 0
  const singleId = hasSelection && selectedIds.length === 1 ? selectedIds[0]! : null
  const editing = editingTextId !== null

  const insertText = () => {
    if (!doc || !slide) return
    const el = createTextElement(idGen, { left: 440, top: 310, width: 400, height: 60 }, '<p>텍스트를 입력하세요</p>')
    dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
  }

  const insertShape = () => {
    if (!doc || !slide) return
    const el = createShapeElement(idGen, { left: 540, top: 300, width: 200, height: 120 }, 'var(--wd-accent)')
    dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
  }

  const insertImage = () => {
    if (!doc || !slide) return
    pickImage((dataUrl, fileName) => {
      const base = createImageElement(idGen, { left: 400, top: 180, width: 480, height: 360 }, dataUrl, fileName)
      const el = { ...base, imgStyle: 'width:100%; height:100%; object-fit: contain;' }
      dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
    })
  }

  const alignSelected = (mode: AlignMode) => {
    if (!doc || !slide) return
    let d = doc
    for (const el of slide.elements.filter(isKnownElement)) {
      if (selectedIds.includes(el.id)) {
        d = setElementFrame(d, slide.id, el.id, alignFrame(el.frame, doc.slideWidth, doc.slideHeight, mode))
      }
    }
    dispatch({ type: 'APPLY_DOC', doc: d })
  }

  const zOrder = (dir: ZDirection) => {
    if (!doc || !slide || !singleId) return
    const d = moveElementZ(doc, slide.id, singleId, dir)
    if (d !== doc) dispatch({ type: 'APPLY_DOC', doc: d })
  }

  const removeSelected = () => {
    if (!doc || !slide) return
    let d = doc
    for (const id of selectedIds) d = removeElement(d, slide.id, id)
    dispatch({ type: 'APPLY_DOC', doc: d, select: [] })
  }

  const changeBg = (value: string) => {
    if (!doc || !slide) return
    dispatch({ type: 'APPLY_DOC', doc: setSlideBg(doc, slide.id, value) })
  }

  const bgValue = slide?.bg && /^#[0-9a-fA-F]{6}$/.test(slide.bg) ? slide.bg : '#ffffff'

  return (
    <div className="toolbar" role="toolbar" aria-label="편집 도구">
      <div className="group" aria-label="삽입">
        <button type="button" disabled={!hasDoc} onClick={insertText}>텍스트 상자</button>
        <button type="button" disabled={!hasDoc} onClick={insertShape}>도형</button>
        <button type="button" disabled={!hasDoc} onClick={insertImage}>이미지</button>
      </div>
      <div className="group" aria-label="텍스트 서식">
        <button type="button" aria-label="굵게" title="굵게" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('bold')}><b>가</b></button>
        <button type="button" aria-label="기울임" title="기울임" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('italic')}><i>가</i></button>
        <button type="button" aria-label="밑줄" title="밑줄" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('underline')}><u>가</u></button>
        {FONT_SIZES.map((px) => (
          <button key={px} type="button" aria-label={`글자 크기 ${px}`} title={`글자 크기 ${px}px`} disabled={!editing} onPointerDown={keepFocus} onClick={() => execFontSize(px)}>{px}</button>
        ))}
        {TEXT_COLORS.map((c) => (
          <button key={c} type="button" className="swatch" aria-label={`글자색 ${c}`} title={`글자색 ${c}`} style={{ background: c }} disabled={!editing} onPointerDown={keepFocus} onClick={() => execColor(c)} />
        ))}
        <button type="button" aria-label="왼쪽 정렬" title="왼쪽 정렬" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('justifyLeft')}>⇤</button>
        <button type="button" aria-label="가운데 정렬" title="가운데 정렬" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('justifyCenter')}>⇔</button>
        <button type="button" aria-label="오른쪽 정렬" title="오른쪽 정렬" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('justifyRight')}>⇥</button>
      </div>
      <div className="group" aria-label="개체 정렬">
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('left')}>왼쪽</button>
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('center-h')}>가로 가운데</button>
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('right')}>오른쪽</button>
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('top')}>위</button>
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('middle')}>세로 가운데</button>
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('bottom')}>아래</button>
      </div>
      <div className="group" aria-label="순서">
        <button type="button" disabled={!singleId} onClick={() => zOrder('front')}>맨 앞</button>
        <button type="button" disabled={!singleId} onClick={() => zOrder('forward')}>앞으로</button>
        <button type="button" disabled={!singleId} onClick={() => zOrder('backward')}>뒤로</button>
        <button type="button" disabled={!singleId} onClick={() => zOrder('back')}>맨 뒤</button>
      </div>
      <div className="group" aria-label="요소">
        <button type="button" disabled={!hasSelection} onClick={removeSelected}>삭제</button>
      </div>
      <div className="group" aria-label="슬라이드">
        <label className="bg-label">
          배경
          <input type="color" aria-label="배경색" disabled={!hasDoc} value={bgValue} onChange={(e) => changeBg(e.target.value)} />
        </label>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: App 배선 + CSS**

`editor/src/App.tsx` — import에 추가:

```tsx
import { useReducer, useRef } from 'react'
import { createIdGen } from './model/id.ts'
import { Toolbar } from './panels/Toolbar.tsx'
```

컴포넌트 안에 (`useReducer` 아래):

```tsx
  const idGenRef = useRef(createIdGen('n'))
```

`<header className="topbar">…</header>` 바로 아래에:

```tsx
      <Toolbar state={state} dispatch={dispatch} idGen={idGenRef.current} />
```

`editor/src/app.css` — `.app` 규칙을 교체하고 툴바 스타일 추가:

```css
.app { display: grid; grid-template-rows: 48px 44px 1fr; grid-template-columns: 208px 1fr; height: 100vh; }
```

```css
.toolbar { grid-column: 1 / 3; display: flex; align-items: center; gap: 4px; padding: 0 12px; background: #fff; border-bottom: 1px solid #e5e7eb; overflow-x: auto; }
.toolbar .group { display: flex; align-items: center; gap: 2px; padding-right: 10px; margin-right: 10px; border-right: 1px solid #e5e7eb; white-space: nowrap; }
.toolbar button { font: inherit; font-size: 13px; padding: 4px 8px; border: 1px solid transparent; border-radius: 4px; background: none; cursor: pointer; }
.toolbar button:hover:not(:disabled) { background: #f3f4f6; }
.toolbar button:disabled { color: #9ca3af; cursor: default; }
.toolbar .swatch { width: 18px; height: 18px; padding: 0; border: 1px solid #d1d5db; border-radius: 3px; }
.bg-label { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #374151; }
```

- [ ] **Step 6: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS (App.test.tsx의 기존 4개 포함 — 툴바는 문서 없을 때 버튼만 disabled로 추가 렌더)

- [ ] **Step 7: 커밋**

```bash
git add editor/src
git commit -m "feat: 툴바 — 삽입·텍스트 서식·개체 정렬·z순서·삭제·배경색"
```

---

### Task 9: 전역 단축키 + 클립보드

**Files:**
- Create: `editor/src/hooks/useShortcuts.ts`
- Modify: `editor/src/App.tsx` (훅 연결 + undo/redo 버튼)
- Test: `editor/src/hooks/useShortcuts.test.tsx` (신규)

**Interfaces:**
- Consumes: `EditorState`/`EditorAction`/클립보드 액션(Task 2), `moveElement`/`removeElement`/`addElement`(ops), App의 `idGenRef`(Task 8)
- Produces: `useShortcuts(state: EditorState, dispatch: Dispatch<EditorAction>, idGen: () => string): void` — window keydown 리스너. **Ctrl+S는 이 태스크에 없다** — Task 11(저장)이 `onSave` 매개변수를 추가하며 확장한다
- 키 매핑(PPT 동일): Ctrl/Cmd+Z 실행취소, Ctrl+Shift+Z·Ctrl+Y 재실행, Ctrl+C 복사, Ctrl+V 붙여넣기(+16px 오프셋, 새 id), Ctrl+D 복제, Delete/Backspace 삭제, 방향키 1px 이동(Shift+방향키 10px), Escape 선택 해제
- 무시 조건: 텍스트 편집 중(`editingTextId !== null` — contentEditable 기본 동작 사용), 포커스가 INPUT/SELECT/TEXTAREA일 때

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/hooks/useShortcuts.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import type { Dispatch } from 'react'
import { expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import type { DeckDoc, KnownElement } from '../model/types.ts'
import { editorReducer, initialEditorState } from '../state/store.ts'
import type { EditorAction, EditorState } from '../state/store.ts'
import { useShortcuts } from './useShortcuts.ts'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>제목</p></div></section>
</main></body></html>`)

const EL_TEXT = DOC.slides[0]!.elements[0]!.id

let seq = 0
const idGen = () => `n-${++seq}`

function makeState(over: Partial<EditorState> = {}): EditorState {
  const opened = editorReducer(initialEditorState, {
    type: 'OPEN_SUCCESS',
    doc: DOC,
    fileName: 't.html',
    fileHandle: null,
  })
  return { ...opened, ...over }
}

function Harness({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  useShortcuts(state, dispatch, idGen)
  return <input aria-label="더미 입력" />
}

function setup(over: Partial<EditorState> = {}) {
  const dispatch = vi.fn()
  const utils = render(<Harness state={makeState(over)} dispatch={dispatch} />)
  return { dispatch, ...utils }
}

function appliedDoc(dispatch: ReturnType<typeof vi.fn>): DeckDoc | null {
  const action = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  return action ? (action.doc as DeckDoc) : null
}

test('Ctrl+Z는 UNDO, Ctrl+Shift+Z와 Ctrl+Y는 REDO', () => {
  const { dispatch } = setup()
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(dispatch).toHaveBeenCalledWith({ type: 'UNDO' })
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
  fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'REDO')).toHaveLength(2)
})

test('Delete는 선택 요소를 삭제한다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(window, { key: 'Delete' })
  expect(appliedDoc(dispatch)!.slides[0]!.elements).toHaveLength(0)
})

test('방향키는 1px, Shift+방향키는 10px 이동한다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(window, { key: 'ArrowRight' })
  expect(appliedDoc(dispatch)!.slides[0]!.elements[0]!).toMatchObject({ frame: { left: 1 } })
  dispatch.mockClear()
  fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true })
  expect(appliedDoc(dispatch)!.slides[0]!.elements[0]!).toMatchObject({ frame: { top: 10 } })
})

test('Ctrl+C는 선택 요소를 클립보드에 담는다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
  const call = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'SET_CLIPBOARD')
  expect(call.elements).toHaveLength(1)
  expect(call.elements[0].id).toBe(EL_TEXT)
})

test('Ctrl+V는 오프셋과 새 id로 붙여넣고 선택한다', () => {
  const el = DOC.slides[0]!.elements[0]! as KnownElement
  const { dispatch } = setup({ clipboard: [structuredClone(el)] })
  fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
  const call = dispatch.mock.calls.map(([a]) => a).find((a) => a?.type === 'APPLY_DOC')
  const els = (call.doc as DeckDoc).slides[0]!.elements
  expect(els).toHaveLength(2)
  expect(els[1]!).toMatchObject({ frame: { left: 16, top: 16 } })
  expect(els[1]!.id).not.toBe(EL_TEXT)
  expect(call.select).toEqual([els[1]!.id])
})

test('Ctrl+D는 선택 요소를 복제한다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
  expect(appliedDoc(dispatch)!.slides[0]!.elements).toHaveLength(2)
})

test('텍스트 편집 중에는 아무것도 dispatch하지 않는다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT], editingTextId: EL_TEXT })
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  fireEvent.keyDown(window, { key: 'Delete' })
  expect(dispatch).not.toHaveBeenCalled()
})

test('INPUT에 포커스가 있으면 무시한다', () => {
  const { dispatch, getByLabelText } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(getByLabelText('더미 입력'), { key: 'Delete' })
  expect(dispatch).not.toHaveBeenCalled()
})

test('Escape는 선택을 해제한다', () => {
  const { dispatch } = setup({ selectedIds: [EL_TEXT] })
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_SELECTION' })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/hooks/useShortcuts.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: useShortcuts 구현**

`editor/src/hooks/useShortcuts.ts`:

```ts
import { useEffect } from 'react'
import type { Dispatch } from 'react'
import { addElement, moveElement, removeElement } from '../model/ops.ts'
import { isKnownElement } from '../model/types.ts'
import type { KnownElement } from '../model/types.ts'
import type { EditorAction, EditorState } from '../state/store.ts'

const PASTE_OFFSET = 16

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export function useShortcuts(state: EditorState, dispatch: Dispatch<EditorAction>, idGen: () => string): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const { doc, currentSlideIndex, selectedIds, editingTextId, clipboard } = state
      // 텍스트 편집 중엔 contentEditable의 기본 동작(브라우저 undo/복사 등)에 맡긴다
      if (editingTextId !== null) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      const meta = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (meta && key === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' })
        return
      }
      if (meta && key === 'y') {
        e.preventDefault()
        dispatch({ type: 'REDO' })
        return
      }
      if (!doc) return
      const slide = doc.slides[currentSlideIndex]
      if (!slide) return
      const selected = slide.elements.filter(isKnownElement).filter((el) => selectedIds.includes(el.id))

      const paste = (source: KnownElement[]) => {
        let d = doc
        const newIds: string[] = []
        for (const el of source) {
          const copy = structuredClone(el)
          copy.id = idGen()
          copy.frame = { ...copy.frame, left: copy.frame.left + PASTE_OFFSET, top: copy.frame.top + PASTE_OFFSET }
          newIds.push(copy.id)
          d = addElement(d, slide.id, copy)
        }
        dispatch({ type: 'APPLY_DOC', doc: d, select: newIds })
      }

      if (meta && key === 'c' && selected.length > 0) {
        e.preventDefault()
        dispatch({ type: 'SET_CLIPBOARD', elements: selected.map((el) => structuredClone(el)) })
        return
      }
      if (meta && key === 'v' && clipboard.length > 0) {
        e.preventDefault()
        paste(clipboard)
        return
      }
      if (meta && key === 'd' && selected.length > 0) {
        e.preventDefault()
        paste(selected)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length > 0) {
        e.preventDefault()
        let d = doc
        for (const el of selected) d = removeElement(d, slide.id, el.id)
        dispatch({ type: 'APPLY_DOC', doc: d, select: [] })
        return
      }
      const arrow = ARROWS[e.key]
      if (arrow && selected.length > 0) {
        e.preventDefault()
        const [ax, ay] = arrow
        const step = e.shiftKey ? 10 : 1
        let d = doc
        for (const el of selected) d = moveElement(d, slide.id, el.id, ax * step, ay * step)
        dispatch({ type: 'APPLY_DOC', doc: d })
        return
      }
      if (e.key === 'Escape' && (selectedIds.length > 0 || editingTextId !== null)) {
        dispatch({ type: 'CLEAR_SELECTION' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state, dispatch, idGen])
}
```

- [ ] **Step 4: App에 훅 연결 + undo/redo 버튼**

`editor/src/App.tsx` — import 추가:

```tsx
import { canRedo, canUndo } from './model/history.ts'
import { useShortcuts } from './hooks/useShortcuts.ts'
```

컴포넌트 안 (`idGenRef` 아래):

```tsx
  useShortcuts(state, dispatch, idGenRef.current)
```

topbar의 열기 버튼 옆에 추가:

```tsx
        <button type="button" disabled={!state.history || !canUndo(state.history)} onClick={() => dispatch({ type: 'UNDO' })}>실행 취소</button>
        <button type="button" disabled={!state.history || !canRedo(state.history)} onClick={() => dispatch({ type: 'REDO' })}>다시 실행</button>
```

- [ ] **Step 5: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git add editor/src
git commit -m "feat: PPT식 전역 단축키와 클립보드(복사·붙여넣기·복제)"
```

---

### Task 10: 슬라이드 패널 편집 — 추가/복제/삭제/드래그 순서

**Files:**
- Modify: `editor/src/panels/SlidePanel.tsx`
- Modify: `editor/src/App.tsx`
- Modify: `editor/src/app.css`
- Test: `editor/src/panels/SlidePanel.test.tsx` (수정·추가)

**Interfaces:**
- Consumes: `addSlide`/`duplicateSlide`/`removeSlide`/`moveSlide`(ops), App의 `idGenRef`
- Produces: SlidePanel의 새 props — `onAdd: () => void`, `onDuplicate: () => void`, `onRemove: () => void`, `canRemove: boolean`, `onReorder: (from: number, to: number) => void`. 패널은 dumb 컴포넌트로 유지(ops 호출은 App). 드래그 순서 변경은 HTML5 DnD로 하되 **드래그 인덱스는 React state로 추적**한다(happy-dom에 DataTransfer가 없어도 동작·테스트 가능)
- App의 동작: 추가 → 현재 다음 위치에 새 슬라이드 + 그 슬라이드 선택, 복제 → 다음 위치에 복제 + 선택, 삭제 → 마지막 남은 슬라이드면 버튼 disabled(`canRemove`), 순서 변경 → `moveSlide` 후 대상 인덱스 선택

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/panels/SlidePanel.test.tsx` — 기존 render 호출에 새 props를 넣도록 헬퍼를 도입하고 테스트 추가:

```tsx
import type { ComponentProps } from 'react'

function renderPanel(doc: DeckDoc, over: Partial<ComponentProps<typeof SlidePanel>> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
  }
  const utils = render(
    <SlidePanel doc={doc} currentIndex={0} canRemove={doc.slides.length > 1} {...handlers} {...over} />,
  )
  return { ...handlers, ...utils }
}
```

(기존 테스트들도 이 헬퍼를 쓰도록 고친다 — 동작 기대값은 그대로.)

```tsx
test('추가·복제·삭제 버튼이 핸들러를 호출한다', () => {
  const { onAdd, onDuplicate, onRemove, getByRole } = renderPanel(DOC)
  fireEvent.click(getByRole('button', { name: '새 슬라이드' }))
  fireEvent.click(getByRole('button', { name: '슬라이드 복제' }))
  fireEvent.click(getByRole('button', { name: '슬라이드 삭제' }))
  expect(onAdd).toHaveBeenCalled()
  expect(onDuplicate).toHaveBeenCalled()
  expect(onRemove).toHaveBeenCalled()
})

test('슬라이드가 1장이면 삭제 버튼이 disabled다', () => {
  const { getByRole } = renderPanel(ONE_SLIDE_DOC)
  expect((getByRole('button', { name: '슬라이드 삭제' }) as HTMLButtonElement).disabled).toBe(true)
})

test('썸네일 드래그로 순서 변경을 요청한다', () => {
  const { onReorder, getAllByRole } = renderPanel(DOC)
  const thumbs = getAllByRole('button', { name: /^슬라이드 \d/ })
  fireEvent.dragStart(thumbs[0]!)
  fireEvent.dragOver(thumbs[1]!)
  fireEvent.drop(thumbs[1]!)
  expect(onReorder).toHaveBeenCalledWith(0, 1)
})
```

`DOC`은 2장짜리, `ONE_SLIDE_DOC`은 1장짜리 fixture(기존 파일의 fixture를 재사용하거나 parseWebdeck으로 인라인 생성). `fireEvent` import를 추가한다.

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/panels/SlidePanel.test.tsx`
Expected: FAIL — 새 props/버튼 없음

- [ ] **Step 3: SlidePanel 구현**

`editor/src/panels/SlidePanel.tsx` 전체 교체:

```tsx
import { useState } from 'react'
import { extractThemeVars } from '../canvas/styleFromModel.ts'
import { SlideView } from '../canvas/SlideView.tsx'
import type { DeckDoc } from '../model/types.ts'

const THUMB_WIDTH = 168

export function SlidePanel({
  doc,
  currentIndex,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  canRemove,
  onReorder,
}: {
  doc: DeckDoc
  currentIndex: number
  onSelect: (index: number) => void
  onAdd: () => void
  onDuplicate: () => void
  onRemove: () => void
  canRemove: boolean
  onReorder: (from: number, to: number) => void
}) {
  const themeVars = extractThemeVars(doc.headExtra)
  const scale = THUMB_WIDTH / doc.slideWidth
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  return (
    <nav aria-label="슬라이드 목록">
      <div className="slide-actions">
        <button type="button" onClick={onAdd}>새 슬라이드</button>
        <button type="button" onClick={onDuplicate}>슬라이드 복제</button>
        <button type="button" disabled={!canRemove} onClick={onRemove}>슬라이드 삭제</button>
      </div>
      {doc.slides.map((slide, i) => (
        <button
          key={slide.id}
          type="button"
          className={i === currentIndex ? 'thumb selected' : 'thumb'}
          aria-label={`슬라이드 ${i + 1}`}
          aria-current={i === currentIndex}
          onClick={() => onSelect(i)}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i)
            setDragIndex(null)
          }}
          onDragEnd={() => setDragIndex(null)}
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

- [ ] **Step 4: App 배선 + CSS**

`editor/src/App.tsx` — import에 ops 추가:

```tsx
import { addSlide, duplicateSlide, moveSlide, removeSlide } from './model/ops.ts'
```

SlidePanel 렌더를 교체:

```tsx
          <SlidePanel
            doc={state.doc}
            currentIndex={state.currentSlideIndex}
            onSelect={(index) => dispatch({ type: 'SELECT_SLIDE', index })}
            canRemove={state.doc.slides.length > 1}
            onAdd={() => {
              dispatch({ type: 'APPLY_DOC', doc: addSlide(state.doc!, idGenRef.current, state.currentSlideIndex + 1) })
              dispatch({ type: 'SELECT_SLIDE', index: state.currentSlideIndex + 1 })
            }}
            onDuplicate={() => {
              const slide = state.doc!.slides[state.currentSlideIndex]
              if (!slide) return
              dispatch({ type: 'APPLY_DOC', doc: duplicateSlide(state.doc!, slide.id, idGenRef.current) })
              dispatch({ type: 'SELECT_SLIDE', index: state.currentSlideIndex + 1 })
            }}
            onRemove={() => {
              const slide = state.doc!.slides[state.currentSlideIndex]
              if (!slide || state.doc!.slides.length <= 1) return
              dispatch({ type: 'APPLY_DOC', doc: removeSlide(state.doc!, slide.id) })
            }}
            onReorder={(from, to) => {
              dispatch({ type: 'APPLY_DOC', doc: moveSlide(state.doc!, from, to) })
              dispatch({ type: 'SELECT_SLIDE', index: to })
            }}
          />
```

(같은 이벤트 핸들러 안의 연속 dispatch는 React가 순서대로 리듀스한다 — `APPLY_DOC` 후의 `SELECT_SLIDE`는 새 doc 기준으로 클램프된다. 삭제 후 인덱스는 `APPLY_DOC`의 `withDoc` 클램프가 처리한다.)

`editor/src/app.css` 끝에 추가:

```css
.slide-actions { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
.slide-actions button { font: inherit; font-size: 12px; padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; cursor: pointer; }
.slide-actions button:disabled { color: #9ca3af; cursor: default; }
```

- [ ] **Step 5: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS (App.test.tsx의 `getAllByRole('button', { name: /^슬라이드 / })` 카운트가 새 버튼과 겹치지 않는지 확인 — 새 버튼 이름은 "새 슬라이드"/"슬라이드 복제"/"슬라이드 삭제"라 `/^슬라이드 \d/`와만 구분되면 된다. 기존 App 테스트가 `/^슬라이드 /` 패턴이면 `/^슬라이드 \d/`로 좁혀서 고친다)

- [ ] **Step 6: 커밋**

```bash
git add editor/src
git commit -m "feat: 슬라이드 추가·복제·삭제와 드래그 순서 변경"
```

---

### Task 11: 저장 — 왕복 검증 안전망 + FSA 저장 + 다운로드 폴백 + dirty 표시

**Files:**
- Create: `editor/src/model/roundtrip.ts`
- Modify: `editor/src/file/fileAccess.ts`
- Modify: `editor/src/hooks/useShortcuts.ts` (Ctrl+S 추가)
- Modify: `editor/src/App.tsx`
- Modify: `editor/src/app.css`
- Test: `editor/src/model/roundtrip.test.ts` (신규), `editor/src/App.test.tsx` (추가), `editor/src/hooks/useShortcuts.test.tsx` (추가)

**Interfaces:**
- Consumes: `serializeWebdeck`/`parseWebdeck`, `MARK_SAVED`/`SAVE_ERROR`/`isDirty`(Task 2), `useShortcuts`(Task 9)
- Produces:
  - `checkRoundTrip(doc: DeckDoc): string | null` — 저장 전 최후 안전망 (스펙 §8, 백로그 항목). serialize→parse 후 모델 동등성(id 제외, 텍스트 html은 trim 정규화) 비교. 문제 없으면 null, 있으면 한국어 사유
  - 백로그는 `validateWebdeck(serialized)`를 안전망으로 제안했지만 그 검증기는 node-html-parser 의존이라 "런타임 의존성 react/react-dom 둘뿐" 제약을 깬다. 브라우저 내장 DOMParser 기반의 왕복 동등성 검사가 같은 목적(문서 파괴 차단)을 의존성 없이, 더 강하게(구조+내용 동등성) 달성한다 — 외부 검증은 기존 CLI(`tools/validate-webdeck.mjs`)가 계속 담당
  - `saveToHandle(handle: FileSystemFileHandle, html: string): Promise<boolean>` — createWritable 미지원이면 false
  - `downloadHtml(fileName: string, html: string): void`
  - `useShortcuts(state, dispatch, idGen, onSave?: () => void)` — Ctrl/Cmd+S에 `onSave` 호출 (편집 중·INPUT 포커스 시 제외는 기존 가드 그대로)
- 저장 흐름: 검증 실패 → `저장 중단: …` 오류로 차단(다운로드도 차단 — 손상 파일 배포 방지). FSA 핸들 있음 → createWritable로 쓰기, 실패 시 오류 + [다운로드로 저장] 폴백 제안(스펙 §8). 핸들 없음(input 폴백으로 연 파일) → 곧장 다운로드 저장. 성공 시 `MARK_SAVED`
- dirty 표시: 파일명 옆 `●` + 저장되지 않은 변경이 있으면 `beforeunload` 경고

- [ ] **Step 1: 실패하는 roundtrip 테스트 작성**

`editor/src/model/roundtrip.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { setTextHtml } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>제목</p></div>
<div class="el el-shape" data-shape="rect" style="left:300px; top:300px; width:80px; height:80px;"></div>
</section>
</main></body></html>`)

const SLIDE = DOC.slides[0]!.id
const EL = DOC.slides[0]!.elements[0]!.id

describe('checkRoundTrip', () => {
  test('정상 문서는 null을 반환한다', () => {
    expect(checkRoundTrip(DOC)).toBeNull()
  })

  test('일반적인 텍스트 편집 후에도 null이다', () => {
    const d = setTextHtml(DOC, SLIDE, EL, '<p>수정 <strong>강조</strong> <span style="color: #dc2626;">색</span></p>')
    expect(checkRoundTrip(d)).toBeNull()
  })

  test('앞뒤 공백만 있는 텍스트는 통과한다 (trim 정규화)', () => {
    const d = setTextHtml(DOC, SLIDE, EL, '  <p>공백</p>  ')
    expect(checkRoundTrip(d)).toBeNull()
  })

  test('요소를 삼키는 마크업은 차단한다', () => {
    const d = setTextHtml(DOC, SLIDE, EL, '</div><div class="pwn">x')
    const msg = checkRoundTrip(d)
    expect(msg).toBeTruthy()
  })

  test('비균형 마크업은 차단한다', () => {
    const d = setTextHtml(DOC, SLIDE, EL, '<p>a<div>b</div>')
    expect(checkRoundTrip(d)).toBeTruthy()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/model/roundtrip.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: roundtrip.ts 구현**

`editor/src/model/roundtrip.ts`:

```ts
import { parseWebdeck } from './parse.ts'
import { serializeWebdeck } from './serialize.ts'
import type { DeckDoc } from './types.ts'

/** id는 세션 내부 값이므로 비교에서 제외. 텍스트 html은 trim 정규화(파서가 trim하므로) */
function normalize(doc: DeckDoc): DeckDoc {
  return {
    ...doc,
    slides: doc.slides.map((s) => ({
      ...s,
      id: '',
      elements: s.elements.map((el) =>
        el.type === 'text' ? { ...el, id: '', html: el.html.trim() } : { ...el, id: '' },
      ),
    })),
  }
}

/**
 * 저장 전 최후 안전망 (스펙 §8): 직렬화 결과를 다시 파싱해 모델과 동등한지 검사.
 * 통과하면 null, 실패하면 사용자에게 보여줄 한국어 사유를 반환한다.
 */
export function checkRoundTrip(doc: DeckDoc): string | null {
  let html: string
  try {
    html = serializeWebdeck(doc)
  } catch (e) {
    return `직렬화에 실패했습니다: ${e instanceof Error ? e.message : String(e)}`
  }
  let reparsed: DeckDoc
  try {
    reparsed = parseWebdeck(html)
  } catch (e) {
    return `저장 결과를 다시 읽을 수 없습니다: ${e instanceof Error ? e.message : String(e)}`
  }
  if (doc.slides.length !== reparsed.slides.length) {
    return `저장하면 슬라이드 수가 달라집니다 (${doc.slides.length} → ${reparsed.slides.length}) — 최근 편집을 취소(Ctrl+Z)하고 다시 시도하세요`
  }
  for (let i = 0; i < doc.slides.length; i++) {
    const before = doc.slides[i]!.elements.length
    const after = reparsed.slides[i]!.elements.length
    if (before !== after) {
      return `저장하면 슬라이드 ${i + 1}의 요소 수가 달라집니다 (${before} → ${after}) — 최근 편집을 취소(Ctrl+Z)하고 다시 시도하세요`
    }
  }
  if (JSON.stringify(normalize(doc)) !== JSON.stringify(normalize(reparsed))) {
    return '저장하면 문서 내용이 달라집니다 — 최근 편집을 취소(Ctrl+Z)하고 다시 시도하세요'
  }
  return null
}
```

Run: `cd editor && npx vitest run src/model/roundtrip.test.ts`
Expected: PASS

- [ ] **Step 4: fileAccess에 저장 함수 추가**

`editor/src/file/fileAccess.ts` 끝에 추가:

```ts
interface WritableHandle {
  createWritable?: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
}

/** FSA 핸들에 저장. createWritable 미지원(폴백으로 연 파일 등)이면 false */
export async function saveToHandle(handle: FileSystemFileHandle, html: string): Promise<boolean> {
  const w = handle as unknown as WritableHandle
  if (typeof w.createWritable !== 'function') return false
  const stream = await w.createWritable()
  await stream.write(html)
  await stream.close()
  return true
}

export function downloadHtml(fileName: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 5: useShortcuts에 Ctrl+S 추가 (테스트 먼저)**

`editor/src/hooks/useShortcuts.test.tsx` — Harness와 setup에 `onSave` spy를 추가:

```tsx
function Harness({ state, dispatch, onSave }: { state: EditorState; dispatch: Dispatch<EditorAction>; onSave?: () => void }) {
  useShortcuts(state, dispatch, idGen, onSave)
  return <input aria-label="더미 입력" />
}
```

(setup도 `onSave: vi.fn()`을 만들어 Harness에 넘기고 반환값에 포함하도록 수정.)

```tsx
test('Ctrl+S는 onSave를 호출하고 기본 동작을 막는다', () => {
  const { onSave } = setup()
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  expect(onSave).toHaveBeenCalledTimes(1)
})

test('텍스트 편집 중 Ctrl+S는 무시한다', () => {
  const { onSave } = setup({ editingTextId: EL_TEXT })
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  expect(onSave).not.toHaveBeenCalled()
})
```

`editor/src/hooks/useShortcuts.ts` — 시그니처와 undo/redo 처리 아래에 추가:

```ts
export function useShortcuts(
  state: EditorState,
  dispatch: Dispatch<EditorAction>,
  idGen: () => string,
  onSave?: () => void,
): void {
```

```ts
      if (meta && key === 's') {
        e.preventDefault()
        onSave?.()
        return
      }
```

(deps 배열에 `onSave` 추가.)

- [ ] **Step 6: 실패하는 App 저장 테스트 작성**

`editor/src/App.test.tsx`에 추가 (`vi` import는 이미 있음):

```tsx
function stubPickerWithWritable(name: string, text: string) {
  const written: string[] = []
  const handle = {
    getFile: () => Promise.resolve({ name, text: () => Promise.resolve(text) }),
    createWritable: () =>
      Promise.resolve({
        write: (d: string) => {
          written.push(d)
          return Promise.resolve()
        },
        close: () => Promise.resolve(),
      }),
  }
  ;(window as unknown as { showOpenFilePicker?: () => Promise<unknown[]> }).showOpenFilePicker = () =>
    Promise.resolve([handle])
  return written
}

test('저장은 검증 통과 후 FSA 핸들에 쓴다', async () => {
  const written = stubPickerWithWritable('report.html', VALID_DOC)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await vi.waitFor(() => expect(written).toHaveLength(1))
  expect(written[0]).toContain('data-webdeck-version="1"')
  expect(written[0]).toContain('첫 슬라이드 제목')
})

test('쓰기 실패 시 오류와 다운로드 폴백을 제안한다', async () => {
  const handle = {
    getFile: () => Promise.resolve({ name: 'r.html', text: () => Promise.resolve(VALID_DOC) }),
    createWritable: () => Promise.reject(new Error('권한 거부')),
  }
  ;(window as unknown as { showOpenFilePicker?: () => Promise<unknown[]> }).showOpenFilePicker = () =>
    Promise.resolve([handle])
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('저장하지 못했습니다')
  await userEvent.click(screen.getByRole('button', { name: '다운로드로 저장' }))
  expect(URL.createObjectURL).toHaveBeenCalled()
})
```

Run: `cd editor && npx vitest run src/App.test.tsx`
Expected: 신규 2개 FAIL (저장 버튼 없음)

- [ ] **Step 7: App에 저장 배선**

`editor/src/App.tsx` — import 추가:

```tsx
import { useEffect, useReducer, useRef } from 'react'
import { downloadHtml, openHtmlFile, saveToHandle } from './file/fileAccess.ts'
import { checkRoundTrip } from './model/roundtrip.ts'
import { serializeWebdeck } from './model/serialize.ts'
import { isDirty } from './state/store.ts'
```

훅 연결을 교체하고 저장 핸들러·beforeunload를 추가:

```tsx
  useShortcuts(state, dispatch, idGenRef.current, handleSave)

  useEffect(() => {
    if (!isDirty(state)) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state])

  async function handleSave() {
    const { doc, fileHandle, fileName } = state
    if (!doc) return
    const problem = checkRoundTrip(doc)
    if (problem) {
      dispatch({ type: 'SAVE_ERROR', message: `저장 중단: ${problem}` })
      return
    }
    const html = serializeWebdeck(doc)
    if (fileHandle) {
      try {
        if (await saveToHandle(fileHandle, html)) {
          dispatch({ type: 'MARK_SAVED', doc })
          return
        }
      } catch {
        dispatch({ type: 'SAVE_ERROR', message: '파일에 저장하지 못했습니다 (권한 문제일 수 있음)' })
        return
      }
    }
    downloadHtml(fileName ?? 'webdeck.html', html)
    dispatch({ type: 'MARK_SAVED', doc })
  }

  function handleDownloadFallback() {
    const { doc, fileName } = state
    if (!doc || checkRoundTrip(doc) !== null) return
    downloadHtml(fileName ?? 'webdeck.html', serializeWebdeck(doc))
    dispatch({ type: 'MARK_SAVED', doc })
  }
```

(`useShortcuts`가 `handleSave`를 함수 선언 호이스팅으로 참조하도록 `handleSave`는 `function` 선언으로 둔다.)

topbar를 교체:

```tsx
      <header className="topbar">
        <h1>WebDeck 에디터</h1>
        <button type="button" onClick={handleOpen}>열기</button>
        <button type="button" disabled={!state.doc} onClick={handleSave}>저장</button>
        <button type="button" disabled={!state.history || !canUndo(state.history)} onClick={() => dispatch({ type: 'UNDO' })}>실행 취소</button>
        <button type="button" disabled={!state.history || !canRedo(state.history)} onClick={() => dispatch({ type: 'REDO' })}>다시 실행</button>
        {state.fileName && (
          <span className="file-name">
            {state.fileName}
            {isDirty(state) && <span className="dirty-dot" title="저장되지 않은 변경"> ●</span>}
          </span>
        )}
        {state.opaqueCount > 0 && <span className="notice">편집 불가 요소 {state.opaqueCount}개 보존됨</span>}
        {state.loadError && <span className="error" role="alert">{state.loadError}</span>}
        {state.saveError && (
          <span className="error" role="alert">
            {state.saveError}
            {/* 왕복 검증 차단('저장 중단')이면 손상 파일이므로 다운로드도 제안하지 않는다 */}
            {!state.saveError.startsWith('저장 중단') && (
              <button type="button" onClick={handleDownloadFallback}>다운로드로 저장</button>
            )}
          </span>
        )}
      </header>
```

`editor/src/app.css` 끝에 추가:

```css
.dirty-dot { color: var(--wd-primary); }
.error button { margin-left: 6px; font: inherit; font-size: 12px; padding: 2px 6px; border: 1px solid #b91c1c; border-radius: 4px; background: #fff; color: #b91c1c; cursor: pointer; }
```

- [ ] **Step 8: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 9: 커밋**

```bash
git add editor/src
git commit -m "feat: 저장 — 왕복 검증 안전망, FSA 쓰기, 다운로드 폴백, dirty 표시"
```

---

### Task 12: AIServiceAdapter 인터페이스 + 문서·백로그 정리

**Files:**
- Create: `editor/src/ai/adapter.ts`
- Modify: `docs/ai-guide.md`
- Modify: `docs/plan-3-backlog.md`

**Interfaces:**
- Consumes: `DeckDoc`
- Produces: `AIServiceAdapter`/`AIEditRequest`/`AIEditResult` — 스펙 §6.4의 확장 지점. 구현체·UI 없음(테스트는 typecheck로 갈음)

- [ ] **Step 1: adapter.ts 생성**

`editor/src/ai/adapter.ts`:

```ts
import type { DeckDoc } from '../model/types.ts'

/**
 * AI 수정 요청 확장 지점 (스펙 §6.4).
 * MVP에서는 구현체와 UI가 없다 — 추후 사내 LLM 프록시/Claude API 어댑터를
 * 이 인터페이스로 구현해 "AI에게 수정 요청" 기능을 붙인다.
 */
export interface AIEditRequest {
  doc: DeckDoc
  /** 현재 보고 있는 슬라이드 (0-base) */
  slideIndex: number
  /** 사용자의 자연어 수정 지시 */
  instruction: string
}

export interface AIEditResult {
  doc: DeckDoc
  /** 사용자에게 보여줄 변경 요약 */
  summary: string
}

export interface AIServiceAdapter {
  requestEdit(request: AIEditRequest): Promise<AIEditResult>
}
```

Run: `cd editor && npm run typecheck`
Expected: PASS

- [ ] **Step 2: ai-guide.md에 보존 비목표 문단 추가**

`docs/ai-guide.md` 끝에 추가:

```md
## 에디터 왕복 보존 범위 (참고)

WebDeck 에디터는 "이해하지 못하는 내용은 원문 보존" 원칙으로 동작하지만, 다음은 보존 비목표다:

- `<body>` 직속에서 `<main>` **앞**에 있던 요소는 저장 시 `<main>` **뒤**로 정규화된다 (내용 자체는 보존)
- `<body>` 직속의 텍스트 노드와 HTML 주석은 보존되지 않는다
- 요소 안 텍스트 HTML은 브라우저 DOM 직렬화 형태로 정규화될 수 있다 (의미 동일)

AI가 생성하는 문서가 이 가이드의 구조를 따르면 위 항목의 영향을 받지 않는다.
```

- [ ] **Step 3: 백로그 정리**

`docs/plan-3-backlog.md` 전체를 다음으로 교체 (해결된 항목 제거: class 토큰 보존, 보존 비목표 문서화, 저장 전 검증, ops throw 처리 — UI가 id를 현재 doc에서만 취해 사전 차단, frame 클램핑 — PPT와 동일하게 비클램핑으로 결정, AIServiceAdapter):

```md
# 백로그 — Plan 3b 이후 잔여 항목

Plan 3b(편집 상호작용 + 저장)까지 완료된 시점의 잔여 항목.

## 편집 기능 확장 (추후)

- 텍스트 서식을 편집 모드 밖에서도 적용 (요소만 선택한 상태의 굵게/크기 — 저장된 html 변환 필요)
- 리사이즈·다중 이동에도 스냅 가이드 적용 (현재는 단일 요소 이동만)
- 캔버스 수동 줌(배율 선택/휠 줌) — 현재는 자동 맞춤(fit) 줌만
- 글자 크기 자유 입력(현재 프리셋 6종)·글자색 자유 선택(현재 스와치 6종)
- 슬라이드 순서 드래그 시 삽입 위치 인디케이터 표시
- barrel `index.ts` 없음 — 딥 임포트 필요, UI 규모가 커지면 추가 검토

## 소소한 정리 (기회가 될 때)

- 검증기 `@import` 검사가 단순 부분 문자열 매치 (CSS 주석 내 오탐 가능, v1 허용)
- CLI 내부 오류 출력에서 비-Error throw 시 `undefined` 출력 가능
```

- [ ] **Step 4: 최종 검증**

Run (리포 루트에서):

```bash
node --test 'tools/**/*.test.mjs' && cd editor && npm test && npm run typecheck && npm run build
```

Expected: tools 22개 PASS, editor 전체 PASS, 타입체크·프로덕션 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add editor/src/ai docs/ai-guide.md docs/plan-3-backlog.md
git commit -m "feat: AIServiceAdapter 확장 지점 정의, 보존 비목표 문서화, 백로그 정리"
```

---

## 완료 기준

1. 전체 테스트 통과: tools 22개 + editor 전체 (`node --test 'tools/**/*.test.mjs'`, `cd editor && npm test`), `npm run typecheck`, `npm run build`
2. 왕복 계약 3종(모델 동등성·2회차 문자열 고정점·검증기 0오류/0경고) 유지 + class 토큰·deck 속성 보존 신규 계약
3. 수동 스모크 (사람 확인): `cd editor && npm run dev` → `templates/business-report.html` 열기 → 요소 클릭·드래그·리사이즈·더블클릭 편집·서식·삽입·슬라이드 추가/복제/순서/삭제·Ctrl+Z/Y → 저장 → 파일을 브라우저로 열어 뷰어 정상 + `node tools/validate-webdeck.mjs <저장 파일>` 0오류/0경고 확인
