import type { Slide } from '../model/types.ts'
import { ElementView } from './ElementView.tsx'

export function SlideView({
  slide,
  width,
  height,
  themeVars,
}: {
  slide: Slide
  width: number
  height: number
  themeVars: Record<string, string>
}) {
  return (
    <section
      className="slide-view"
      style={{ width: `${width}px`, height: `${height}px`, background: slide.bg ?? '#ffffff', ...themeVars }}
    >
      {slide.elements.map((el) => (
        <ElementView key={el.id} element={el} />
      ))}
    </section>
  )
}
