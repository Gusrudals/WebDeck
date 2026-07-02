import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent } from 'react'
import { moveElement } from '../model/ops.ts'
import type { DeckDoc, Frame } from '../model/types.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'
import { buildSnapTargets, snapMove } from './geometry.ts'
import type { Guide, SnapTargets } from './geometry.ts'
import { SelectionOverlay } from './SelectionOverlay.tsx'
import { SlideView } from './SlideView.tsx'
import { extractThemeVars } from './styleFromModel.ts'

const MARGIN = 48
const DRAG_THRESHOLD = 3

interface MoveGesture {
  kind: 'move'
  slideId: string
  ids: string[]
  dx: number
  dy: number
  guides: Guide[]
  moved: boolean
}

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
  const scaleRef = useRef(1)
  scaleRef.current = scale
  const [gesture, setGesture] = useState<MoveGesture | null>(null)

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

  const previewDoc = useMemo(() => {
    if (!gesture || !gesture.moved) return doc
    let d = doc
    for (const id of gesture.ids) d = moveElement(d, gesture.slideId, id, gesture.dx, gesture.dy)
    return d
  }, [doc, gesture])

  const slide = doc.slides[slideIndex]
  if (!slide) return null

  const beginMove = (e: ReactPointerEvent, ids: string[]) => {
    const startX = e.clientX
    const startY = e.clientY
    const known = slide.elements.filter(isKnownElement)
    const single = ids.length === 1 ? known.find((el) => el.id === ids[0]) : undefined
    const targets: SnapTargets | null = single
      ? buildSnapTargets(doc.slideWidth, doc.slideHeight, known.filter((el) => el.id !== single.id).map((el) => el.frame))
      : null
    const startFrame: Frame | null = single ? single.frame : null
    const docAtStart = doc
    const g: MoveGesture = { kind: 'move', slideId: slide.id, ids, dx: 0, dy: 0, guides: [], moved: false }
    const onMove = (ev: PointerEvent) => {
      const rawDx = (ev.clientX - startX) / scaleRef.current
      const rawDy = (ev.clientY - startY) / scaleRef.current
      if (!g.moved && Math.abs(rawDx) < DRAG_THRESHOLD && Math.abs(rawDy) < DRAG_THRESHOLD) return
      g.moved = true
      if (startFrame && targets) {
        const s = snapMove(startFrame, rawDx, rawDy, targets)
        g.dx = s.dx
        g.dy = s.dy
        g.guides = s.guides
      } else {
        g.dx = rawDx
        g.dy = rawDy
        g.guides = []
      }
      setGesture({ ...g })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (g.moved) {
        let d = docAtStart
        for (const id of g.ids) d = moveElement(d, g.slideId, id, g.dx, g.dy)
        dispatch({ type: 'APPLY_DOC', doc: d })
      }
      setGesture(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onElementPointerDown = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation()
    // 텍스트 편집 중이면 첫 클릭은 편집 종료(blur 커밋)만 — preventDefault를 하면 blur가 막힌다
    if (editingTextId !== null) return
    e.preventDefault()
    if (e.shiftKey) {
      dispatch({ type: 'TOGGLE_SELECT', id })
      return
    }
    const ids = selectedIds.includes(id) ? selectedIds : [id]
    if (!selectedIds.includes(id)) dispatch({ type: 'SELECT_ELEMENTS', ids: [id] })
    beginMove(e, ids)
  }

  const previewSlide = previewDoc.slides[slideIndex] ?? slide
  const themeVars = extractThemeVars(doc.headExtra)
  return (
    <main className="canvas-area" ref={ref} onPointerDown={() => dispatch({ type: 'CLEAR_SELECTION' })}>
      <div style={{ width: doc.slideWidth * scale, height: doc.slideHeight * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div className="slide-stage" style={{ position: 'relative', width: doc.slideWidth, height: doc.slideHeight }}>
            <SlideView
              slide={previewSlide}
              width={doc.slideWidth}
              height={doc.slideHeight}
              themeVars={themeVars}
              interaction={{ selectedIds, editingTextId, onElementPointerDown }}
            />
            <SelectionOverlay slide={previewSlide} selectedIds={selectedIds} guides={gesture?.guides ?? []} />
          </div>
        </div>
      </div>
    </main>
  )
}
