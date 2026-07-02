import { createHistory } from '../model/history.ts'
import type { History } from '../model/history.ts'
import type { DeckDoc } from '../model/types.ts'

export interface EditorState {
  doc: DeckDoc | null
  history: History | null
  fileName: string | null
  fileHandle: FileSystemFileHandle | null
  currentSlideIndex: number
  opaqueCount: number
  loadError: string | null
}

export const initialEditorState: EditorState = {
  doc: null,
  history: null,
  fileName: null,
  fileHandle: null,
  currentSlideIndex: 0,
  opaqueCount: 0,
  loadError: null,
}

export type EditorAction =
  | { type: 'OPEN_SUCCESS'; doc: DeckDoc; fileName: string; fileHandle: FileSystemFileHandle | null }
  | { type: 'OPEN_ERROR'; message: string }
  | { type: 'SELECT_SLIDE'; index: number }

export function countOpaque(doc: DeckDoc): number {
  return doc.slides.reduce((n, s) => n + s.elements.filter((e) => e.type === 'opaque').length, 0)
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'OPEN_SUCCESS':
      return {
        doc: action.doc,
        history: createHistory(action.doc),
        fileName: action.fileName,
        fileHandle: action.fileHandle,
        currentSlideIndex: 0,
        opaqueCount: countOpaque(action.doc),
        loadError: null,
      }
    case 'OPEN_ERROR':
      return { ...state, loadError: action.message }
    case 'SELECT_SLIDE': {
      if (!state.doc) return state
      const max = state.doc.slides.length - 1
      return { ...state, currentSlideIndex: Math.max(0, Math.min(max, action.index)) }
    }
  }
}
