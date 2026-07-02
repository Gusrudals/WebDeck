# WebDeck Plan 4 — 새 문서·템플릿 시작·다른 이름으로 저장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에디터가 기존 파일 없이도 시작할 수 있게 한다 — 빈 문서/템플릿에서 새 문서 만들기, 시작 화면, 다른 이름으로 저장(Save As), 미저장 변경 보호 가드.

**Architecture:** 템플릿 3종(`templates/*.html`)을 Vite의 `import.meta.glob(?raw)`로 에디터 번들에 내장한다 — "새 문서"는 minimal 템플릿을 `parseWebdeck`으로 파싱해 시작하므로 내장 뷰어 CSS/JS(headExtra/bodyScript)를 공짜로 확보하고 별도 문서 조립 코드가 없다. 시작한 문서는 `savedDoc: null`이라 저장 전까지 항상 dirty(탭 닫기 경고 유지). Save As는 `showSaveFilePicker`로 핸들을 얻어 즉시 쓰고 상태의 파일명·핸들을 교체해 이후 Ctrl+S가 제자리 저장이 된다 — 미지원 브라우저는 기존 다운로드 폴백. 핸들 없는 문서의 "저장"도 이제 Save As 흐름을 경유한다(기존: 곧장 다운로드).

**Tech Stack:** React 19 + TypeScript(strict) + Vite 8 (`import.meta.glob` raw import), Vitest + happy-dom + RTL. 런타임 의존성은 react/react-dom만.

## Global Constraints

- 에디터 런타임 의존성은 `react`, `react-dom` **둘뿐** — 새 런타임 의존성 추가 금지
- TypeScript strict + `noUncheckedIndexedAccess`. import는 확장자 포함 (`./x.ts`), tsconfig types에 `vite/client` 있음 → `import.meta.glob` 타입 지원
- 모든 UI 문구·오류 메시지는 한국어
- 기존 왕복 계약(모델 동등성·2회차 문자열 고정점·검증기 0오류/0경고 + class 토큰 보존) 테스트는 계속 통과해야 한다
- 저장 안전망(`checkRoundTrip`)은 Save As 경로에도 동일하게 적용 — 검증 실패 문서는 어떤 경로로도 디스크에 쓰지 않는다
- 미저장 변경 보호: 열기/새 문서/템플릿 시작 전 `isDirty`면 `window.confirm`으로 확인 (구현은 `if (isDirty(state) && !window.confirm(...)) return` — dirty가 아니면 confirm을 호출하지 않아야 happy-dom에서도 안전)
- 테스트: `cd editor && npm test` / 타입체크: `npm run typecheck` / 루트: `node --test 'tools/**/*.test.mjs'` 통과 유지
- happy-dom에 없는 API(`showSaveFilePicker`, `window.confirm` 동작)는 테스트에서 스텁/스파이 — 구현은 옵셔널·가드 필수
- 커밋 메시지는 기존 스타일: `feat:`/`fix:`/`test:` + 한국어 요약

## 파일 구조

| 파일 | 책임 |
|---|---|
| `editor/src/file/templates.ts` (신규) | `templates/*.html`을 번들에 raw 내장, `TEMPLATES: Template[]` export |
| `editor/src/state/store.ts` (수정) | `START_DOC`(핸들 없는 새 문서 시작, 항상 dirty), `SAVED_AS`(파일명·핸들 교체) 액션 |
| `editor/src/file/fileAccess.ts` (수정) | `saveAsHtmlFile(suggestedName, html)` — 피커+즉시 쓰기 |
| `editor/src/hooks/useShortcuts.ts` (수정) | `onSaveAs` 매개변수 + Ctrl/Cmd+Shift+S |
| `editor/src/panels/StartScreen.tsx` (신규) | 시작 화면 — 템플릿 카드 + 기존 문서 열기 |
| `editor/src/App.tsx` (수정) | 새 문서 버튼, Save As 버튼·흐름, dirty 가드, 시작 화면 배선 |
| `editor/src/app.css` (수정) | 시작 화면 카드 스타일 |
| `docs/superpowers/specs/2026-07-02-webdeck-design.md` (수정) | MVP 이후 확장 이력 §12 추가 |
| `docs/plan-3-backlog.md` (수정) | 시작 화면 후속 항목 1건 추가 |

