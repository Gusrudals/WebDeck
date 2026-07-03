import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent } from 'react'
import { moveElement, setElementFrame, setTextHtml } from '../model/ops.ts'
import type { DeckDoc, Frame } from '../model/types.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'
import { buildSnapTargets, resizeFrame, snapMove, snapResize } from './geometry.ts'
import type { Guide, ResizeHandle, SnapTargets } from './geometry.ts'
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

interface ResizeGesture {
  kind: 'resize'
  slideId: string
  id: string
  frame: Frame
  guides: Guide[]
  resized: boolean
}

type Gesture = MoveGesture | ResizeGesture

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
  const [gesture, setGesture] = useState<Gesture | null>(null)

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
    if (!gesture) return doc
    if (gesture.kind === 'move') {
      if (!gesture.moved) return doc
      let d = doc
      for (const id of gesture.ids) d = moveElement(d, gesture.slideId, id, gesture.dx, gesture.dy)
      return d
    }
    if (!gesture.resized) return doc
    return setElementFrame(doc, gesture.slideId, gesture.id, gesture.frame)
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
      window.removeEventListener('pointercancel', onCancel)
      if (g.moved) {
        let d = docAtStart
        for (const id of g.ids) d = moveElement(d, g.slideId, id, g.dx, g.dy)
        dispatch({ type: 'APPLY_DOC', doc: d })
      }
      setGesture(null)
    }
    const onCancel = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      setGesture(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const beginResize = (e: ReactPointerEvent, handle: ResizeHandle) => {
    e.stopPropagation()
    e.preventDefault()
    const known = slide.elements.filter(isKnownElement)
    const el = known.find((k) => k.id === selectedIds[0])
    if (!el) return
    const startX = e.clientX
    const startY = e.clientY
    const orig = el.frame
    const targets = buildSnapTargets(
      doc.slideWidth,
      doc.slideHeight,
      known.filter((k) => k.id !== el.id).map((k) => k.frame),
    )
    const docAtStart = doc
    const g: ResizeGesture = { kind: 'resize', slideId: slide.id, id: el.id, frame: orig, guides: [], resized: false }
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scaleRef.current
      const dy = (ev.clientY - startY) / scaleRef.current
      // Shift+모서리 = 비율 고정(스냅 생략 — 두 보정의 충돌 회피), 그 외 = 리사이즈 스냅
      if (ev.shiftKey && handle.length === 2) {
        g.frame = resizeFrame(orig, handle, dx, dy, true)
        g.guides = []
      } else {
        const r = snapResize(orig, handle, dx, dy, targets)
        g.frame = r.frame
        g.guides = r.guides
      }
      g.resized = true
      setGesture({ ...g })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (g.resized) dispatch({ type: 'APPLY_DOC', doc: setElementFrame(docAtStart, g.slideId, g.id, g.frame) })
      setGesture(null)
    }
    const onCancel = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      setGesture(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
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

  const onElementDoubleClick = (id: string) => {
    const el = slide.elements.filter(isKnownElement).find((k) => k.id === id)
    if (el?.type === 'text') dispatch({ type: 'START_TEXT_EDIT', id })
  }

  const onTextCommit = (id: string, html: string) => {
    const el = slide.elements.filter(isKnownElement).find((k) => k.id === id)
    if (el?.type === 'text' && el.html !== html) {
      dispatch({ type: 'APPLY_DOC', doc: setTextHtml(doc, slide.id, id, html) })
    }
    dispatch({ type: 'END_TEXT_EDIT' })
  }

  const previewSlide = previewDoc.slides[slideIndex] ?? slide
  const themeVars = extractThemeVars(doc.headExtra)
  const singleSelected =
    selectedIds.length === 1 ? slide.elements.filter(isKnownElement).find((el) => el.id === selectedIds[0]) : undefined
  return (
    <main
      className="canvas-area"
      ref={ref}
      onPointerDown={() => {
        if (!editingTextId) dispatch({ type: 'CLEAR_SELECTION' })
      }}
    >
      <div style={{ width: doc.slideWidth * scale, height: doc.slideHeight * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div className="slide-stage" style={{ position: 'relative', width: doc.slideWidth, height: doc.slideHeight }}>
            <SlideView
              slide={previewSlide}
              width={doc.slideWidth}
              height={doc.slideHeight}
              themeVars={themeVars}
              interaction={{ selectedIds, editingTextId, onElementPointerDown, onElementDoubleClick, onTextCommit }}
            />
            <SelectionOverlay
              slide={previewSlide}
              selectedIds={selectedIds}
              guides={gesture?.guides ?? []}
              resize={
                singleSelected && editingTextId !== singleSelected.id
                  ? { elementId: singleSelected.id, onHandlePointerDown: beginResize }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </main>
  )
}
