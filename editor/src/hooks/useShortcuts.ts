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

export function useShortcuts(
  state: EditorState,
  dispatch: Dispatch<EditorAction>,
  idGen: () => string,
  onSave?: () => void,
): void {
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
      if (meta && key === 's') {
        e.preventDefault()
        onSave?.()
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
  }, [state, dispatch, idGen, onSave])
}