## 태스크 개요 (의존 순서)

1. 템플릿 번들 모듈 (`TEMPLATES`)
2. 스토어 — `START_DOC`/`SAVED_AS` 액션
3. 다른 이름으로 저장 (fileAccess + 단축키 + App 저장 흐름 변경)
4. 시작 화면 + 새 문서 버튼 + dirty 가드
5. 문서 정리 + 최종 검증

---

### Task 1: 템플릿 번들 모듈

**Files:**
- Create: `editor/src/file/templates.ts`
- Test: `editor/src/file/templates.test.ts`

**Interfaces:**
- Consumes: `parseWebdeck` (테스트에서만), Vite `import.meta.glob`
- Produces: `interface Template { key: string; label: string; description: string; html: string }`, `TEMPLATES: Template[]` — **첫 요소는 항상 minimal(빈 문서)**. Task 4의 StartScreen과 App의 새 문서 버튼이 사용한다

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/file/templates.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import { TEMPLATES } from './templates.ts'

describe('내장 템플릿', () => {
  test('리포의 템플릿 3종이 번들에 포함된다', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(3)
    expect(TEMPLATES.map((t) => t.key)).toEqual(
      expect.arrayContaining(['minimal', 'business-report', 'project-proposal']),
    )
  })

  test('첫 템플릿은 빈 문서(minimal)다', () => {
    expect(TEMPLATES[0]!.key).toBe('minimal')
    expect(TEMPLATES[0]!.label).toBe('빈 문서')
  })

  test('모든 템플릿은 WebDeck 문서로 파싱된다', () => {
    for (const t of TEMPLATES) {
      const doc = parseWebdeck(t.html)
      expect(doc.slides.length, t.key).toBeGreaterThanOrEqual(1)
      expect(t.label.length, t.key).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/file/templates.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: templates.ts 구현**

`editor/src/file/templates.ts`:

```ts
/** 리포의 templates/*.html을 빌드 시 번들에 원문으로 내장한다 (정적 SPA — 런타임 fetch 없음) */
const files = import.meta.glob('../../../templates/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const LABELS: Record<string, { label: string; description: string }> = {
  minimal: { label: '빈 문서', description: '슬라이드 1장으로 시작' },
  'business-report': { label: '업무 보고', description: '표지·목차·본문을 갖춘 보고서' },
  'project-proposal': { label: '프로젝트 제안', description: '제안 개요와 로드맵 구성' },
}

export interface Template {
  key: string
  label: string
  description: string
  html: string
}

export const TEMPLATES: Template[] = Object.entries(files)
  .map(([path, html]) => {
    const key = path.replace(/^.*\//, '').replace(/\.html$/, '')
    const meta = LABELS[key] ?? { label: key, description: '' }
    return { key, label: meta.label, description: meta.description, html }
  })
  .sort((a, b) => {
    if (a.key === 'minimal') return -1
    if (b.key === 'minimal') return 1
    return a.label.localeCompare(b.label, 'ko')
  })
```

참고: glob 패턴은 이 파일 기준 상대 경로(`editor/src/file/` → 리포 루트의 `templates/`). Vite dev 서버의 `fs.allow`는 워크스페이스 루트(.git 위치)까지 허용하므로 dev에서도 동작하고, eager raw import라 빌드 산출물에는 문자열로 포함된다. 새 템플릿 파일이 추가되면 자동으로 목록에 나타난다(LABELS에 없으면 파일명이 라벨).

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/file/templates.test.ts && npm run typecheck && npm run build`
Expected: PASS + 빌드 성공 (번들 내장 확인 — 빌드 로그에 청크 크기 증가)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/file/templates.ts editor/src/file/templates.test.ts
git commit -m "feat: 템플릿 3종을 에디터 번들에 내장"
```

---

### Task 2: 스토어 — START_DOC / SAVED_AS 액션

**Files:**
- Modify: `editor/src/state/store.ts`
- Test: `editor/src/state/store.test.ts` (추가)

**Interfaces:**
- Consumes: 기존 `EditorState`/`editorReducer`/`isDirty`/`createHistory`
- Produces (Task 3·4가 사용):
  - `{ type: 'START_DOC'; doc: DeckDoc; fileName: string }` — 새 문서/템플릿 시작. OPEN_SUCCESS와 같되 `fileHandle: null`, **`savedDoc: null`(항상 dirty — 저장 전 닫기 경고 유지)**
  - `{ type: 'SAVED_AS'; doc: DeckDoc; fileName: string; fileHandle: FileSystemFileHandle }` — Save As 성공. `savedDoc`/`fileName`/`fileHandle` 교체 + `saveError: null`

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/state/store.test.ts`의 describe 블록에 추가 (기존 헬퍼 `opened()`/`TWO_SLIDES` 재사용):

```ts
  test('START_DOC은 핸들 없이 시작하고 항상 dirty다', () => {
    const doc = parseWebdeck(TWO_SLIDES)
    const s = editorReducer(initialEditorState, { type: 'START_DOC', doc, fileName: '제목 없음.html' })
    expect(s.doc).toBe(doc)
    expect(s.fileName).toBe('제목 없음.html')
    expect(s.fileHandle).toBeNull()
    expect(s.savedDoc).toBeNull()
    expect(isDirty(s)).toBe(true)
    expect(s.history!.past).toHaveLength(0)
    expect(s.loadError).toBeNull()
  })

  test('SAVED_AS는 파일명·핸들을 교체하고 dirty를 해제한다', () => {
    const s0 = opened()
    const elId = s0.doc!.slides[0]!.elements[0]!.id
    let s = editorReducer(s0, { type: 'APPLY_DOC', doc: moveElement(s0.doc!, s0.doc!.slides[0]!.id, elId, 1, 1) })
    expect(isDirty(s)).toBe(true)
    const handle = {} as FileSystemFileHandle
    s = editorReducer(s, { type: 'SAVED_AS', doc: s.doc!, fileName: 'copy.html', fileHandle: handle })
    expect(s.fileName).toBe('copy.html')
    expect(s.fileHandle).toBe(handle)
    expect(isDirty(s)).toBe(false)
    expect(s.saveError).toBeNull()
  })
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/state/store.test.ts`
Expected: FAIL — 신규 액션 타입 오류

- [ ] **Step 3: store.ts 구현**

`EditorAction` 유니언에 추가 (`OPEN_SUCCESS` 아래):

```ts
  | { type: 'START_DOC'; doc: DeckDoc; fileName: string }
```

(`SAVE_ERROR` 아래):

```ts
  | { type: 'SAVED_AS'; doc: DeckDoc; fileName: string; fileHandle: FileSystemFileHandle }
```

리듀서에 케이스 추가 (`OPEN_SUCCESS` 케이스 아래):

```ts
    case 'START_DOC':
      return {
        ...initialEditorState,
        doc: action.doc,
        history: createHistory(action.doc),
        fileName: action.fileName,
        opaqueCount: countOpaque(action.doc),
        // 새 문서는 저장 전까지 dirty — savedDoc을 비워 beforeunload 경고를 유지한다
        savedDoc: null,
        clipboard: state.clipboard,
      }
```

(`MARK_SAVED` 케이스 아래):

```ts
    case 'SAVED_AS':
      return { ...state, savedDoc: action.doc, saveError: null, fileName: action.fileName, fileHandle: action.fileHandle }
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add editor/src/state
git commit -m "feat: 스토어에 새 문서 시작·다른 이름으로 저장 액션 추가"
```

---

### Task 3: 다른 이름으로 저장 (Save As)

**Files:**
- Modify: `editor/src/file/fileAccess.ts`
- Modify: `editor/src/hooks/useShortcuts.ts`
- Modify: `editor/src/App.tsx`
- Test: `editor/src/App.test.tsx` (추가), `editor/src/hooks/useShortcuts.test.tsx` (추가)

**Interfaces:**
- Consumes: `SAVED_AS`(Task 2), 기존 `saveToHandle`/`downloadHtml`/`checkRoundTrip`/`serializeWebdeck`
- Produces:
  - `type SaveAsResult = { handle: FileSystemFileHandle; name: string } | 'cancelled' | 'unsupported'`
  - `saveAsHtmlFile(suggestedName: string, html: string): Promise<SaveAsResult>` — `showSaveFilePicker`로 대상 선택 후 **즉시 쓰기**까지 수행. 취소(AbortError) → `'cancelled'`, API 미지원 → `'unsupported'`
  - `useShortcuts(state, dispatch, idGen, onSave?, onSaveAs?)` — Ctrl/Cmd+Shift+S는 `onSaveAs`, Shift 없는 Ctrl/Cmd+S는 기존대로 `onSave`
- **저장 흐름 변경**: 핸들 없는 문서의 "저장"은 곧장 다운로드하는 대신 Save As 흐름을 경유한다 — FSA 지원 브라우저에서는 피커로 핸들을 확보해 이후 Ctrl+S가 제자리 저장이 되고, 미지원 브라우저는 기존처럼 다운로드된다. 기존 App 테스트 "쓰기 실패 시…"·"핸들 없음→다운로드" 계열은 happy-dom에 `showSaveFilePicker`가 없어 `'unsupported'` 경로로 계속 통과해야 한다(깨지면 회귀)

- [ ] **Step 1: 실패하는 단축키 테스트 작성**

`editor/src/hooks/useShortcuts.test.tsx` — Harness/setup에 `onSaveAs` 추가:

```tsx
function Harness({ state, dispatch, onSave, onSaveAs }: {
  state: EditorState
  dispatch: Dispatch<EditorAction>
  onSave?: () => void
  onSaveAs?: () => void
}) {
  useShortcuts(state, dispatch, idGen, onSave, onSaveAs)
  return <input aria-label="더미 입력" />
}
```

(setup이 `onSaveAs: vi.fn()`을 만들어 Harness에 넘기고 반환값에 포함하도록 수정.)

테스트 추가:

```tsx
test('Ctrl+Shift+S는 onSaveAs를 호출하고 onSave는 호출하지 않는다', () => {
  const { onSave, onSaveAs } = setup()
  fireEvent.keyDown(window, { key: 's', ctrlKey: true, shiftKey: true })
  expect(onSaveAs).toHaveBeenCalledTimes(1)
  expect(onSave).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 실패하는 App 테스트 작성**

`editor/src/App.test.tsx`에 추가 (기존 `stubPickerWithWritable` 재사용):

```tsx
test('다른 이름으로 저장은 피커로 핸들을 얻고 파일명을 교체한다', async () => {
  stubPickerWithWritable('report.html', VALID_DOC)
  const written: string[] = []
  const newHandle = {
    name: 'copy.html',
    createWritable: () =>
      Promise.resolve({
        write: (d: string) => {
          written.push(d)
          return Promise.resolve()
        },
        close: () => Promise.resolve(),
      }),
  }
  ;(window as unknown as { showSaveFilePicker?: () => Promise<unknown> }).showSaveFilePicker = () =>
    Promise.resolve(newHandle)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '다른 이름으로 저장' }))
  await vi.waitFor(() => expect(written).toHaveLength(1))
  expect(written[0]).toContain('data-webdeck-version="1"')
  expect(screen.getByText('copy.html')).toBeTruthy()
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
})

test('다른 이름으로 저장 피커 취소는 아무 것도 바꾸지 않는다', async () => {
  stubPickerWithWritable('report.html', VALID_DOC)
  ;(window as unknown as { showSaveFilePicker?: () => Promise<unknown> }).showSaveFilePicker = () =>
    Promise.reject(new DOMException('취소', 'AbortError'))
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '다른 이름으로 저장' }))
  expect(screen.getByText('report.html')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd editor && npx vitest run src/App.test.tsx src/hooks/useShortcuts.test.tsx`
Expected: 신규 3개 FAIL ('다른 이름으로 저장' 버튼 없음, onSaveAs 미지원)

- [ ] **Step 4: fileAccess에 saveAsHtmlFile 추가**

`editor/src/file/fileAccess.ts` 끝에 추가:

```ts
interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>
}

export type SaveAsResult = { handle: FileSystemFileHandle; name: string } | 'cancelled' | 'unsupported'

/** 다른 이름으로 저장: 피커로 대상 파일을 고르고 즉시 쓴다 */
export async function saveAsHtmlFile(suggestedName: string, html: string): Promise<SaveAsResult> {
  const w = window as SavePickerWindow
  if (!w.showSaveFilePicker) return 'unsupported'
  let handle: FileSystemFileHandle
  try {
    handle = await w.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'WebDeck 문서', accept: { 'text/html': ['.html'] } }],
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    throw e
  }
  if (!(await saveToHandle(handle, html))) return 'unsupported'
  return { handle, name: handle.name }
}
```

- [ ] **Step 5: useShortcuts에 onSaveAs 추가**

`editor/src/hooks/useShortcuts.ts` — 시그니처에 5번째 매개변수 추가:

```ts
export function useShortcuts(
  state: EditorState,
  dispatch: Dispatch<EditorAction>,
  idGen: () => string,
  onSave?: () => void,
  onSaveAs?: () => void,
): void {
```

기존 `if (meta && key === 's')` 블록을 교체:

```ts
      if (meta && key === 's') {
        e.preventDefault()
        if (e.shiftKey) onSaveAs?.()
        else onSave?.()
        return
      }
```

deps 배열을 `[state, dispatch, idGen, onSave, onSaveAs]`로 교체.

- [ ] **Step 6: App 저장 흐름 배선**

`editor/src/App.tsx`:

import 교체·추가:

```tsx
import { downloadHtml, openHtmlFile, saveAsHtmlFile, saveToHandle } from './file/fileAccess.ts'
import type { SaveAsResult } from './file/fileAccess.ts'
import type { DeckDoc } from './model/types.ts'
```

훅 호출 교체:

```tsx
  useShortcuts(state, dispatch, idGenRef.current, handleSave, handleSaveAs)
```

`handleSave`의 마지막 블록(`downloadHtml(...)` + `MARK_SAVED` 2줄)을 교체:

```tsx
    await saveAsFlow(doc, html)
```

`handleSave` 아래에 추가:

```tsx
  async function handleSaveAs() {
    const { doc } = state
    if (!doc) return
    const problem = checkRoundTrip(doc)
    if (problem) {
      dispatch({ type: 'SAVE_ERROR', message: `저장 중단: ${problem}` })
      return
    }
    await saveAsFlow(doc, serializeWebdeck(doc))
  }

  /** 핸들이 없거나 새 대상이 필요한 저장 — 피커 확보에 성공하면 이후 Ctrl+S는 제자리 저장 */
  async function saveAsFlow(doc: DeckDoc, html: string) {
    const { fileName } = state
    let result: SaveAsResult
    try {
      result = await saveAsHtmlFile(fileName ?? '제목 없음.html', html)
    } catch {
      dispatch({ type: 'SAVE_ERROR', message: '파일에 저장하지 못했습니다 (권한 문제일 수 있음)' })
      return
    }
    if (result === 'cancelled') return
    if (result === 'unsupported') {
      downloadHtml(fileName ?? '제목 없음.html', html)
      dispatch({ type: 'MARK_SAVED', doc })
      return
    }
    dispatch({ type: 'SAVED_AS', doc, fileName: result.name, fileHandle: result.handle })
  }
```

topbar의 저장 버튼 아래에 추가:

```tsx
        <button type="button" disabled={!state.doc} onClick={handleSaveAs}>다른 이름으로 저장</button>
```

- [ ] **Step 7: 통과 확인 (회귀 포함)**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS — 특히 기존 "쓰기 실패 시 오류와 다운로드 폴백"·"핸들 없음→다운로드" 계열 테스트가 `'unsupported'` 경로로 계속 통과하는지 확인 (happy-dom에는 showSaveFilePicker가 없음)

- [ ] **Step 8: 커밋**

```bash
git add editor/src
git commit -m "feat: 다른 이름으로 저장 — FSA 피커·핸들 교체·Ctrl+Shift+S"
```

---

### Task 4: 시작 화면 + 새 문서 버튼 + 미저장 변경 가드

**Files:**
- Create: `editor/src/panels/StartScreen.tsx`
- Modify: `editor/src/App.tsx`
- Modify: `editor/src/app.css`
- Test: `editor/src/panels/StartScreen.test.tsx` (신규), `editor/src/App.test.tsx` (추가·수정)

**Interfaces:**
- Consumes: `TEMPLATES`(Task 1), `START_DOC`(Task 2), `isDirty`
- Produces: `StartScreen({ onStart, onOpen }: { onStart: (key: string) => void; onOpen: () => void })` — 문서가 없을 때 캔버스 영역을 대체. App의 `handleStart(key)`는 dirty 가드 → 템플릿 파싱 → `START_DOC`(fileName `'제목 없음.html'`). topbar의 "새 문서" 버튼은 `handleStart('minimal')`
- dirty 가드 규칙: `handleOpen`과 `handleStart` 진입 시 `isDirty(state) && !window.confirm('저장하지 않은 변경이 있습니다. 계속하면 사라집니다. 계속할까요?')`이면 중단. **dirty가 아니면 confirm을 호출하지 않는다**

- [ ] **Step 1: 실패하는 StartScreen 테스트 작성**

`editor/src/panels/StartScreen.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StartScreen } from './StartScreen.tsx'

function renderStart() {
  const onStart = vi.fn()
  const onOpen = vi.fn()
  const utils = render(<StartScreen onStart={onStart} onOpen={onOpen} />)
  return { onStart, onOpen, ...utils }
}

test('템플릿 카드들이 렌더되고 첫 카드는 빈 문서다', () => {
  const { container } = renderStart()
  const cards = container.querySelectorAll('.start-card')
  expect(cards.length).toBeGreaterThanOrEqual(3)
  expect(cards[0]!.textContent).toContain('빈 문서')
})

test('카드 클릭은 해당 템플릿 key로 onStart를 호출한다', () => {
  const { onStart, getByRole } = renderStart()
  fireEvent.click(getByRole('button', { name: /업무 보고/ }))
  expect(onStart).toHaveBeenCalledWith('business-report')
})

test('기존 문서 열기는 onOpen을 호출한다', () => {
  const { onOpen, getByRole } = renderStart()
  fireEvent.click(getByRole('button', { name: '기존 문서 열기…' }))
  expect(onOpen).toHaveBeenCalled()
})
```

- [ ] **Step 2: 실패하는 App 테스트 작성·수정**

`editor/src/App.test.tsx`:

기존 '앱 셸이 렌더링된다' 테스트에서 `expect(screen.getByText('문서를 열어 시작하세요')).toBeTruthy()`를 다음으로 교체:

```tsx
  expect(screen.getByText('시작하기')).toBeTruthy()
  expect(screen.getByRole('button', { name: /빈 문서/ })).toBeTruthy()
```

테스트 추가:

```tsx
test('새 문서 버튼은 빈 문서로 시작하고 dirty 상태다', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '새 문서' }))
  expect(await screen.findByText('제목 없음.html')).toBeTruthy()
  expect(screen.getByTitle('저장되지 않은 변경')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^슬라이드 \d/ }).length).toBeGreaterThanOrEqual(1)
})

test('시작 화면에서 템플릿을 골라 시작한다', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: /업무 보고/ }))
  expect(await screen.findByText('제목 없음.html')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^슬라이드 \d/ }).length).toBeGreaterThanOrEqual(2)
})

test('dirty 문서에서 새 문서는 확인을 요구하고 거절 시 유지한다', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '새 문서' }))
  await screen.findByText('제목 없음.html')
  // 새 문서는 항상 dirty — 다시 새 문서를 눌러 가드를 확인
  await userEvent.click(screen.getByRole('button', { name: '새 문서' }))
  expect(confirmSpy).toHaveBeenCalled()
  expect(screen.getByText('제목 없음.html')).toBeTruthy()
  confirmSpy.mockRestore()
})

test('dirty 문서에서 열기도 확인을 요구한다', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const picker = vi.fn()
  ;(window as unknown as { showOpenFilePicker?: () => Promise<unknown[]> }).showOpenFilePicker = picker
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '새 문서' }))
  await screen.findByText('제목 없음.html')
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  expect(confirmSpy).toHaveBeenCalled()
  expect(picker).not.toHaveBeenCalled()
  confirmSpy.mockRestore()
})
```

주의: happy-dom에 `window.confirm`이 없으면 `vi.spyOn`이 실패할 수 있다 — 그 경우 테스트 파일 상단에서 `if (!window.confirm) window.confirm = () => true`로 채운 뒤 spy한다.

- [ ] **Step 3: 실패 확인**

Run: `cd editor && npx vitest run src/panels/StartScreen.test.tsx src/App.test.tsx`
Expected: 신규 전부 FAIL

- [ ] **Step 4: StartScreen 구현**

`editor/src/panels/StartScreen.tsx`:

```tsx
import { TEMPLATES } from '../file/templates.ts'

export function StartScreen({ onStart, onOpen }: { onStart: (key: string) => void; onOpen: () => void }) {
  return (
    <main className="canvas-area">
      <div className="start-screen">
        <h2>시작하기</h2>
        <div className="start-cards">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="start-card" onClick={() => onStart(t.key)}>
              <strong>{t.label}</strong>
              <span>{t.description}</span>
            </button>
          ))}
        </div>
        <button type="button" className="start-open" onClick={onOpen}>기존 문서 열기…</button>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: App 배선**

`editor/src/App.tsx`:

import 추가:

```tsx
import { TEMPLATES } from './file/templates.ts'
import { StartScreen } from './panels/StartScreen.tsx'
```

`handleOpen` 위에 추가:

```tsx
  /** 미저장 변경이 있으면 진행 여부를 묻는다 — dirty가 아니면 confirm을 띄우지 않는다 */
  function confirmDiscard(): boolean {
    return !isDirty(state) || window.confirm('저장하지 않은 변경이 있습니다. 계속하면 사라집니다. 계속할까요?')
  }

  function handleStart(key: string) {
    if (!confirmDiscard()) return
    const template = TEMPLATES.find((t) => t.key === key)
    if (!template) return
    try {
      const doc = parseWebdeck(template.html)
      dispatch({ type: 'START_DOC', doc, fileName: '제목 없음.html' })
    } catch {
      dispatch({ type: 'OPEN_ERROR', message: '템플릿을 불러올 수 없습니다' })
    }
  }
```

`handleOpen` 첫 줄에 추가:

```tsx
    if (!confirmDiscard()) return
```

topbar 열기 버튼 **앞**에 추가:

```tsx
        <button type="button" onClick={() => handleStart('minimal')}>새 문서</button>
```

빈 상태 렌더(`<main className="canvas-area"><p className="empty-state">문서를 열어 시작하세요</p></main>`)를 교체:

```tsx
        <StartScreen onStart={handleStart} onOpen={handleOpen} />
```

(`.empty-state` CSS 규칙은 더 이상 쓰이지 않으므로 app.css에서 제거.)

- [ ] **Step 6: CSS 추가**

`editor/src/app.css` — `.empty-state` 규칙을 제거하고 끝에 추가:

```css
.start-screen { display: flex; flex-direction: column; align-items: center; gap: 20px; }
.start-screen h2 { margin: 0; font-size: 18px; color: #374151; }
.start-cards { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.start-card { display: flex; flex-direction: column; gap: 6px; width: 180px; padding: 20px 16px; font: inherit; text-align: left; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; }
.start-card:hover { border-color: var(--wd-primary); box-shadow: 0 2px 8px rgba(26, 86, 219, 0.12); }
.start-card strong { font-size: 14px; }
.start-card span { font-size: 12px; color: #6b7280; }
.start-open { font: inherit; font-size: 13px; padding: 6px 14px; background: none; border: none; color: var(--wd-primary); cursor: pointer; text-decoration: underline; }
```

- [ ] **Step 7: 통과 확인**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 8: 커밋**

```bash
git add editor/src
git commit -m "feat: 시작 화면과 새 문서 — 템플릿에서 시작, 미저장 변경 가드"
```

---

### Task 5: 문서 정리 + 최종 검증

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-webdeck-design.md`
- Modify: `docs/plan-3-backlog.md`

**Interfaces:**
- Consumes: 없음 (문서만)
- Produces: 스펙에 확장 이력 §12, 백로그에 후속 항목

- [ ] **Step 1: 스펙에 확장 이력 추가**

`docs/superpowers/specs/2026-07-02-webdeck-design.md` 끝에 추가:

```md

## 12. MVP 이후 확장 이력

- **Plan 4 (2026-07-03)**: 새 문서/템플릿 시작 화면(템플릿 3종을 에디터 번들에 raw 내장 — 새 문서는 minimal 템플릿 파싱으로 시작해 내장 뷰어 런타임을 상속), 다른 이름으로 저장(`showSaveFilePicker`, 성공 시 핸들 교체로 이후 제자리 저장, 미지원 브라우저는 다운로드 폴백), 열기/새 문서 시 미저장 변경 confirm 가드. 이로써 §6.1의 "에디터는 기존 파일을 여는 것으로 시작" 전제가 확장됨.
```

- [ ] **Step 2: 백로그에 후속 항목 추가**

`docs/plan-3-backlog.md`의 "## 편집 기능 확장 (추후)" 섹션에 추가:

```md
- 시작 화면 템플릿 카드에 미리보기 썸네일 (현재는 라벨·설명 텍스트만)
- 회사 커스텀 템플릿 등록 (현재는 빌드 시 templates/ 내장 3종 고정 — 파일 추가 후 재빌드 필요)
```

- [ ] **Step 3: 최종 검증**

Run (리포 루트에서):

```bash
node --test 'tools/**/*.test.mjs' && cd editor && npm test && npm run typecheck && npm run build
```

Expected: tools 22개 PASS, editor 전체 PASS, 타입체크·빌드 성공

- [ ] **Step 4: 커밋**

```bash
git add docs
git commit -m "docs: Plan 4 확장 이력·백로그 갱신"
```

---

## 완료 기준

1. 전체 테스트 통과 (tools 22 + editor 전체), typecheck, build
2. 수동 스모크 (사람 확인): `cd editor && npm run dev` → 시작 화면에서 "업무 보고" 선택 → 편집 → Ctrl+S → 피커에서 저장 위치 선택 → 이후 Ctrl+S는 제자리 저장 → "다른 이름으로 저장"으로 사본 생성 → dirty 상태에서 "새 문서" 클릭 시 확인 대화상자 확인 → 저장 파일 `node tools/validate-webdeck.mjs <파일>` 0오류/0경고
