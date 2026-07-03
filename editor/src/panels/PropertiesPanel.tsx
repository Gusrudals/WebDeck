import { useState } from 'react'
import type { Dispatch } from 'react'
import { setSlideBg } from '../model/ops.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction, EditorState } from '../state/store.ts'

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
      {/* 위치·크기(Task 5), 스타일(Task 6~7) 섹션이 여기에 추가된다 */}
    </aside>
  )
}
