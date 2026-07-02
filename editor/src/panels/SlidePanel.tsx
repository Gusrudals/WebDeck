import { extractThemeVars } from '../canvas/styleFromModel.ts'
import { SlideView } from '../canvas/SlideView.tsx'
import type { DeckDoc } from '../model/types.ts'

const THUMB_WIDTH = 168

export function SlidePanel({
  doc,
  currentIndex,
  onSelect,
}: {
  doc: DeckDoc
  currentIndex: number
  onSelect: (index: number) => void
}) {
  const themeVars = extractThemeVars(doc.headExtra)
  const scale = THUMB_WIDTH / doc.slideWidth
  return (
    <nav aria-label="슬라이드 목록">
      {doc.slides.map((slide, i) => (
        <button
          key={slide.id}
          type="button"
          className={i === currentIndex ? 'thumb selected' : 'thumb'}
          aria-label={`슬라이드 ${i + 1}`}
          aria-current={i === currentIndex}
          onClick={() => onSelect(i)}
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
