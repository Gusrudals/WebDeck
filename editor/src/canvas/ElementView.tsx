import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SlideElement } from '../model/types.ts'
import { cssTextToReact, styleFromModel } from './styleFromModel.ts'

export interface ElementInteraction {
  selected: boolean
  editing: boolean
  onPointerDown: (e: ReactPointerEvent) => void
}

export function ElementView({ element, interaction }: { element: SlideElement; interaction?: ElementInteraction }) {
  const handlers = interaction ? { onPointerDown: interaction.onPointerDown } : {}
  switch (element.type) {
    case 'text':
      return (
        <div
          className="el el-text"
          style={styleFromModel(element.frame, element.extraStyle)}
          dangerouslySetInnerHTML={{ __html: element.html }}
          {...handlers}
        />
      )
    case 'image':
      return (
        <div className="el el-image" style={styleFromModel(element.frame, element.extraStyle)} {...handlers}>
          <img src={element.src} alt={element.alt} style={cssTextToReact(element.imgStyle)} />
        </div>
      )
    case 'shape':
      return <div className="el el-shape" style={styleFromModel(element.frame, element.extraStyle)} {...handlers} />
    case 'opaque':
      return <div className="el-opaque" dangerouslySetInnerHTML={{ __html: element.html }} />
  }
}
