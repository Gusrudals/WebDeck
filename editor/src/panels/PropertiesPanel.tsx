import { useRef, useState } from 'react'
import type { Dispatch } from 'react'
import { MIN_SIZE } from '../canvas/geometry.ts'
import { setElementFrame, setElementStyle, setSlideNotes, setSlideTransition } from '../model/ops.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction, EditorState } from '../state/store.ts'
import type { Frame } from '../model/types.ts'
import { ColorPopover } from './ColorPopover.tsx'
import { SlideBgSection } from './SlideBgSection.tsx'
import { ThemeSection } from './ThemeSection.tsx'

const BORDER_PATTERN = /^(\d+)px (solid|dashed) (\S+)$/
const SHADOW_SOFT = '0 2px 6px rgba(0,0,0,0.25)'
const SHADOW_STRONG = '0 6px 16px rgba(0,0,0,0.35)'

/** '1px solid #000' 형태만 인식 — 그 외 값은 null(사용자 지정 보존) */
function parseBorder(value: string | undefined): { width: number; style: 'solid' | 'dashed'; color: string } | null {
  if (!value) return null
  const m = BORDER_PATTERN.exec(value)
  if (!m) return null
  return { width: Number(m[1]), style: m[2] as 'solid' | 'dashed', color: m[3]! }
}

