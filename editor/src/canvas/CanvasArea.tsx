import { useEffect, useRef, useState } from 'react'
import type { DeckDoc } from '../model/types.ts'
import { SlideView } from './SlideView.tsx'
import { extractThemeVars } from './styleFromModel.ts'

const MARGIN = 48

export function CanvasArea({ doc, slideIndex }: { doc: DeckDoc; slideIndex: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    function fit() {
      const area = ref.current
      if (!area || !area.clientWidth || !area.clientHeight) return
      const scaleX = (area.clientWidth - MARGIN) / doc.slideWidth
      const scaleY = (area.clientHeight - MARGIN) / doc.slideHeight
      setScale(Math.max(0.1, Math.min(1, scaleX, scaleY)))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [doc.slideWidth, doc.slideHeight])

  const slide = doc.slides[slideIndex]
  if (!slide) return null
  const themeVars = extractThemeVars(doc.headExtra)
  return (
    <main className="canvas-area" ref={ref}>
      <div style={{ width: doc.slideWidth * scale, height: doc.slideHeight * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <SlideView slide={slide} width={doc.slideWidth} height={doc.slideHeight} themeVars={themeVars} />
        </div>
      </div>
    </main>
  )
}
