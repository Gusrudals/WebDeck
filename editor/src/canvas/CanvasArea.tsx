import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent } from 'react'
import type { TableSel } from '../App.tsx'
import { LINEAR_INSERT_FRAME, PATH_INSERT_FRAME, addElement, createShape, moveElement, setElementFrame, setElementRotation, setShapePoints, setTextHtml } from '../model/ops.ts'
import {
  absPointsOf,
  curveFromDrag,
  elbowFromDrag,
  lineFromEndpoints,
  moveElbowEndpoint,
  moveElbowSegment,
  normalizePoints,
  segmentAxis,
} from '../model/pathOps.ts'
import { isLinear, isPath, isStroke } from '../model/shapeSvg.ts'
import type { StrokeKind } from '../model/shapeSvg.ts'
import { flattenAnchors, insertRow, setCellHtml, setColWidths } from '../model/tableOps.ts'
import type { DeckDoc, Frame, Point, ShapeElement, TableElement } from '../model/types.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'
import { angleFromCenter, buildSnapTargets, resizeFrame, snapAngle, snapMove, snapResize } from './geometry.ts'
import type { Guide, ResizeHandle, SnapTargets } from './geometry.ts'
import { SelectionOverlay } from './SelectionOverlay.tsx'
import type { PointHandleSpec, PointsInteraction } from './SelectionOverlay.tsx'
import { SlideView } from './SlideView.tsx'
import { extractThemeVars } from './styleFromModel.ts'
import type { TableInteraction } from './TableView.tsx'

const MARGIN = 48
const DRAG_THRESHOLD = 3
const DRAW_MIN_DIST = 8

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

interface PointsGesture {
  kind: 'points'
  slideId: string
  id: string
  frame: Frame
  points: Point[]
  changed: boolean
}

interface LineEndGesture {
  kind: 'lineend'
  slideId: string
  id: string
  frame: Frame
  rotation: number
  changed: boolean
}

type Gesture = MoveGesture | ResizeGesture | RotateGesture | ColResizeGesture | PointsGesture | LineEndGesture

export interface CanvasAreaProps {
  doc: DeckDoc
  slideIndex: number
  selectedIds: string[]
  editingTextId: string | null
  dispatch: Dispatch<EditorAction>
  tableSel: TableSel | null
  setTableSel: (s: TableSel | null) => void
  drawMode: StrokeKind | null
  setDrawMode: (m: StrokeKind | null) => void
  idGen: () => string
}

