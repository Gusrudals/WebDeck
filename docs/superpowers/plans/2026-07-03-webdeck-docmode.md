# WebDeck 문서 모드(일반 HTML 편집) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebDeck 표준 포맷이 아닌 일반 HTML을 열면 Word처럼 문서 전체를 자유 편집하고 일반 HTML 그대로 저장하는 "문서 모드"를 추가한다.

**Architecture:** 일반 HTML은 iframe(`sandbox="allow-same-origin"`, 스크립트 실행 차단 + 스타일 완전 격리)에 srcdoc으로 렌더링하고 `body`를 contentEditable로 만든다. undo/redo는 브라우저 네이티브에 위임하고, 저장은 iframe DOM을 직렬화(편집 부산물 속성 제거, DOCTYPE 원문 유지)해 기존 FSA/다운로드 경로를 재사용한다. 기존 `EditorState`/리듀서는 변경하지 않으며 App 수준의 `docFile` 분기로 모드를 전환한다.

**Tech Stack:** React 19 + TypeScript strict + Vite 8, Vitest + happy-dom(globals) + React Testing Library

**스펙:** `docs/superpowers/specs/2026-07-03-webdeck-docmode-design.md`

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess`. 상대 import에는 `.ts`/`.tsx` 확장자 필수
- 런타임 의존성은 react/react-dom 2개 유지 — 신규 의존성 금지
- 기존 `EditorState`/리듀서(`editor/src/state/store.ts`)는 변경하지 않는다
- iframe은 `sandbox="allow-same-origin"` 정확히 이 값 — `allow-scripts`를 절대 추가하지 않는다
- 저장물 원문 보존 원칙: DOCTYPE 원문 유지(없으면 생략), `<script>`/`<head>` 내용 보존, 편집 부산물 속성(body의 `contenteditable`·`spellcheck`)만 제거
- 사용자 노출 문구는 전부 한국어. 기존 문구 재사용(정확히 동일하게): confirm `저장하지 않은 변경이 있습니다. 계속하면 사라집니다. 계속할까요?`, 저장 오류 `파일에 저장하지 못했습니다 (권한 문제일 수 있음)`, dirty 표시 title `저장되지 않은 변경`, 폴백 버튼 `다운로드로 저장`
- 문서 모드 배지 문구: `문서 모드 — 일반 HTML` (전각 대시 — 그대로)
- 테스트 실행: `cd editor && npx vitest run <파일 경로>` (단일 파일), 전체는 리포 루트에서 `npm run test:all`
- happy-dom은 iframe srcdoc을 실제 로드하지 않는다 — DocumentMode는 편집 문서 접근자(`getEditDocument`)를 prop으로 주입 가능하게 만들고, 테스트는 DOMParser 문서를 주입한 뒤 `fireEvent.load(iframe)`으로 준비를 트리거한다

---

### Task 1: 직렬화 순수 함수 (`docmode/serialize.ts`)

**Files:**
- Create: `editor/src/docmode/serialize.ts`
- Test: `editor/src/docmode/serialize.test.ts`

**Interfaces:**
- Consumes: 없음 (브라우저 DOMParser만 사용)
- Produces (Task 2가 사용):
  - `extractDoctype(html: string): string | null` — 원본 HTML 첫머리의 DOCTYPE 선언을 원문 그대로 반환, 없으면 null
  - `serializeEditedDocument(doc: Document, doctype: string | null): string` — 편집된 문서를 일반 HTML 문자열로 직렬화 (body의 contenteditable/spellcheck 제거, doctype이 있으면 앞에 붙임). 전달된 `doc`은 변형하지 않는다

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/docmode/serialize.test.ts`:

