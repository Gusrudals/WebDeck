import { isLinear, shapeInnerHtml } from './shapeSvg.ts'
import { serializeInlineStyle } from './style.ts'
import { serializeTableInner } from './tableMarkup.ts'
import type { DeckDoc, KnownElement, Slide, SlideElement } from './types.ts'

export function serializeWebdeck(doc: DeckDoc): string {
  const htmlAttrs = attrsString(doc.htmlAttrs)
  const bodyAttrs = attrsString(doc.bodyAttrs)
  const slides = doc.slides.map(serializeSlide).join('\n\n')
  const bodyExtra = doc.bodyExtra ? `\n${doc.bodyExtra}` : ''
  const bodyScript = doc.bodyScript ? `\n${doc.bodyScript}` : ''

  const deckClass = escapeAttr(['deck', ...doc.deckExtraClasses].join(' '))
  const deckExtra = attrsString(doc.deckExtraAttrs)

  return `<!DOCTYPE html>
<html${htmlAttrs}>
<head>
<meta charset="utf-8">
<title>${escapeText(doc.title)}</title>
${doc.headExtra}
</head>
<body${bodyAttrs}>
<main class="${deckClass}" data-slide-width="${doc.slideWidth}" data-slide-height="${doc.slideHeight}"${deckExtra}>

${slides}

</main>${bodyExtra}${bodyScript}
</body>
</html>
`
}

function attrsString(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join('')
}

function serializeSlide(slide: Slide): string {
  const cls = escapeAttr(['slide', ...slide.extraClasses].join(' '))
  const bg = slide.bg === null ? '' : ` data-bg="${escapeAttr(slide.bg)}"`
  const transition = slide.transition === null ? '' : ` data-transition="${escapeAttr(slide.transition)}"`
  const notes = slide.notes === '' ? '' : ` data-notes="${escapeAttr(slide.notes)}"`
  const extra = attrsString(slide.extraAttrs)
  const els = slide.elements.map((el) => `    ${serializeElement(el)}`).join('\n')
  const body = els ? `\n${els}\n  ` : '\n  '
  return `  <section class="${cls}"${bg}${transition}${notes}${extra}>${body}</section>`
}

function elementClass(el: KnownElement): string {
  const base = { text: 'el el-text', image: 'el el-image', shape: 'el el-shape', table: 'el el-table' }[el.type]
  return [base, ...el.extraClasses].join(' ')
}

function serializeElement(el: SlideElement): string {
  if (el.type === 'opaque') return el.html
  const style = elementStyle(el)
  const attrs = extraAttrsSuffix(el)
  switch (el.type) {
    case 'text':
      return `<div class="${escapeAttr(elementClass(el))}" style="${escapeAttr(style)}"${attrs}>${el.html}</div>`
    case 'image': {
      const imgStyle = el.imgStyle ? ` style="${escapeAttr(el.imgStyle)}"` : ''
      return `<div class="${escapeAttr(elementClass(el))}" style="${escapeAttr(style)}"${attrs}><img src="${escapeAttr(el.src)}" alt="${escapeAttr(el.alt)}"${imgStyle}></div>`
    }
    case 'shape': {
      const inner = isLinear(el.shape) ? shapeInnerHtml(el.shape as 'line' | 'arrow', el.id) : ''
      return `<div class="${escapeAttr(elementClass(el))}" data-shape="${el.shape}" style="${escapeAttr(style)}"${attrs}>${inner}</div>`
    }
    case 'table':
      return `<div class="${escapeAttr(elementClass(el))}" style="${escapeAttr(style)}"${attrs}><table style="border-collapse:collapse; width:100%;">${serializeTableInner(el.colWidths, el.rows)}</table></div>`
  }
}

function elementStyle(el: KnownElement): string {
  const { left, top, width, height } = el.frame
  const frame = `left:${left}px; top:${top}px; width:${width}px; height:${height}px;`
  const rotate = el.rotation !== 0 ? ` transform:rotate(${el.rotation}deg);` : ''
  const extra = serializeInlineStyle(el.extraStyle)
  return `${frame}${rotate}${extra ? ` ${extra}` : ''}`
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
