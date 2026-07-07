import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Slide } from '../model/types.ts'
import { isKnownElement } from '../model/types.ts'
import type { Guide, ResizeHandle } from './geometry.ts'
import { RESIZE_HANDLES } from './geometry.ts'

const HANDLE_POS: Record<ResizeHandle, { left: string; top: string }> = {
  nw: { left: '0%', top: '0%' },
  n: { left: '50%', top: '0%' },
  ne: { left: '100%', top: '0%' },
  e: { left: '100%', top: '50%' },
  se: { left: '100%', top: '100%' },
  s: { left: '50%', top: '100%' },
  sw: { left: '0%', top: '100%' },
  w: { left: '0%', top: '50%' },
}

export interface ResizeInteraction {
  elementId: string
  onHandlePointerDown: (e: ReactPointerEvent, handle: ResizeHandle) => void
  onRotatePointerDown: (e: ReactPointerEvent) => void
}

export interface PointHandleSpec {
  key: string // 'pt-0'(끝점/제어점 = points 인덱스) | 'seg-1'(세그먼트 인덱스)
  x: number // 문서 px (slide 좌표)
  y: number
  cursor: 'move' | 'ns-resize' | 'ew-resize'
}

export interface PointsInteraction {
  guides: { x1: number; y1: number; x2: number; y2: number }[] // curve 제어점 점선
  handles: PointHandleSpec[]
  onPointerDown: (e: ReactPointerEvent, key: string) => void
}

export function SelectionOverlay({
  slide,
  selectedIds,
  guides,
  resize,
  points,
}: {
  slide: Slide
  selectedIds: string[]
  guides: Guide[]
  resize?: ResizeInteraction
  points?: PointsInteraction
}) {
  const selected = slide.elements.filter(isKnownElement).filter((el) => selectedIds.includes(el.id))
  return (
    <div className="selection-overlay">
      {selected.map((el) => (
        <div
          key={el.id}
          className="selection-box"
          style={{
            left: el.frame.left,
            top: el.frame.top,
            width: el.frame.width,
            height: el.frame.height,
            transform: el.rotation !== 0 ? `rotate(${el.rotation}deg)` : undefined,
          }}
        >
          {resize?.elementId === el.id && (
            <>
              {el.rotation === 0 &&
                RESIZE_HANDLES.map((h) => (
                  <div
                    key={h}
                    className={`handle handle-${h}`}
                    style={HANDLE_POS[h]}
                    onPointerDown={(e) => resize.onHandlePointerDown(e, h)}
                  />
                ))}
              <div
                className="handle handle-rotate"
                role="button"
                aria-label="회전"
                onPointerDown={(e) => resize.onRotatePointerDown(e)}
              />
            </>
          )}
        </div>
      ))}
      {points && (
        <>
          {points.guides.map((g, i) => (
            <svg key={`pg-${i}`} className="point-guide-svg">
              <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} className="point-guide" />
            </svg>
          ))}
          {points.handles.map((h) => (
            <div
              key={h.key}
              className="point-handle"
              role="button"
              aria-label={`점 핸들 ${h.key}`}
              style={{ left: h.x, top: h.y, cursor: h.cursor }}
              onPointerDown={(e) => points.onPointerDown(e, h.key)}
            />
          ))}
        </>
      )}
      {guides.map((g, i) => (
        <div
          key={`${g.axis}-${g.position}-${i}`}
          className={g.axis === 'x' ? 'snap-guide snap-guide-x' : 'snap-guide snap-guide-y'}
          style={g.axis === 'x' ? { left: g.position } : { top: g.position }}
        />
      ))}
    </div>
  )
}