```tsx
import { describe, expect, test } from 'vitest'
import { extractDoctype, serializeEditedDocument } from './serialize.ts'

const LEGACY_DOCTYPE = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">'

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('extractDoctype', () => {
  test('표준 html5 DOCTYPE을 원문 그대로 추출한다', () => {
    expect(extractDoctype('<!DOCTYPE html>\n<html><body></body></html>')).toBe('<!DOCTYPE html>')
  })

  test('대소문자·레거시 선언도 원문 그대로 보존한다', () => {
    expect(extractDoctype(`${LEGACY_DOCTYPE}\n<html></html>`)).toBe(LEGACY_DOCTYPE)
    expect(extractDoctype('<!doctype html><html></html>')).toBe('<!doctype html>')
  })

  test('앞의 BOM·공백을 허용한다', () => {
    expect(extractDoctype('\uFEFF  \n<!DOCTYPE html><html></html>')).toBe('<!DOCTYPE html>')
  })

  test('DOCTYPE이 없으면 null', () => {
    expect(extractDoctype('<html><body><p>x</p></body></html>')).toBeNull()
  })
})

describe('serializeEditedDocument', () => {
  const SOURCE = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>보고서</title><style>body { color: #111; }</style></head>
<body>
<h1>분기 보고</h1>
<script>console.log('chart')</script>
</body>
</html>`

  test('body의 contenteditable·spellcheck을 제거하고 DOCTYPE을 앞에 붙인다', () => {
    const doc = makeDoc(SOURCE)
    doc.body.setAttribute('contenteditable', 'true')
    doc.body.setAttribute('spellcheck', 'false')
    const out = serializeEditedDocument(doc, '<!DOCTYPE html>')
    expect(out.startsWith('<!DOCTYPE html>\n<html')).toBe(true)
    expect(out).not.toContain('contenteditable')
    expect(out).not.toContain('spellcheck')
  })

  test('script와 head 내용을 원문대로 보존한다', () => {
    const doc = makeDoc(SOURCE)
    const out = serializeEditedDocument(doc, '<!DOCTYPE html>')
    expect(out).toContain("<script>console.log('chart')</script>")
    expect(out).toContain('<style>body { color: #111; }</style>')
    expect(out).toContain('lang="ko"')
  })

  test('doctype이 null이면 붙이지 않는다', () => {
    const out = serializeEditedDocument(makeDoc('<html><body><p>x</p></body></html>'), null)
    expect(out.startsWith('<html')).toBe(true)
  })

  test('전달된 문서를 변형하지 않는다 (라이브 편집 유지)', () => {
    const doc = makeDoc(SOURCE)
    doc.body.setAttribute('contenteditable', 'true')
    serializeEditedDocument(doc, null)
    expect(doc.body.getAttribute('contenteditable')).toBe('true')
  })

  test('편집으로 바뀐 본문이 저장물에 반영된다', () => {
    const doc = makeDoc(SOURCE)
    doc.querySelector('h1')!.textContent = '수정된 제목'
    expect(serializeEditedDocument(doc, null)).toContain('수정된 제목')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/docmode/serialize.test.ts`
Expected: FAIL — `Cannot find module './serialize.ts'` 또는 모듈 없음 오류

- [ ] **Step 3: 구현**

`editor/src/docmode/serialize.ts`:

```ts
/** 원본 HTML 첫머리의 DOCTYPE 선언을 원문 그대로 추출한다 (없으면 null) */
export function extractDoctype(html: string): string | null {
  const m = html.match(/^\uFEFF?\s*(<!doctype[^>]*>)/i)
  return m ? m[1]! : null
}

/** 편집된 문서를 일반 HTML 문자열로 직렬화한다 — 편집 부산물 속성 제거, DOCTYPE 원문 유지 */
export function serializeEditedDocument(doc: Document, doctype: string | null): string {
  const root = doc.documentElement.cloneNode(true) as HTMLElement
  const body = root.querySelector('body')
  body?.removeAttribute('contenteditable')
  body?.removeAttribute('spellcheck')
  return (doctype ? doctype + '\n' : '') + root.outerHTML
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/docmode/serialize.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add editor/src/docmode/serialize.ts editor/src/docmode/serialize.test.ts
git commit -m "feat(docmode): 일반 HTML 직렬화 순수 함수 (DOCTYPE 보존, 편집 부산물 제거)"
```

---

### Task 2: DocumentMode 컴포넌트

**Files:**
- Create: `editor/src/docmode/DocumentMode.tsx`
- Modify: `editor/src/app.css` (파일 끝에 문서 모드 규칙 추가)
- Test: `editor/src/docmode/DocumentMode.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `extractDoctype`, `serializeEditedDocument`; 기존 `editor/src/file/fileAccess.ts`의 `saveToHandle(handle, html): Promise<boolean>`, `saveAsHtmlFile(suggestedName, html): Promise<SaveAsResult>`, `downloadHtml(fileName, html): void`, 타입 `SaveAsResult`
- Produces (Task 3이 사용):
  - `export interface DocModeFile { name: string; handle: FileSystemFileHandle | null; html: string }`
  - `export function DocumentMode(props: { file: DocModeFile; onOpen: () => void; getEditDocument?: (frame: HTMLIFrameElement | null) => Document | null }): JSX.Element` — 문서 모드 화면 전체. `onOpen`은 App의 공용 열기 흐름(문서 모드가 자체 dirty confirm을 먼저 수행한 뒤 호출)

**동작 계약:**
1. iframe `load` 후 본문을 `setAttribute('contenteditable', 'true')`로 편집 가능하게 만들고, 문서에 `input` 리스너를 달아 dirty를 세운다. load가 중복 발생해도 준비는 1회만 (이미 contenteditable이면 return)
2. 저장: 직렬화 → 핸들 있으면 `saveToHandle`, 실패/미지원이면 기존 App과 동일한 Save As → 다운로드 폴백 순서. 저장 성공 시 dirty 해제
3. undo/redo 버튼은 `document.execCommand('undo'|'redo')` 위임 (옵셔널 체이닝 — 미지원 환경 no-op)
4. dirty일 때만 beforeunload 경고 등록
5. 열기 버튼: dirty면 confirm(정확한 기존 문구), 거절 시 `onOpen` 미호출

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/docmode/DocumentMode.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { DocumentMode } from './DocumentMode.tsx'
import type { DocModeFile } from './DocumentMode.tsx'

// happy-dom에는 window.confirm이 없어 vi.spyOn 대상이 될 프로퍼티가 없다 — 채워둔다
if (!window.confirm) window.confirm = () => true

const PLAIN_HTML = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>보고서</title><style>body { color: #111; }</style></head>
<body>
<h1>분기 보고</h1>
<p>본문 내용</p>
<script>console.log('chart')</script>
</body>
</html>`

/** DOMParser 문서를 편집 표면으로 주입하고 iframe load를 수동 트리거한다 (happy-dom은 srcdoc을 로드하지 않음) */
function setup(over: Partial<DocModeFile> = {}, onOpen = vi.fn()) {
  const editDoc = new DOMParser().parseFromString(PLAIN_HTML, 'text/html')
  const file: DocModeFile = { name: 'plain.html', handle: null, html: PLAIN_HTML, ...over }
  render(<DocumentMode file={file} onOpen={onOpen} getEditDocument={() => editDoc} />)
  fireEvent.load(screen.getByTitle('문서 편집'))
  return { editDoc, onOpen }
}

function writableHandle() {
  const written: string[] = []
  const handle = {
    createWritable: () =>
      Promise.resolve({
        write: (d: string) => {
          written.push(d)
          return Promise.resolve()
        },
        close: () => Promise.resolve(),
      }),
  } as unknown as FileSystemFileHandle
  return { handle, written }
}

test('배지·파일명·버튼이 렌더링되고 본문이 편집 가능해진다', () => {
  const { editDoc } = setup()
  expect(screen.getByText('문서 모드 — 일반 HTML')).toBeTruthy()
  expect(screen.getByText('plain.html')).toBeTruthy()
  expect(screen.getByRole('button', { name: '저장' })).toBeTruthy()
  expect(editDoc.body.getAttribute('contenteditable')).toBe('true')
})

test('iframe은 스크립트 실행을 차단하는 sandbox로 렌더링된다', () => {
  setup()
  expect(screen.getByTitle('문서 편집').getAttribute('sandbox')).toBe('allow-same-origin')
})

test('입력하면 dirty 표시가 나타나고 저장하면 사라진다', async () => {
  const { handle, written } = writableHandle()
  const { editDoc } = setup({ handle })
  fireEvent.input(editDoc.body)
  expect(screen.getByTitle('저장되지 않은 변경')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await vi.waitFor(() => expect(written).toHaveLength(1))
  expect(screen.queryByTitle('저장되지 않은 변경')).toBeNull()
})

test('저장물은 DOCTYPE·script를 보존하고 contenteditable을 제거한다', async () => {
  const { handle, written } = writableHandle()
  setup({ handle })
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await vi.waitFor(() => expect(written).toHaveLength(1))
  expect(written[0]!.startsWith('<!DOCTYPE html>')).toBe(true)
  expect(written[0]).toContain("console.log('chart')")
  expect(written[0]).not.toContain('contenteditable')
})

test('쓰기 실패 시 오류와 다운로드 폴백을 제안한다', async () => {
  const handle = {
    createWritable: () => Promise.reject(new Error('권한 거부')),
  } as unknown as FileSystemFileHandle
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  setup({ handle })
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('저장하지 못했습니다')
  await userEvent.click(screen.getByRole('button', { name: '다운로드로 저장' }))
  expect(URL.createObjectURL).toHaveBeenCalled()
})

test('핸들이 없고 저장 피커 미지원이면 다운로드로 저장하고 dirty를 해제한다', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  const { editDoc } = setup()
  fireEvent.input(editDoc.body)
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
  expect(screen.queryByTitle('저장되지 않은 변경')).toBeNull()
})

test('실행 취소/다시 실행 버튼은 문서의 execCommand에 위임한다', async () => {
  const { editDoc } = setup()
  const spy = vi.fn()
  ;(editDoc as unknown as { execCommand?: (c: string) => void }).execCommand = spy
  await userEvent.click(screen.getByRole('button', { name: '실행 취소' }))
  expect(spy).toHaveBeenCalledWith('undo')
  await userEvent.click(screen.getByRole('button', { name: '다시 실행' }))
  expect(spy).toHaveBeenCalledWith('redo')
})

test('dirty 상태의 열기는 확인을 요구하고 거절 시 onOpen을 부르지 않는다', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const onOpen = vi.fn()
  const { editDoc } = setup({}, onOpen)
  fireEvent.input(editDoc.body)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  expect(confirmSpy).toHaveBeenCalled()
  expect(onOpen).not.toHaveBeenCalled()
  confirmSpy.mockRestore()
})

test('dirty가 아니면 확인 없이 onOpen을 부른다', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm')
  const onOpen = vi.fn()
  setup({}, onOpen)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  expect(confirmSpy).not.toHaveBeenCalled()
  expect(onOpen).toHaveBeenCalled()
  confirmSpy.mockRestore()
})
```

참고: `fireEvent.input(editDoc.body)`가 happy-dom의 DOMParser 문서에서 동작하지 않으면 `import { act } from '@testing-library/react'` 후 `act(() => { editDoc.body.dispatchEvent(new Event('input', { bubbles: true })) })`로 대체한다 (동등한 검증).

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/docmode/DocumentMode.test.tsx`
Expected: FAIL — `Cannot find module './DocumentMode.tsx'`

- [ ] **Step 3: 구현**

`editor/src/docmode/DocumentMode.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadHtml, saveAsHtmlFile, saveToHandle } from '../file/fileAccess.ts'
import type { SaveAsResult } from '../file/fileAccess.ts'
import { extractDoctype, serializeEditedDocument } from './serialize.ts'

export interface DocModeFile {
  name: string
  handle: FileSystemFileHandle | null
  html: string
}

interface DocumentModeProps {
  file: DocModeFile
  /** 상단바 '열기' — App의 공용 열기 흐름 (dirty 확인은 문서 모드가 먼저 수행) */
  onOpen: () => void
  /** 테스트 주입용 — 기본은 iframe.contentDocument */
  getEditDocument?: (frame: HTMLIFrameElement | null) => Document | null
}

const defaultGetEditDocument = (frame: HTMLIFrameElement | null) => frame?.contentDocument ?? null

export function DocumentMode({ file, onOpen, getEditDocument = defaultGetEditDocument }: DocumentModeProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [fileName, setFileName] = useState(file.name)
  const [handle, setHandle] = useState(file.handle)
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const doctype = useMemo(() => extractDoctype(file.html), [file.html])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function editDoc(): Document | null {
    return getEditDocument(frameRef.current)
  }

  /** iframe 로드 후 본문을 편집 가능하게 만든다 — load가 중복 발생해도 준비는 1회만 */
  function handleFrameLoad() {
    const d = editDoc()
    if (!d?.body || d.body.getAttribute('contenteditable') === 'true') return
    d.body.setAttribute('contenteditable', 'true')
    d.addEventListener('input', () => setDirty(true))
  }

  function serialize(): string | null {
    const d = editDoc()
    return d ? serializeEditedDocument(d, doctype) : null
  }

  function markSaved() {
    setDirty(false)
    setSaveError(null)
  }

  async function handleSave() {
    const html = serialize()
    if (html === null) return
    if (handle) {
      try {
        if (await saveToHandle(handle, html)) {
          markSaved()
          return
        }
      } catch {
        setSaveError('파일에 저장하지 못했습니다 (권한 문제일 수 있음)')
        return
      }
    }
    await saveAsFlow(html)
  }

  async function handleSaveAs() {
    const html = serialize()
    if (html !== null) await saveAsFlow(html)
  }

  /** 핸들이 없거나 새 대상이 필요한 저장 — App의 saveAsFlow와 동일한 규칙 */
  async function saveAsFlow(html: string) {
    let result: SaveAsResult
    try {
      result = await saveAsHtmlFile(fileName, html)
    } catch {
      setSaveError('파일에 저장하지 못했습니다 (권한 문제일 수 있음)')
      return
    }
    if (result === 'cancelled') return
    if (result === 'unsupported') {
      downloadHtml(fileName, html)
      markSaved()
      return
    }
    setHandle(result.handle)
    setFileName(result.name)
    markSaved()
  }

  function handleDownloadFallback() {
    const html = serialize()
    if (html === null) return
    downloadHtml(fileName, html)
    markSaved()
  }

  function handleOpenClick() {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 계속하면 사라집니다. 계속할까요?')) return
    onOpen()
  }

  function execHistory(command: 'undo' | 'redo') {
    editDoc()?.execCommand?.(command)
  }

  return (
    <div className="docmode">
      <header className="topbar">
        <h1>WebDeck 에디터</h1>
        <span className="docmode-badge">문서 모드 — 일반 HTML</span>
        <button type="button" onClick={handleOpenClick}>열기</button>
        <button type="button" onClick={handleSave}>저장</button>
        <button type="button" onClick={handleSaveAs}>다른 이름으로 저장</button>
        <button type="button" onClick={() => execHistory('undo')}>실행 취소</button>
        <button type="button" onClick={() => execHistory('redo')}>다시 실행</button>
        <span className="file-name">
          {fileName}
          {dirty && <span className="dirty-dot" title="저장되지 않은 변경"> ●</span>}
        </span>
        {saveError && (
          <span className="error" role="alert">
            {saveError}
            <button type="button" onClick={handleDownloadFallback}>다운로드로 저장</button>
          </span>
        )}
      </header>
      <iframe
        ref={frameRef}
        className="docmode-frame"
        title="문서 편집"
        sandbox="allow-same-origin"
        srcDoc={file.html}
        onLoad={handleFrameLoad}
      />
    </div>
  )
}
```

`editor/src/app.css` 파일 끝에 추가:

```css
/* 문서 모드 (일반 HTML 편집) */
.docmode { display: flex; flex-direction: column; height: 100vh; }
.docmode .topbar { flex: none; }
.docmode-badge { font-size: 12px; color: #1e40af; background: #dbeafe; padding: 4px 8px; border-radius: 4px; }
.docmode-frame { flex: 1; width: 100%; border: none; background: #fff; }
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && npx vitest run src/docmode/DocumentMode.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 5: 타입 검사**

Run: `cd editor && npm run typecheck`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add editor/src/docmode/DocumentMode.tsx editor/src/docmode/DocumentMode.test.tsx editor/src/app.css
git commit -m "feat(docmode): DocumentMode 컴포넌트 — iframe 격리 편집·네이티브 undo·일반 HTML 저장"
```

---

### Task 3: App 통합 — 일반 HTML 열기 분기와 단축키 격리

**Files:**
- Modify: `editor/src/App.tsx`
- Modify: `editor/src/hooks/useShortcuts.ts`
- Test: `editor/src/App.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `DocumentMode`, `DocModeFile`
- Produces: 없음 (최종 통합)

**동작 계약:**
1. `handleOpen`에서 `parseWebdeck`이 `WebdeckParseError`를 던지면 오류 알림 대신 문서 모드로 진입한다. 그 외 예외(파일 읽기 실패 등)는 기존 `OPEN_ERROR` 유지
2. WebDeck 문서를 열면(문서 모드에서든 아니든) `docFile`을 해제하고 기존 슬라이드 에디터로 간다
3. 문서 모드에서는 App의 dirty confirm·beforeunload·슬라이드 단축키가 **모두 비활성** — 스테일 덱 상태(문서 모드 진입 전에 열려 있던 문서)에 대한 이중 confirm·Cmd+S 오저장을 막는다. 문서 모드 자체의 dirty 가드는 DocumentMode가 담당
4. 같은 세션에서 일반 HTML을 연달아 열면 `key` 재마운트로 DocumentMode 상태가 초기화된다

- [ ] **Step 1: 실패하는 테스트 작성**

`editor/src/App.test.tsx`에서 기존 테스트 `'WebDeck 문서가 아니면 오류를 표시한다'`(59-65행)를 **삭제**하고, 그 자리에 아래 3개를 추가:

```tsx
test('일반 HTML을 열면 문서 모드로 진입한다', async () => {
  stubFilePicker('plain.html', '<html><body><p>일반 문서</p></body></html>')
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  expect(await screen.findByText('문서 모드 — 일반 HTML')).toBeTruthy()
  expect(screen.getByText('plain.html')).toBeTruthy()
  expect(screen.getByTitle('문서 편집')).toBeTruthy()
  // 슬라이드 에디터 UI는 렌더링되지 않는다
  expect(screen.queryByText('시작하기')).toBeNull()
})

test('문서 모드에서 WebDeck 문서를 열면 슬라이드 에디터로 돌아온다', async () => {
  stubFilePicker('plain.html', '<html><body><p>일반 문서</p></body></html>')
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findByText('문서 모드 — 일반 HTML')
  stubFilePicker('report.html', VALID_DOC)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  expect((await screen.findAllByText('첫 슬라이드 제목')).length).toBeGreaterThanOrEqual(1)
  expect(screen.queryByText('문서 모드 — 일반 HTML')).toBeNull()
})

test('문서 모드에서는 슬라이드 단축키(Cmd+S)가 이전 덱을 저장하지 않는다', async () => {
  const written = stubPickerWithWritable('report.html', VALID_DOC)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  stubFilePicker('plain.html', '<html><body><p>일반 문서</p></body></html>')
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findByText('문서 모드 — 일반 HTML')
  await userEvent.keyboard('{Meta>}s{/Meta}')
  expect(written).toHaveLength(0)
})
```

주의: `stubPickerWithWritable`은 파일 내 67행에 이미 정의돼 있고 테스트 배치 순서상 사용 위치보다 아래에 있다 — 호이스팅되는 함수 선언이므로 그대로 사용 가능. 세 번째 테스트에서 두 번째 `stubFilePicker` 호출이 첫 번째 stub을 덮어쓰는 것도 의도된 동작.

- [ ] **Step 2: 실패 확인**

Run: `cd editor && npx vitest run src/App.test.tsx`
Expected: 새 테스트 3개 FAIL (`문서 모드 — 일반 HTML`을 찾을 수 없음), 기존 테스트는 PASS

- [ ] **Step 3: useShortcuts에 enabled 파라미터 추가**

`editor/src/hooks/useShortcuts.ts`의 시그니처와 useEffect 첫 줄 수정:

```ts
export function useShortcuts(
  state: EditorState,
  dispatch: Dispatch<EditorAction>,
  idGen: () => string,
  onSave?: () => void,
  onSaveAs?: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return
    function onKeyDown(e: KeyboardEvent) {
```

그리고 의존성 배열을 `[state, dispatch, idGen, onSave, onSaveAs, enabled]`로 변경. (enabled=false면 리스너 자체를 달지 않는다 — 함수 본문 나머지는 그대로)

- [ ] **Step 4: App.tsx 수정**

변경 지점 4곳:

(1) import에 `useState` 추가 + DocumentMode import (1행, 18행 근처):

```tsx
import { useEffect, useReducer, useRef, useState } from 'react'
import { DocumentMode } from './docmode/DocumentMode.tsx'
import type { DocModeFile } from './docmode/DocumentMode.tsx'
```

(2) 컴포넌트 상단 — docFile 상태와 단축키 비활성 (21-30행 교체):

```tsx
export function App() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)
  const [docFile, setDocFile] = useState<{ seq: number; file: DocModeFile } | null>(null)
  const docSeqRef = useRef(0)
  const idGenRef = useRef(createIdGen('n'))
  useShortcuts(state, dispatch, idGenRef.current, handleSave, handleSaveAs, docFile === null)

  useEffect(() => {
    // 문서 모드에서는 DocumentMode가 자체 beforeunload를 관리한다 — 스테일 덱 dirty로 경고하지 않는다
    if (docFile !== null || !isDirty(state)) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state, docFile])
```

(3) `handleOpen` 교체 (49-68행):

```tsx
  async function handleOpen() {
    // 문서 모드에서는 DocumentMode가 자체 dirty 확인을 이미 마쳤다 — 스테일 덱 상태로 이중 confirm하지 않는다
    if (docFile === null && !confirmDiscard()) return
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
      setDocFile(null)
      dispatch({ type: 'OPEN_SUCCESS', doc, fileName: opened.name, fileHandle: opened.handle })
    } catch (e) {
      if (e instanceof WebdeckParseError) {
        // 일반 HTML — 문서 모드로 진입. seq 키로 연속 열기 시 DocumentMode를 재마운트한다
        docSeqRef.current += 1
        setDocFile({ seq: docSeqRef.current, file: { name: opened.name, handle: opened.handle, html: opened.text } })
        return
      }
      dispatch({ type: 'OPEN_ERROR', message: '문서를 해석할 수 없습니다' })
    }
  }
```

(4) return 직전에 문서 모드 분기 (130행 `return (` 앞):

```tsx
  if (docFile) {
    return <DocumentMode key={docFile.seq} file={docFile.file} onOpen={handleOpen} />
  }
```

- [ ] **Step 5: 통과 확인**

Run: `cd editor && npx vitest run src/App.test.tsx`
Expected: PASS (기존 + 신규 전부)

- [ ] **Step 6: 전체 에디터 테스트·타입 검사**

Run: `cd editor && npm test && npm run typecheck`
Expected: 전부 PASS, 타입 오류 없음

- [ ] **Step 7: 커밋**

```bash
git add editor/src/App.tsx editor/src/hooks/useShortcuts.ts editor/src/App.test.tsx
git commit -m "feat(docmode): 일반 HTML 열기 시 문서 모드 진입 — App 분기·단축키 격리"
```

---

### Task 4: 문서 갱신과 최종 검증

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-webdeck-design.md` (§12 이력 추가)
- Modify: `README.md`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (문서만)

- [ ] **Step 1: 마스터 스펙 §12에 이력 추가**

`docs/superpowers/specs/2026-07-02-webdeck-design.md`의 `## 12. MVP 이후 확장 이력` 목록 끝(Plan 5 항목 다음)에 추가:

```markdown
- **문서 모드 — 일반 HTML 편집 (2026-07-03)**: 표준 포맷이 아닌 HTML을 열면 거부하는 대신 문서 모드로 진입 — iframe(`sandbox="allow-same-origin"`, 스크립트 실행 차단) 격리 렌더링 + body contentEditable 전체 편집, 브라우저 네이티브 undo, 일반 HTML 그대로 저장(DOCTYPE 원문 유지, script 보존, 편집 부산물 속성 제거). 슬라이드 변환 없음, EditorState 변경 없음(App 수준 분기). 상세: `2026-07-03-webdeck-docmode-design.md`
```

- [ ] **Step 2: README 갱신**

`README.md`의 "## 현재 제공" 목록에서 마지막 항목(`**에디터 뷰어 (Plan 3a)**` 줄) 을 아래 두 줄로 교체:

```markdown
- **WYSIWYG 에디터** — `cd editor && npm run dev`로 실행. 열기/저장(File System Access), 드래그·리사이즈·스냅, 텍스트 편집·서식(폰트/크기/색/목록/줄 간격), 속성 패널(위치·크기·채우기·테두리·그림자·투명도), 슬라이드 관리, undo/redo, PPT식 단축키
- **문서 모드** — WebDeck 포맷이 아닌 일반 HTML도 에디터에서 열어 Word처럼 편집하고 일반 HTML 그대로 저장 (스크립트는 편집 중 실행 차단, 저장 시 보존)
```

그리고 "## 로드맵" 섹션(30-33행)을 아래로 교체:

```markdown
- ~~Plan 1: 포맷 & 도구~~ · ~~Plan 2: 에디터 코어~~ · ~~Plan 3a: 뷰어~~ · ~~Plan 3b: 편집+저장 (MVP)~~ · ~~Plan 4: 새 문서·템플릿~~ · ~~Plan 5: 서식·속성 심화~~ · ~~문서 모드(일반 HTML)~~ (완료)
- 이후 계획: `docs/roadmap.md` (발표 모드, 테마, AI 연동, 표·도형 확장, 배포)
```

- [ ] **Step 3: 전체 검증**

Run (리포 루트): `npm run test:all && cd editor && npm run typecheck && npm run build`
Expected: tools/에디터 테스트 전부 PASS, 타입 오류 없음, 빌드 성공

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/2026-07-02-webdeck-design.md README.md
git commit -m "docs: 문서 모드 이력·README 갱신"
```

---

## 알려진 한계 (구현하지 않음 — 스펙 §8)

- JS가 그리는 콘텐츠(차트 등)는 편집 화면에서 빈 영역 — 저장 후 브라우저로 열면 정상
- 상대 경로 이미지·CSS는 srcdoc 기준이라 편집 화면에서 깨질 수 있음 — 저장본은 무손상
- 저장 시 DOM 직렬화 정규화로 원본과 바이트 단위 동일하지 않을 수 있음 — 렌더링 결과는 동일
- 파일 읽기 실패(OPEN_ERROR)가 문서 모드 중에 발생하면 알림이 보이지 않음(문서 모드 유지) — 극히 드묾, 수용
- undo로 저장 시점 내용에 되돌아가도 dirty 표시가 남을 수 있음(단순 플래그) — 수용

## 수동 확인 (사람 확인 — 머지 후)

1. `cd editor && npm run dev` → 일반 HTML(예: AI 생성 보고서)을 열기 → 문서 모습 그대로 보이고 배지 표시
2. 본문 클릭·타이핑 → dirty ● 표시, Cmd+Z로 되돌리기
3. 저장 → 원본 파일이 갱신되고 브라우저로 열면 편집 반영 + 스크립트/스타일 정상
4. 문서 모드에서 WebDeck 문서 열기 → 슬라이드 에디터로 전환
5. WebDeck 문서를 열면 기존과 동일하게 동작 (회귀 없음)
