import type { SlideElement } from '../model/types.ts'
import { cssTextToReact, styleFromModel } from './styleFromModel.ts'

export function ElementView({ element }: { element: SlideElement }) {
  switch (element.type) {
    case 'text':
      return (
        <div
          className="el el-text"
          style={styleFromModel(element.frame, element.extraStyle)}
          dangerouslySetInnerHTML={{ __html: element.html }}
        />
      )
    case 'image':
      return (
        <div className="el el-image" style={styleFromModel(element.frame, element.extraStyle)}>
          <img src={element.src} alt={element.alt} style={cssTextToReact(element.imgStyle)} />
        </div>
      )
    case 'shape':
      return <div className="el el-shape" style={styleFromModel(element.frame, element.extraStyle)} />
    case 'opaque':
      return <div className="el-opaque" dangerouslySetInnerHTML={{ __html: element.html }} />
  }
}
