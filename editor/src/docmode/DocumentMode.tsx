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
