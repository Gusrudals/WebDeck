import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent } from 'react'
import type { TableSel } from '../App.tsx'
import { moveElement, setElementFrame, setElementRotation, setTextHtml } from '../model/ops.ts'
import { flattenAnchors, insertRow, setCellHtml, setColWidths } from '../model/tableOps.ts'
import type { DeckDoc, Frame, TableElement } from '../model/types.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'
import { angleFromCenter, buildSnapTargets, resizeFrame, snapAngle, snapMove, snapResize } from './geometry.ts'
import type { Guide, ResizeHandle, SnapTargets } from './geometry.ts'
import { SelectionOverlay } from './SelectionOverlay.tsx'
import { SlideView } from './SlideView.tsx'
import { extractThemeVars } from './styleFromModel.ts'
import type { TableInteraction } from './TableView.tsx'

const MARGIN = 48
const DRAG_THRESHOLD = 3

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2]

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

interface RotateGesture {
  kind: 'rotate'
  slideId: string
  id: string
  rotation: number
  rotated: boolean
}

interface ColResizeGesture {
  kind: 'colresize'
  slideId: string
  id: string
  widths: number[]
  resized: boolean
}

type Gesture = MoveGesture | ResizeGesture | RotateGesture | ColResizeGesture

export interface CanvasAreaProps {
  doc: DeckDoc
  slideIndex: number
  selectedIds: string[]
  editingTextId: string | null
  dispatch: Dispatch<EditorAction>
  tableSel: TableSel | null
  setTableSel: (s: TableSel | null) => void
}

