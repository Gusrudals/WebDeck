import { useEffect, useReducer, useRef } from 'react'
import { CanvasArea } from './canvas/CanvasArea.tsx'
import { downloadHtml, openHtmlFile, saveAsHtmlFile, saveToHandle } from './file/fileAccess.ts'
import type { SaveAsResult } from './file/fileAccess.ts'
import { TEMPLATES } from './file/templates.ts'
import { createIdGen } from './model/id.ts'
import { canRedo, canUndo } from './model/history.ts'
import { WebdeckParseError, parseWebdeck } from './model/parse.ts'
import { addSlide, duplicateSlide, moveSlide, removeSlide } from './model/ops.ts'
import { checkRoundTrip } from './model/roundtrip.ts'
import { serializeWebdeck } from './model/serialize.ts'
import type { DeckDoc } from './model/types.ts'
import { StartScreen } from './panels/StartScreen.tsx'
import { PropertiesPanel } from './panels/PropertiesPanel.tsx'
import { SlidePanel } from './panels/SlidePanel.tsx'
import { Toolbar } from './panels/Toolbar.tsx'
import { editorReducer, initialEditorState, isDirty } from './state/store.ts'
import { useShortcuts } from './hooks/useShortcuts.ts'

export function App() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)
  const idGenRef = useRef(createIdGen('n'))
  useShortcuts(state, dispatch, idGenRef.current, handleSave, handleSaveAs)

  useEffect(() => {
    if (!isDirty(state)) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state])

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

  async function handleOpen() {
    if (!confirmDiscard()) return
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

  return (
    <div className="app">
      <header className="topbar">
        <h1>WebDeck 에디터</h1>
        <button type="button" onClick={() => handleStart('minimal')}>새 문서</button>
        <button type="button" onClick={handleOpen}>열기</button>
        <button type="button" disabled={!state.doc} onClick={handleSave}>저장</button>
        <button type="button" disabled={!state.doc} onClick={handleSaveAs}>다른 이름으로 저장</button>
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
        )}
      </aside>
      {state.doc ? (
        <CanvasArea
          doc={state.doc}
          slideIndex={state.currentSlideIndex}
          selectedIds={state.selectedIds}
          editingTextId={state.editingTextId}
          dispatch={dispatch}
        />
      ) : (
        <StartScreen onStart={handleStart} onOpen={handleOpen} />
      )}
      <PropertiesPanel state={state} dispatch={dispatch} />
    </div>
  )
}
