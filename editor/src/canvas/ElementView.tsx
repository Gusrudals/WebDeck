import type { PointerEvent as ReactPointerEvent } from 'react'
import { isLinear, shapeInnerHtml } from '../model/shapeSvg.ts'
import type { SlideElement } from '../model/types.ts'
import { cssTextToReact, styleFromModel } from './styleFromModel.ts'
import { TextEditable } from './TextEditable.tsx'

export interface ElementInteraction {
  selected: boolean
  editing: boolean
  onPointerDown: (e: ReactPointerEvent) => void
  onDoubleClick: () => void
  onTextCommit: (html: string) => void
}

export function ElementView({ element, interaction }: { element: SlideElement; interaction?: ElementInteraction }) {
  const handlers = interaction
    ? { onPointerDown: interaction.onPointerDown, onDoubleClick: interaction.onDoubleClick }
    : {}
  switch (element.type) {
    case 'text': {
      if (interaction?.editing) {
        return (
          <div className="el el-text editing" style={styleFromModel(element.frame, element.extraStyle, element.rotation)}>
            <TextEditable html={element.html} onCommit={interaction.onTextCommit} />
          </div>
        )
      }
      return (
        <div
          className="el el-text"
          style={styleFromModel(element.frame, element.extraStyle, element.rotation)}
          dangerouslySetInnerHTML={{ __html: element.html }}
          {...handlers}
        />
      )
    }
    case 'image':
      return (
        <div className="el el-image" style={styleFromModel(element.frame, element.extraStyle, element.rotation)} {...handlers}>
          <img src={element.src} alt={element.alt} style={cssTextToReact(element.imgStyle)} />
        </div>
      )
    case 'shape':
      if (isLinear(element.shape)) {
        return (
          <div
            className="el el-shape"
            style={styleFromModel(element.frame, element.extraStyle, element.rotation)}
            dangerouslySetInnerHTML={{ __html: shapeInnerHtml(element.shape as 'line' | 'arrow', element.id) }}
            {...handlers}
          />
        )
      }
      return <div className="el el-shape" style={styleFromModel(element.frame, element.extraStyle, element.rotation)} {...handlers} />
    case 'opaque':
      return <div className="el-opaque" dangerouslySetInnerHTML={{ __html: element.html }} />
  }
}
