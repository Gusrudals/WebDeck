import { serializeInlineStyle } from './style.ts'
import type { DeckDoc, KnownElement, Slide, SlideElement } from './types.ts'

export function serializeWebdeck(doc: DeckDoc): string {
  const htmlAttrs = Object.entries(doc.htmlAttrs)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join('')
  const slides = doc.slides.map(serializeSlide).join('\n\n')
  const bodyScript = doc.bodyScript ? `\n${doc.bodyScript}` : ''

  return `<!DOCTYPE html>
<html${htmlAttrs}>
<head>
<meta charset="utf-8">
<title>${escapeText(doc.title)}</title>
${doc.headExtra}
</head>
<body>
<main class="deck" data-slide-width="${doc.slideWidth}" data-slide-height="${doc.slideHeight}">

${slides}

</main>${bodyScript}
</body>
</html>
`
}

function serializeSlide(slide: Slide): string {
  const bg = slide.bg === null ? '' : ` data-bg="${escapeAttr(slide.bg)}"`
  const els = slide.elements.map((el) => `    ${serializeElement(el)}`).join('\n')
  const body = els ? `\n${els}\n  ` : '\n  '
  return `  <section class="slide"${bg}>${body}</section>`
}

function serializeElement(el: SlideElement): string {
  if (el.type === 'opaque') return el.html
  const style = elementStyle(el)
  const attrs = extraAttrsSuffix(el)
  switch (el.type) {
    case 'text':
      return `<div class="el el-text" style="${escapeAttr(style)}"${attrs}>${el.html}</div>`
    case 'image': {
      const imgStyle = el.imgStyle ? ` style="${escapeAttr(el.imgStyle)}"` : ''
      return `<div class="el el-image" style="${escapeAttr(style)}"${attrs}><img src="${escapeAttr(el.src)}" alt="${escapeAttr(el.alt)}"${imgStyle}></div>`
    }
    case 'shape':
      return `<div class="el el-shape" data-shape="rect" style="${escapeAttr(style)}"${attrs}></div>`
  }
}

function elementStyle(el: KnownElement): string {
  const { left, top, width, height } = el.frame
  const frame = `left:${left}px; top:${top}px; width:${width}px; height:${height}px;`
  const extra = serializeInlineStyle(el.extraStyle)
  return extra ? `${frame} ${extra}` : frame
}

function extraAttrsSuffix(el: KnownElement): string {
  return Object.entries(el.extraAttrs)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join('')
}

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeAttr(text: string): string {
  return escapeText(text).replaceAll('"', '&quot;')
}