export function CanvasArea({
  doc,
  slideIndex,
  selectedIds,
  editingTextId,
  dispatch,
  tableSel,
  setTableSel,
  drawMode,
  setDrawMode,
  idGen,
}: CanvasAreaProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(1)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const scale = zoom === 'fit' ? fitScale : zoom
  const scaleRef = useRef(1)
  scaleRef.current = scale
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [editingCell, setEditingCell] = useState<{ elementId: string; r: number; c: number } | null>(null)
  const cellDragRef = useRef(false)
  const [drawDraft, setDrawDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
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

  useEffect(() => {
    if (!drawMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawMode(null)
    }
    const onOutside = (e: PointerEvent) => {
      // 툴바·패널 등 캔버스 밖 조작 = 모드 취소 (스펙 §5). 캡처 — 요소 제스처 stopPropagation 면역
      if (!(e.target as HTMLElement | null)?.closest?.('.canvas-area')) setDrawMode(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onOutside, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onOutside, true)
    }
  }, [drawMode, setDrawMode])

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
    if (gesture.kind === 'points') {
      if (!gesture.changed) return doc
      return setShapePoints(doc, gesture.slideId, gesture.id, gesture.frame, gesture.points)
    }
    if (gesture.kind === 'lineend') {
      if (!gesture.changed) return doc
      return setElementRotation(setElementFrame(doc, gesture.slideId, gesture.id, gesture.frame), gesture.slideId, gesture.id, gesture.rotation)
    }
    if (!gesture.resized) return doc
    return setElementFrame(doc, gesture.slideId, gesture.id, gesture.frame)
  }, [doc, gesture])

  const slide = doc.slides[slideIndex]
  if (!slide) return null

  const beginDraw = (e: ReactPointerEvent) => {
    const kind = drawMode
    if (!kind) return
    e.preventDefault()
    const stage = ref.current?.querySelector('.slide-stage')
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const toDoc = (cx: number, cy: number) =>
      [(cx - rect.left) / scaleRef.current, (cy - rect.top) / scaleRef.current] as const
    const [x1, y1] = toDoc(e.clientX, e.clientY)
    const current = { x1, y1, x2: x1, y2: y1 }
    setDrawDraft({ ...current })
    const onMove = (ev: PointerEvent) => {
      let [x2, y2] = toDoc(ev.clientX, ev.clientY)
      if (ev.shiftKey && (kind === 'line' || kind === 'arrow')) {
        // Shift = 15° 각도 스냅 — 끝점을 스냅 각도 방향으로 같은 거리에 재투영. elbow/curve는 스냅하지 않는다(9d §4)
        const dist = Math.hypot(x2 - x1, y2 - y1)
        const snapped = ((Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI / 15) * 15) * Math.PI) / 180
        x2 = x1 + dist * Math.cos(snapped)
        y2 = y1 + dist * Math.sin(snapped)
      }
      current.x2 = x2
      current.y2 = y2
      setDrawDraft({ ...current })
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      setDrawDraft(null)
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        cleanup()
        setDrawMode(null)
      }
    }
    const onUp = () => {
      cleanup()
      setDrawMode(null)
      const p1: [number, number] = [x1, y1]
      const p2: [number, number] = [current.x2, current.y2]
      const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
      if (dist < DRAW_MIN_DIST) {
        // 클릭 폴백 — 기본 도형 삽입 (스펙 §5·9d §4)
        const el = isPath(kind)
          ? createShape(idGen, kind, PATH_INSERT_FRAME)
          : createShape(idGen, kind, LINEAR_INSERT_FRAME)
        dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
        return
      }
      if (isPath(kind)) {
        const { frame, points } = kind === 'elbow' ? elbowFromDrag(p1, p2) : curveFromDrag(p1, p2)
        const el = { ...createShape(idGen, kind, frame), points }
        dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
        return
      }
      const { frame, rotation } = lineFromEndpoints(p1, p2, LINEAR_INSERT_FRAME.height)
      const el = { ...createShape(idGen, kind, frame), rotation }
      dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
    }
    const onCancel = () => {
      cleanup()
      setDrawMode(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
  }

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

  // 선언 순서 주의(TDZ): 아래 pointsInteraction IIFE(strokeSel 계산부 근처)가 beginPointDrag를
  // 즉시 참조하므로 toDocPoint·attachDrag·beginPointDrag는 그 계산보다 텍스트상 먼저 와야 한다.
  // 순서를 지키지 않으면 const TDZ로 인해 stroke 도형 선택 시 렌더 중 크래시한다 (Plan 9d Task 5).
  const toDocPoint = (ev: { clientX: number; clientY: number }): [number, number] => {
    const stage = ref.current?.querySelector('.slide-stage')
    const rect = stage?.getBoundingClientRect() ?? { left: 0, top: 0 }
    return [(ev.clientX - rect.left) / scaleRef.current, (ev.clientY - rect.top) / scaleRef.current]
  }

  const attachDrag = (onMove: (ev: PointerEvent) => void, onEnd: () => void) => {
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      onEnd()
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

  const beginPointDrag = (e: ReactPointerEvent, key: string) => {
    e.stopPropagation()
    e.preventDefault()
    const el = strokeSel
    if (!el) return
    const docAtStart = doc
    if (!isPath(el.shape)) {
      // line/arrow 끝점: 반대 끝 고정, frame+rotation 재계산 (9c 수학 = lineFromEndpoints)
      const cx = el.frame.left + el.frame.width / 2
      const cy = el.frame.top + el.frame.height / 2
      const rad = (el.rotation * Math.PI) / 180
      const hx = (el.frame.width / 2) * Math.cos(rad)
      const hy = (el.frame.width / 2) * Math.sin(rad)
      const movingStart = key === 'pt-0'
      const fixed: [number, number] = movingStart ? [cx + hx, cy + hy] : [cx - hx, cy - hy]
      const g: LineEndGesture = { kind: 'lineend', slideId: slide.id, id: el.id, frame: el.frame, rotation: el.rotation, changed: false }
      const onMove = (ev: PointerEvent) => {
        let [mx, my] = toDocPoint(ev)
        if (ev.shiftKey) {
          const dist = Math.hypot(mx - fixed[0], my - fixed[1])
          const snapped = ((Math.round((Math.atan2(my - fixed[1], mx - fixed[0]) * 180) / Math.PI / 15) * 15) * Math.PI) / 180
          mx = fixed[0] + dist * Math.cos(snapped)
          my = fixed[1] + dist * Math.sin(snapped)
        }
        const moving: [number, number] = [mx, my]
        const { frame, rotation } = movingStart
          ? lineFromEndpoints(moving, fixed, el.frame.height)
          : lineFromEndpoints(fixed, moving, el.frame.height)
        g.frame = frame
        g.rotation = rotation
        g.changed = true
        setGesture({ ...g })
      }
      attachDrag(onMove, () => {
        if (g.changed) {
          dispatch({
            type: 'APPLY_DOC',
            doc: setElementRotation(setElementFrame(docAtStart, g.slideId, g.id, g.frame), g.slideId, g.id, g.rotation),
          })
        }
        setGesture(null)
      })
      return
    }
    const absStart = absPointsOf(el.frame, el.points)
    const startPointer = toDocPoint(e.nativeEvent)
    const g: PointsGesture = { kind: 'points', slideId: slide.id, id: el.id, frame: el.frame, points: el.points, changed: false }
    const onMove = (ev: PointerEvent) => {
      const [mx, my] = toDocPoint(ev)
      let abs = absStart
      if (key === 'pt-0' || key === `pt-${absStart.length - 1}`) {
        if (el.shape === 'elbow') {
          abs = moveElbowEndpoint(absStart, key === 'pt-0' ? 'start' : 'end', [mx, my])
        } else {
          abs = absStart.map((p, i) => (i === (key === 'pt-0' ? 0 : absStart.length - 1) ? [mx, my] as [number, number] : p))
        }
      } else if (key.startsWith('pt-')) {
        const idx = Number(key.slice(3))
        abs = absStart.map((p, i) => (i === idx ? [mx, my] as [number, number] : p))
      } else {
        const seg = Number(key.slice(4))
        abs = moveElbowSegment(absStart, seg, mx - startPointer[0], my - startPointer[1])
      }
      const norm = normalizePoints(abs)
      g.frame = norm.frame
      g.points = norm.points
      g.changed = true
      setGesture({ ...g })
    }
    attachDrag(onMove, () => {
      if (g.changed) dispatch({ type: 'APPLY_DOC', doc: setShapePoints(docAtStart, g.slideId, g.id, g.frame, g.points) })
      setGesture(null)
    })
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
      // 브리프 보정(Task 10 리뷰 이월): 이웃 두 열의 폭 합(pairPct)이 10% 미만이면 고정 5%
      // 클램프의 하한(5)이 상한(pairPct-5)보다 커져 좌측이 항상 5로 강제되고 우측이 음수가
      // 된다(예: pairPct=4.444 → 우측 -0.556). lo를 pairPct의 절반으로도 캡해 두 열이 항상
      // 음이 아니게(좁은 쌍은 반씩 나눠) 만든다.
      const lo = Math.min(5, pairPct / 2)
      const left = Math.max(lo, Math.min(pairPct - lo, orig[leftCol]! + dxPct))
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
  const strokeSel =
    singleSelected && singleSelected.type === 'shape' && isStroke(singleSelected.shape) && !drawMode && editingTextId === null
      ? singleSelected
      : undefined
  // 제스처 미리보기 중에는 미리보기 요소 기준으로 핸들 위치 갱신
  const strokePreview =
    strokeSel && previewSlide.elements.filter(isKnownElement).find((el): el is ShapeElement => el.id === strokeSel.id && el.type === 'shape')
  const pointsInteraction: PointsInteraction | undefined = (() => {
    const el = strokePreview
    if (!el) return undefined
    if (isPath(el.shape)) {
      if (el.rotation !== 0) return undefined
      const abs = absPointsOf(el.frame, el.points)
      const handles: PointHandleSpec[] = []
      const first = abs[0]
      const last = abs[abs.length - 1]
      if (!first || !last) return undefined
      handles.push({ key: 'pt-0', x: first[0], y: first[1], cursor: 'move' })
      handles.push({ key: `pt-${abs.length - 1}`, x: last[0], y: last[1], cursor: 'move' })
      const guides: PointsInteraction['guides'] = []
      if (el.shape === 'curve') {
        const c1 = abs[1]
        const c2 = abs[2]
        if (c1 && c2) {
          handles.push({ key: 'pt-1', x: c1[0], y: c1[1], cursor: 'move' })
          handles.push({ key: 'pt-2', x: c2[0], y: c2[1], cursor: 'move' })
          guides.push({ x1: first[0], y1: first[1], x2: c1[0], y2: c1[1] })
          guides.push({ x1: last[0], y1: last[1], x2: c2[0], y2: c2[1] })
        }
      } else {
        for (let s = 1; s < abs.length - 2; s++) {
          const a = abs[s]
          const b = abs[s + 1]
          if (!a || !b) continue
          const axis = segmentAxis([a[0], a[1]], [b[0], b[1]])
          if (axis === null) continue // 비직교 세그먼트는 핸들 미제공 (스펙 9d §7)
          handles.push({
            key: `seg-${s}`,
            x: (a[0] + b[0]) / 2,
            y: (a[1] + b[1]) / 2,
            cursor: axis === 'h' ? 'ns-resize' : 'ew-resize',
          })
        }
      }
      return { guides, handles, onPointerDown: beginPointDrag }
    }
    // line/arrow — 회전 반영 끝점 (rotation ≠ 0에서도 동작, 스펙 9d §5)
    const cx = el.frame.left + el.frame.width / 2
    const cy = el.frame.top + el.frame.height / 2
    const rad = (el.rotation * Math.PI) / 180
    const hx = (el.frame.width / 2) * Math.cos(rad)
    const hy = (el.frame.width / 2) * Math.sin(rad)
    return {
      guides: [],
      handles: [
        { key: 'pt-0', x: cx - hx, y: cy - hy, cursor: 'move' },
        { key: 'pt-1', x: cx + hx, y: cy + hy, cursor: 'move' },
      ],
      onPointerDown: beginPointDrag,
    }
  })()
  return (
    <main
      className={drawMode ? 'canvas-area drawing' : 'canvas-area'}
      onPointerDown={(e) => {
        if (drawMode) {
          beginDraw(e)
          return
        }
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
                interaction={
                  drawMode
                    ? undefined
                    : { selectedIds, editingTextId, onElementPointerDown, onElementDoubleClick, onTextCommit, tableFor }
                }
              />
              <SelectionOverlay
                slide={previewSlide}
                selectedIds={selectedIds}
                guides={gesture && (gesture.kind === 'move' || gesture.kind === 'resize') ? gesture.guides : []}
                resize={
                  // 그리기 모드 중엔 핸들도 비활성 — 핸들의 stopPropagation이 beginDraw 도달을
                  // 막아 직전에 그려 자동 선택된 요소가 의도치 않게 리사이즈/회전되는 결함 방지.
                  // line/arrow는 8핸들·회전 핸들을 전용 끝점 핸들 2개로 대체한다 (Plan 9d Task 5).
                  !drawMode && singleSelected && editingTextId !== singleSelected.id &&
                  !(singleSelected.type === 'shape' && isLinear(singleSelected.shape))
                    ? { elementId: singleSelected.id, onHandlePointerDown: beginResize, onRotatePointerDown: beginRotate }
                    : undefined
                }
                points={pointsInteraction}
              />
              {drawDraft && (
                <svg className="draw-preview" width={doc.slideWidth} height={doc.slideHeight}>
                  {(() => {
                    const p1: [number, number] = [drawDraft.x1, drawDraft.y1]
                    const p2: [number, number] = [drawDraft.x2, drawDraft.y2]
                    const common = { stroke: '#374151', strokeWidth: 2, strokeDasharray: '4 3', fill: 'none' } as const
                    if (drawMode === 'elbow') {
                      const { frame, points } = elbowFromDrag(p1, p2)
                      const abs = absPointsOf(frame, points)
                      return <polyline points={abs.map(([x, y]) => `${x},${y}`).join(' ')} {...common} />
                    }
                    if (drawMode === 'curve') {
                      const { frame, points } = curveFromDrag(p1, p2)
                      const [a, b, c, d] = absPointsOf(frame, points)
                      if (!a || !b || !c || !d) return null
                      return <path d={`M ${a[0]},${a[1]} C ${b[0]},${b[1]} ${c[0]},${c[1]} ${d[0]},${d[1]}`} {...common} />
                    }
                    return <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} {...common} />
                  })()}
                </svg>
              )}
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
