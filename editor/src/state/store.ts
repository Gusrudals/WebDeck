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
  return { ...state, doc, history, currentSlideIndex: index, opaqueCount: countOpaque(doc), selectedIds, editingTextId, saveError: null }
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
