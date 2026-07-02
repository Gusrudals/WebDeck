import { useState } from 'react'
import { extractThemeVars } from '../canvas/styleFromModel.ts'
import { SlideView } from '../canvas/SlideView.tsx'
import type { DeckDoc } from '../model/types.ts'

const THUMB_WIDTH = 168

export function SlidePanel({
  doc,
  currentIndex,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  canRemove,
  onReorder,
}: {
  doc: DeckDoc
  currentIndex: number
  onSelect: (index: number) => void
  onAdd: () => void
  onDuplicate: () => void
  onRemove: () => void
  canRemove: boolean
  onReorder: (from: number, to: number) => void
}) {
  const themeVars = extractThemeVars(doc.headExtra)
  const scale = THUMB_WIDTH / doc.slideWidth
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  return (
    <nav aria-label="슬라이드 목록">
      <div className="slide-actions">
        <button type="button" onClick={onAdd}>새 슬라이드</button>
        <button type="button" onClick={onDuplicate}>슬라이드 복제</button>
        <button type="button" disabled={!canRemove} onClick={onRemove}>슬라이드 삭제</button>
      </div>
      {doc.slides.map((slide, i) => (
        <button
          key={slide.id}
          type="button"
          className={i === currentIndex ? 'thumb selected' : 'thumb'}
          aria-label={`슬라이드 ${i + 1}`}
          aria-current={i === currentIndex}
          onClick={() => onSelect(i)}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i)
            setDragIndex(null)
          }}
          onDragEnd={() => setDragIndex(null)}
        >
          <div className="thumb-scale" style={{ width: THUMB_WIDTH, height: doc.slideHeight * scale }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <SlideView slide={slide} width={doc.slideWidth} height={doc.slideHeight} themeVars={themeVars} />
            </div>
          </div>
          <span className="thumb-num">{i + 1}</span>
        </button>
      ))}
    </nav>
  )
}
