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
        <CanvasArea
          doc={state.doc}
          slideIndex={state.currentSlideIndex}
          selectedIds={state.selectedIds}
          editingTextId={state.editingTextId}
          dispatch={dispatch}
        />
      ) : (
        <main className="canvas-area">
          <p className="empty-state">문서를 열어 시작하세요</p>
        </main>
      )}
    </div>
  )
}
