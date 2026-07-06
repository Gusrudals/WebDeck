import { useEffect, useReducer, useRef, useState } from 'react'
import { CanvasArea } from './canvas/CanvasArea.tsx'
import { DocumentMode } from './docmode/DocumentMode.tsx'
import type { DocModeFile } from './docmode/DocumentMode.tsx'
import { listCustomTemplates, removeCustomTemplate, saveCustomTemplate } from './file/customTemplates.ts'
import type { CustomTemplate } from './file/customTemplates.ts'
import { downloadHtml, openHtmlFile, saveAsHtmlFile, saveToHandle } from './file/fileAccess.ts'
import type { SaveAsResult } from './file/fileAccess.ts'
import { TEMPLATES } from './file/templates.ts'
import { createIdGen } from './model/id.ts'
import { canRedo, canUndo } from './model/history.ts'
import { LAYOUTS } from './model/layouts.ts'
import { WebdeckParseError, parseWebdeck } from './model/parse.ts'
import { addSlide, duplicateSlide, moveSlide, removeSlide } from './model/ops.ts'
import { checkRoundTrip } from './model/roundtrip.ts'
import { normalizeRuntime } from './model/runtime.ts'
import { serializeWebdeck } from './model/serialize.ts'
import type { DeckDoc } from './model/types.ts'
import { StartScreen } from './panels/StartScreen.tsx'
import { PropertiesPanel } from './panels/PropertiesPanel.tsx'
import { SlidePanel } from './panels/SlidePanel.tsx'
import { Toolbar } from './panels/Toolbar.tsx'
import { editorReducer, initialEditorState, isDirty } from './state/store.ts'
import { useShortcuts } from './hooks/useShortcuts.ts'

export interface TableSel {
  elementId: string
  anchor: [number, number]
  extent: [number, number]
}

export function App() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)
  const [docFile, setDocFile] = useState<{ seq: number; file: DocModeFile } | null>(null)
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>(listCustomTemplates)
  const [tableSel, setTableSel] = useState<TableSel | null>(null)
  const docSeqRef = useRef(0)
  const idGenRef = useRef(createIdGen('n'))
  useShortcuts(state, dispatch, idGenRef.current, handleSave, handleSaveAs, docFile === null)

  useEffect(() => {
    // 선택된 요소가 바뀌면 표 선택을 해제 — 단, 같은 표가 여전히 단일 선택 상태면 유지한다
    // (범위 선택 중 다른 액션이 selectedIds를 동일 값으로 재설정해도 표 셀 범위가 날아가지 않게)
    setTableSel((sel) => (sel && state.selectedIds.length === 1 && state.selectedIds[0] === sel.elementId ? sel : null))
  }, [state.selectedIds, state.currentSlideIndex, state.doc === null])

  useEffect(() => {
    // 문서 모드에서는 DocumentMode가 자체 beforeunload를 관리한다 — 스테일 덱 dirty로 경고하지 않는다
    if (docFile !== null || !isDirty(state)) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state, docFile])

  /** 미저장 변경이 있으면 진행 여부를 묻는다 — dirty가 아니면 confirm을 띄우지 않는다 */
  function confirmDiscard(): boolean {
    return !isDirty(state) || window.confirm('저장하지 않은 변경이 있습니다. 계속하면 사라집니다. 계속할까요?')
  }

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
      const doc = normalizeRuntime(parseWebdeck(opened.text))
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
    await saveAsFlow(doc, html)
  }

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

  function handleDownloadFallback() {
    const { doc, fileName } = state
    if (!doc || checkRoundTrip(doc) !== null) return
    downloadHtml(fileName ?? 'webdeck.html', serializeWebdeck(doc))
    dispatch({ type: 'MARK_SAVED', doc })
  }

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

  if (docFile) {
    return <DocumentMode key={docFile.seq} file={docFile.file} onOpen={handleOpen} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>WebDeck 에디터</h1>
        <button type="button" onClick={() => handleStart('minimal')}>새 문서</button>
        <button type="button" onClick={handleOpen}>열기</button>
        <button type="button" disabled={!state.doc} onClick={handleSave}>저장</button>
        <button type="button" disabled={!state.doc} onClick={handleSaveAs}>다른 이름으로 저장</button>
        <button type="button" disabled={!state.doc} onClick={handleRegisterTemplate}>템플릿으로 등록</button>
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
      <Toolbar state={state} dispatch={dispatch} idGen={idGenRef.current} />
      <aside className="side">
        {state.doc && (
          <SlidePanel
            doc={state.doc}
            currentIndex={state.currentSlideIndex}
            onSelect={(index) => dispatch({ type: 'SELECT_SLIDE', index })}
            canRemove={state.doc.slides.length > 1}
            onAdd={(layoutKey) => {
              const layout = LAYOUTS.find((l) => l.key === layoutKey)
              if (!layout) return
              dispatch({
                type: 'APPLY_DOC',
                doc: addSlide(state.doc!, idGenRef.current, state.currentSlideIndex + 1, layout.build(idGenRef.current)),
              })
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
        )}
      </aside>
      {state.doc ? (
        <CanvasArea
          doc={state.doc}
          slideIndex={state.currentSlideIndex}
          selectedIds={state.selectedIds}
          editingTextId={state.editingTextId}
          dispatch={dispatch}
          tableSel={tableSel}
          setTableSel={setTableSel}
        />
      ) : (
        <StartScreen
          onStart={handleStart}
          onOpen={handleOpen}
          customTemplates={customTemplates}
          onImport={handleImportTemplate}
          onDeleteTemplate={handleDeleteTemplate}
        />
      )}
      <PropertiesPanel state={state} dispatch={dispatch} tableSel={tableSel} />
    </div>
  )
}