export function PropertiesPanel({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const { doc, currentSlideIndex, selectedIds } = state
  /** 투명도 슬라이더 조작 중 임시값 — pointerup/blur에서 1회 커밋 */
  const [opacityDraft, setOpacityDraft] = useState<string | null>(null)
  /** 노트 드래프트 — 슬라이드 id를 함께 저장해 슬라이드 전환 시 다른 슬라이드에 커밋되는 것을 방지 */
  const [notesDraft, setNotesDraft] = useState<{ slideId: string; text: string } | null>(null)
  /** Escape 취소 플래그 — blur 핸들러가 취소를 커밋으로 오인하지 않게 ref로 전달 */
  const notesEscRef = useRef(false)
  const slide = doc?.slides[currentSlideIndex] ?? null
  if (!doc || !slide) return <aside className="props" aria-label="속성" />
  const selectedKnown = slide.elements.filter(isKnownElement).filter((el) => selectedIds.includes(el.id))

  if (selectedKnown.length === 0) {
    return (
      <aside className="props" aria-label="속성">
        <ThemeSection doc={doc} dispatch={dispatch} />
        <h2>슬라이드</h2>
        <SlideBgSection key={slide.id} doc={doc} slide={slide} dispatch={dispatch} />
        <label className="prop-row">
          전환 효과
          <select
            aria-label="전환 효과"
            value={slide.transition ?? 'none'}
            onChange={(e) => {
              const v = e.target.value === 'none' ? null : (e.target.value as 'fade' | 'push')
              if (v !== slide.transition || 'data-transition' in slide.extraAttrs) {
                dispatch({ type: 'APPLY_DOC', doc: setSlideTransition(doc, slide.id, v) })
              }
            }}
          >
            <option value="none">없음</option>
            <option value="fade">페이드</option>
            <option value="push">밀기</option>
          </select>
        </label>
        <label className="prop-col">
          노트
          <textarea
            aria-label="노트"
            rows={6}
            value={notesDraft?.slideId === slide.id ? notesDraft.text : slide.notes}
            onChange={(e) => setNotesDraft({ slideId: slide.id, text: e.target.value })}
            onBlur={() => {
              const cancelled = notesEscRef.current
              notesEscRef.current = false
              if (!cancelled && notesDraft?.slideId === slide.id && notesDraft.text !== slide.notes) {
                dispatch({ type: 'APPLY_DOC', doc: setSlideNotes(doc, slide.id, notesDraft.text) })
              }
              setNotesDraft(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                notesEscRef.current = true
                e.currentTarget.blur()
              }
            }}
          />
        </label>
      </aside>
    )
  }

  const first = selectedKnown[0] ?? null
  const applyStyle = (patch: Record<string, string | null>) => {
    let d = doc
    for (const el of selectedKnown) d = setElementStyle(d, slide.id, el.id, patch)
    dispatch({ type: 'APPLY_DOC', doc: d })
  }
  const rawOpacity = first ? Number(first.extraStyle['opacity'] ?? '1') : 1
  const safeOpacity = Number.isFinite(rawOpacity) ? Math.min(1, Math.max(0, rawOpacity)) : 1
  const opacityShown = opacityDraft ?? String(Math.round((1 - safeOpacity) * 100))
  const commitOpacity = () => {
    if (opacityDraft === null) return
    const t = Math.max(0, Math.min(100, Number(opacityDraft)))
    setOpacityDraft(null)
    if (!Number.isFinite(t)) return
    applyStyle({ opacity: t === 0 ? null : String(Math.round((1 - t / 100) * 100) / 100) })
  }
  const border = first ? parseBorder(first.extraStyle['border']) : null

  return (
    <aside className="props" aria-label="속성">
      <h2>{selectedKnown.length === 1 ? '요소' : `요소 ${selectedKnown.length}개`}</h2>
      {selectedKnown.length === 1 && (() => {
        const el = selectedKnown[0]!
        const commitFrame = (patch: Partial<Frame>) => {
          const next = { ...el.frame, ...patch }
          next.width = Math.max(MIN_SIZE, next.width)
          next.height = Math.max(MIN_SIZE, next.height)
          if (
            next.left === el.frame.left && next.top === el.frame.top &&
            next.width === el.frame.width && next.height === el.frame.height
          ) return
          dispatch({ type: 'APPLY_DOC', doc: setElementFrame(doc, slide.id, el.id, next) })
        }
        return (
          <section aria-label="위치와 크기">
            <NumberField key={`${el.id}-x`} label="X" value={el.frame.left} onCommit={(v) => commitFrame({ left: v })} />
            <NumberField key={`${el.id}-y`} label="Y" value={el.frame.top} onCommit={(v) => commitFrame({ top: v })} />
            <NumberField key={`${el.id}-w`} label="너비" value={el.frame.width} onCommit={(v) => commitFrame({ width: v })} />
            <NumberField key={`${el.id}-h`} label="높이" value={el.frame.height} onCommit={(v) => commitFrame({ height: v })} />
          </section>
        )
      })()}
      {first && (
        <section aria-label="스타일">
          <div className="prop-row">
            채우기
            <ColorPopover
              label="채우기 색"
              value={first.extraStyle['background']}
              onPick={(c) => applyStyle({ background: c })}
              clearLabel="채우기 없음"
              onClear={() => applyStyle({ background: null })}
            />
          </div>
          <label className="prop-row">
            테두리
            <select
              aria-label="테두리 두께"
              value={border ? String(border.width) : '0'}
              onChange={(e) => {
                const w = Number(e.target.value)
                if (w === 0) applyStyle({ border: null })
                else applyStyle({ border: `${w}px ${border?.style ?? 'solid'} ${border?.color ?? '#1f2937'}` })
              }}
            >
              <option value="0">없음</option>
              <option value="1">1px</option>
              <option value="2">2px</option>
              <option value="4">4px</option>
            </select>
          </label>
          {border && (
            <>
              <label className="prop-row">
                테두리 스타일
                <select
                  aria-label="테두리 스타일"
                  value={border.style}
                  onChange={(e) => applyStyle({ border: `${border.width}px ${e.target.value} ${border.color}` })}
                >
                  <option value="solid">실선</option>
                  <option value="dashed">점선</option>
                </select>
              </label>
              <div className="prop-row">
                테두리 색
                <ColorPopover
                  label="테두리 색"
                  value={border.color}
                  onPick={(c) => applyStyle({ border: `${border.width}px ${border.style} ${c}` })}
                />
              </div>
            </>
          )}
          {first.extraStyle['border'] !== undefined && !border && (
            <p className="prop-note">테두리: 사용자 지정 값 보존됨</p>
          )}
          <div className="prop-row">
            그림자
            <span className="btn-row">
              <button type="button" aria-label="그림자 없음" onClick={() => applyStyle({ 'box-shadow': null })}>없음</button>
              <button type="button" aria-label="그림자 약하게" onClick={() => applyStyle({ 'box-shadow': SHADOW_SOFT })}>약하게</button>
              <button type="button" aria-label="그림자 강하게" onClick={() => applyStyle({ 'box-shadow': SHADOW_STRONG })}>강하게</button>
            </span>
          </div>
          <label className="prop-row">
            투명도
            <input
              type="range"
              aria-label="투명도"
              min="0"
              max="100"
              value={opacityShown}
              onChange={(e) => setOpacityDraft(e.target.value)}
              onPointerUp={commitOpacity}
              onBlur={commitOpacity}
            />
            <span className="opacity-value">{opacityShown}%</span>
          </label>
        </section>
      )}
    </aside>
  )
}

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(Math.round(value * 10) / 10)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    setDraft(null)
    if (draft.trim() === '' || !Number.isFinite(n)) return
    onCommit(n)
  }
  return (
    <label className="prop-row">
      {label}
      <input
        className="num"
        aria-label={label}
        inputMode="decimal"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(null)
          }
        }}
      />
    </label>
  )
}
