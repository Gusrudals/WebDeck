import { useState } from 'react'
import type { Dispatch } from 'react'
import { MIN_SIZE } from '../canvas/geometry.ts'
import { setElementFrame, setSlideBg } from '../model/ops.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction, EditorState } from '../state/store.ts'
import type { Frame } from '../model/types.ts'

export function PropertiesPanel({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const { doc, currentSlideIndex, selectedIds } = state
  /** 배경색 피커 조작 중 임시값 — OS 피커 드래그 동안 onChange가 연속 발화하므로 blur 시 1회만 커밋 */
  const [bgDraft, setBgDraft] = useState<string | null>(null)
  const slide = doc?.slides[currentSlideIndex] ?? null
  if (!doc || !slide) return <aside className="props" aria-label="속성" />
  const selectedKnown = slide.elements.filter(isKnownElement).filter((el) => selectedIds.includes(el.id))

  if (selectedKnown.length === 0) {
    const bgValue = slide.bg && /^#[0-9a-fA-F]{6}$/.test(slide.bg) ? slide.bg : '#ffffff'
    return (
      <aside className="props" aria-label="속성">
        <h2>슬라이드</h2>
        <label className="prop-row">
          배경색
          <input
            type="color"
            aria-label="배경색"
            value={bgDraft ?? bgValue}
            onChange={(e) => setBgDraft(e.target.value)}
            onBlur={() => {
              if (bgDraft !== null && bgDraft !== bgValue) {
                dispatch({ type: 'APPLY_DOC', doc: setSlideBg(doc, slide.id, bgDraft) })
              }
              setBgDraft(null)
            }}
          />
        </label>
      </aside>
    )
  }

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
            <NumberField label="X" value={el.frame.left} onCommit={(v) => commitFrame({ left: v })} />
            <NumberField label="Y" value={el.frame.top} onCommit={(v) => commitFrame({ top: v })} />
            <NumberField label="너비" value={el.frame.width} onCommit={(v) => commitFrame({ width: v })} />
            <NumberField label="높이" value={el.frame.height} onCommit={(v) => commitFrame({ height: v })} />
          </section>
        )
      })()}
      {/* 스타일(Task 6~7) 섹션이 여기에 추가된다 */}
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
