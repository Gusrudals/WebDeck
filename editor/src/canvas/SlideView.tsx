import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Slide } from '../model/types.ts'
import { ElementView } from './ElementView.tsx'

export interface SlideInteraction {
  selectedIds: string[]
  editingTextId: string | null
  onElementPointerDown: (e: ReactPointerEvent, id: string) => void
}

export function SlideView({
  slide,
  width,
  height,
  themeVars,
  interaction,
}: {
  slide: Slide
  width: number
  height: number
  themeVars: Record<string, string>
  interaction?: SlideInteraction
}) {
  return (
    <section
      className={interaction ? 'slide-view editable' : 'slide-view'}
      style={{ width: `${width}px`, height: `${height}px`, background: slide.bg ?? '#ffffff', ...themeVars }}
    >
      {slide.elements.map((el) => (
        <ElementView
          key={el.id}
          element={el}
          interaction={
            interaction && el.type !== 'opaque'
              ? {
                  selected: interaction.selectedIds.includes(el.id),
                  editing: interaction.editingTextId === el.id,
                  onPointerDown: (e) => interaction.onElementPointerDown(e, el.id),
                }
              : undefined
          }
        />
      ))}
    </section>
  )
}