export function CanvasArea({ doc, slideIndex, selectedIds, editingTextId, dispatch, tableSel, setTableSel }: CanvasAreaProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(1)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const scale = zoom === 'fit' ? fitScale : zoom
  const scaleRef = useRef(1)
  scaleRef.current = scale
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [editingCell, setEditingCell] = useState<{ elementId: string; r: number; c: number } | null>(null)
  const cellDragRef = useRef(false)
  // Critical 보정 2: 셀 커밋(APPLY_DOC) 직후 같은 동기 틱에서 onCellTab의 행 추가가 이어질 때
  // doc prop은 아직 재렌더 전이라 스테일하다 — 방금 커밋한 doc을 여기 저장해 그 위에 이어 붙인다.
  const pendingDocRef = useRef<DeckDoc | null>(null)

  useEffect(() => {
    pendingDocRef.current = null
  }, [doc])

  useEffect(() => {
    setEditingCell(null)
  }, [slideIndex])

  useEffect(() => {
    // Minor 보정(계약 ⑧): 표를 유지한 채여도 선택 요소 집합이 바뀌면(패널/키보드 경유로
    // blur 없이 다른 요소가 선택되는 경우) editingCell을 초기화한다 — 안 그러면 같은 표를
    // 재선택했을 때 과거 편집 셀이 되살아난다.
    setEditingCell((cell) => (cell && !selectedIds.includes(cell.elementId) ? null : cell))
  }, [selectedIds])

  useEffect(() => {
    function fit() {
      const area = ref.current
      if (!area || !area.clientWidth || !area.clientHeight) return
      const scaleX = (area.clientWidth - MARGIN) / doc.slideWidth
      const scaleY = (area.clientHeight - MARGIN) / doc.slideHeight
      setFitScale(Math.max(0.1, Math.min(1, scaleX, scaleY)))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [doc.slideWidth, doc.slideHeight])

  useEffect(() => {
    const area = ref.current
    if (!area) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => {
        const current = z === 'fit' ? fitScale : z
        if (e.deltaY < 0) return ZOOM_LEVELS.find((l) => l > current + 0.001) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!
        return [...ZOOM_LEVELS].reverse().find((l) => l < current - 0.001) ?? ZOOM_LEVELS[0]!
      })
    }
    area.addEventListener('wheel', onWheel, { passive: false })
    return () => area.removeEventListener('wheel', onWheel)
  }, [fitScale])

  const previewDoc = useMemo(() => {
    if (!gesture) return doc
    if (gesture.kind === 'move') {
      if (!gesture.moved) return doc
      let d = doc
      for (const id of gesture.ids) d = moveElement(d, gesture.slideId, id, gesture.dx, gesture.dy)
      return d
    }
    if (gesture.kind === 'rotate') {
      if (!gesture.rotated) return doc
      return setElementRotation(doc, gesture.slideId, gesture.id, gesture.rotation)
    }
    if (gesture.kind === 'colresize') {
      if (!gesture.resized) return doc
      return setColWidths(doc, gesture.slideId, gesture.id, gesture.widths)
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
    const targets: SnapTargets | null =
      single && single.rotation === 0
        ? buildSnapTargets(doc.slideWidth, doc.slideHeight, known.filter((el) => el.id !== single.id && el.rotation === 0).map((el) => el.frame))
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
      known.filter((k) => k.id !== el.id && k.rotation === 0).map((k) => k.frame),
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

  const beginRotate = (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const known = slide.elements.filter(isKnownElement)
    const el = known.find((k) => k.id === selectedIds[0])
    if (!el) return
    const stage = (e.currentTarget as HTMLElement).closest('.slide-stage')
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const cx = el.frame.left + el.frame.width / 2
    const cy = el.frame.top + el.frame.height / 2
    const docAtStart = doc
    const g: RotateGesture = { kind: 'rotate', slideId: slide.id, id: el.id, rotation: el.rotation, rotated: false }
    const onMove = (ev: PointerEvent) => {
      const px = (ev.clientX - rect.left) / scaleRef.current
      const py = (ev.clientY - rect.top) / scaleRef.current
      const raw = angleFromCenter(cx, cy, px, py)
      g.rotation = ev.shiftKey ? snapAngle(raw) : Math.round(raw)
      g.rotated = true
      setGesture({ ...g })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (g.rotated && g.rotation !== el.rotation) {
        dispatch({ type: 'APPLY_DOC', doc: setElementRotation(docAtStart, g.slideId, g.id, g.rotation) })
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

  const selectedTable =
    selectedIds.length === 1
      ? slide.elements.filter(isKnownElement).find((el): el is TableElement => el.id === selectedIds[0] && el.type === 'table')
      : undefined

  const commitCell = (el: TableElement, r: number, c: number, html: string) => {
    const anchors = flattenAnchors(el)
    const target = anchors.find((a) => a.r === r && a.c === c)
    if (target && target.cell.html !== html) {
      const next = setCellHtml(doc, slide.id, el.id, r, c, html)
      pendingDocRef.current = next
      dispatch({ type: 'APPLY_DOC', doc: next })
    }
    dispatch({ type: 'END_TEXT_EDIT' })
    setEditingCell(null)
  }

  const tableFor = (id: string): TableInteraction | undefined => {
    if (!selectedTable || selectedTable.id !== id) return undefined
    const el = selectedTable
    return {
      selectedRange:
        tableSel && tableSel.elementId === id
          ? { r1: tableSel.anchor[0], c1: tableSel.anchor[1], r2: tableSel.extent[0], c2: tableSel.extent[1] }
          : null,
      editingCell: editingCell && editingCell.elementId === id ? { r: editingCell.r, c: editingCell.c } : null,
      onCellPointerDown: (e, r, c) => {
        if (editingCell) return // 편집 중엔 셀 클릭이 캐럿 이동 — 선택 갱신 없이 통과시킨다
        e.stopPropagation()
        if (e.shiftKey && tableSel && tableSel.elementId === id) {
          setTableSel({ ...tableSel, extent: [r, c] })
          return
        }
        setTableSel({ elementId: id, anchor: [r, c], extent: [r, c] })
        cellDragRef.current = true
        const stop = () => {
          cellDragRef.current = false
          window.removeEventListener('pointerup', stop)
          window.removeEventListener('pointercancel', stop)
        }
        window.addEventListener('pointerup', stop)
        window.addEventListener('pointercancel', stop)
      },
      onCellPointerEnter: (r, c) => {
        if (cellDragRef.current && tableSel && tableSel.elementId === id) {
          setTableSel({ ...tableSel, extent: [r, c] })
        }
      },
      onCellDoubleClick: (r, c) => {
        setEditingCell({ elementId: id, r, c })
        dispatch({ type: 'START_TEXT_EDIT', id })
      },
      onCellCommit: (r, c, html) => commitCell(el, r, c, html),
      onCellTab: (r, c, backward) => {
        const anchors = flattenAnchors(el)
        const idx = anchors.findIndex((a) => a.r === r && a.c === c)
        const nextIdx = backward ? idx - 1 : idx + 1
        if (nextIdx < 0) return
        if (nextIdx >= anchors.length) {
          // 마지막 셀 Tab = 행 추가 후 새 행 첫 앵커 편집.
          // Critical 보정 2: 같은 동기 틱에서 방금 commitCell이 커밋한 doc(pendingDocRef)이
          // 있으면 그 위에 insertRow를 적용한다 — 스테일 doc(prop)을 기반으로 하면 방금
          // 커밋된 셀 내용이 두 번째 APPLY_DOC에 의해 덮여 사라진다.
          const base = pendingDocRef.current ?? doc
          const grown = insertRow(base, slide.id, el.id, el.rows.length)
          pendingDocRef.current = grown
          dispatch({ type: 'APPLY_DOC', doc: grown })
          setEditingCell({ elementId: id, r: el.rows.length, c: 0 })
          // Critical 보정 1: 다음 셀 편집으로 넘어갈 때도 START_TEXT_EDIT을 재발화해야
          // editingTextId가 유지되어 useShortcuts의 단축키 억제가 계속 적용된다 — 안 하면
          // 다음 셀에서의 Backspace가 표 요소 자체를 삭제해버린다.
          dispatch({ type: 'START_TEXT_EDIT', id })
          return
        }
        const next = anchors[nextIdx]!
        setEditingCell({ elementId: id, r: next.r, c: next.c })
        dispatch({ type: 'START_TEXT_EDIT', id })
      },
      onColBorderPointerDown: (e, leftCol) => beginColResize(e, el, leftCol),
    }
  }

  const beginColResize = (e: ReactPointerEvent, el: TableElement, leftCol: number) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const orig = el.colWidths
    const pairPct = orig[leftCol]! + orig[leftCol + 1]!
    const docAtStart = doc
    const g: ColResizeGesture = { kind: 'colresize', slideId: slide.id, id: el.id, widths: orig, resized: false }
    const onMove = (ev: PointerEvent) => {
      const dxPct = (((ev.clientX - startX) / scaleRef.current) / el.frame.width) * 100
      const left = Math.max(5, Math.min(pairPct - 5, orig[leftCol]! + dxPct))
      const widths = [...orig]
      widths[leftCol] = Math.round(left * 100) / 100
      widths[leftCol + 1] = Math.round((pairPct - left) * 100) / 100
      g.widths = widths
      g.resized = true
      setGesture({ ...g })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (g.resized) dispatch({ type: 'APPLY_DOC', doc: setColWidths(docAtStart, g.slideId, g.id, g.widths) })
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
      onPointerDown={() => {
        if (!editingTextId) dispatch({ type: 'CLEAR_SELECTION' })
      }}
    >
      <div className="canvas-scroll" ref={ref}>
        <div className="canvas-stage-box" style={{ width: doc.slideWidth * scale, height: doc.slideHeight * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <div className="slide-stage" style={{ position: 'relative', width: doc.slideWidth, height: doc.slideHeight }}>
              <SlideView
                slide={previewSlide}
                width={doc.slideWidth}
                height={doc.slideHeight}
                themeVars={themeVars}
                interaction={{ selectedIds, editingTextId, onElementPointerDown, onElementDoubleClick, onTextCommit, tableFor }}
              />
              <SelectionOverlay
                slide={previewSlide}
                selectedIds={selectedIds}
                guides={gesture && (gesture.kind === 'move' || gesture.kind === 'resize') ? gesture.guides : []}
                resize={
                  singleSelected && editingTextId !== singleSelected.id
                    ? { elementId: singleSelected.id, onHandlePointerDown: beginResize, onRotatePointerDown: beginRotate }
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      </div>
      <div className="zoom-control" onPointerDown={(e) => e.stopPropagation()}>
        <select
          aria-label="확대 비율"
          value={zoom === 'fit' ? 'fit' : String(zoom)}
          onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}
        >
          <option value="fit">맞춤</option>
          {ZOOM_LEVELS.map((l) => (
            <option key={l} value={l}>{Math.round(l * 100)}%</option>
          ))}
        </select>
      </div>
    </main>
  )
}
