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
