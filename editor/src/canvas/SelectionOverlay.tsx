import type { Slide } from '../model/types.ts'
import { isKnownElement } from '../model/types.ts'
import type { Guide } from './geometry.ts'

export function SelectionOverlay({
  slide,
  selectedIds,
  guides,
}: {
  slide: Slide
  selectedIds: string[]
  guides: Guide[]
}) {
  const selected = slide.elements.filter(isKnownElement).filter((el) => selectedIds.includes(el.id))
  return (
    <div className="selection-overlay">
      {selected.map((el) => (
        <div
          key={el.id}
          className="selection-box"
          style={{ left: el.frame.left, top: el.frame.top, width: el.frame.width, height: el.frame.height }}
        />
      ))}
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
