import { createIdGen } from './id.ts'
import { parseInlineStyle } from './style.ts'
import type { DeckDoc, Frame, Slide, SlideElement } from './types.ts'

export class WebdeckParseError extends Error {}

export interface ParseOptions {
  idGen?: () => string
}

const FRAME_PROPS = ['left', 'top', 'width', 'height'] as const
const PX_VALUE = /^-?\d+(\.\d+)?px$/

export function parseWebdeck(html: string, options: ParseOptions = {}): DeckDoc {
  const idGen = options.idGen ?? createIdGen()
  const dom = new DOMParser().parseFromString(html, 'text/html')

  const htmlEl = dom.documentElement
  if (htmlEl.getAttribute('data-webdeck-version') !== '1') {
    throw new WebdeckParseError('WebDeck 문서가 아닙니다: <html>에 data-webdeck-version="1" 속성이 없습니다')
  }
  const deck = dom.querySelector('main.deck')
  if (!deck) {
    throw new WebdeckParseError('WebDeck 문서가 아닙니다: <main class="deck">가 없습니다')
  }
  const slideWidth = Number(deck.getAttribute('data-slide-width'))
  const slideHeight = Number(deck.getAttribute('data-slide-height'))
  if (!(slideWidth > 0) || !(slideHeight > 0)) {
    throw new WebdeckParseError('deck의 data-slide-width/data-slide-height가 올바르지 않습니다')
  }

  const htmlAttrs: Record<string, string> = {}
  for (const attr of Array.from(htmlEl.attributes)) htmlAttrs[attr.name] = attr.value

  const headClone = dom.head.cloneNode(true) as HTMLElement
  const title = headClone.querySelector('title')?.textContent ?? ''
  headClone.querySelector('title')?.remove()
  headClone.querySelector('meta[charset]')?.remove()
  const headExtra = headClone.innerHTML.trim()

  const bodyScript = Array.from(dom.body.children)
    .filter((c) => c.tagName === 'SCRIPT')
    .map((s) => s.outerHTML)
    .join('\n')

  const slides: Slide[] = []
  for (const child of Array.from(deck.children)) {
    if (child.tagName !== 'SECTION' || !child.classList.contains('slide')) {
      throw new WebdeckParseError(`deck의 자식은 <section class="slide">만 허용됩니다 (<${child.tagName.toLowerCase()}> 발견)`)
    }
    slides.push(parseSlide(child, idGen))
  }

  return { title, slideWidth, slideHeight, headExtra, bodyScript, htmlAttrs, slides }
}

function parseSlide(section: Element, idGen: () => string): Slide {
  const id = idGen()
  const elements = Array.from(section.children).map((el) => parseElement(el, idGen))
  return { id, bg: section.getAttribute('data-bg'), elements }
}

function parseElement(el: Element, idGen: () => string): SlideElement {
  const id = idGen()
  const opaque = (): SlideElement => ({ type: 'opaque', id, html: el.outerHTML })

  if (!el.classList.contains('el')) return opaque()

  const style = parseInlineStyle(el.getAttribute('style') ?? '')
  const frame = readFrame(style)
  if (!frame) return opaque()

  const extraStyle: Record<string, string> = {}
  for (const [prop, value] of Object.entries(style)) {
    if (!(FRAME_PROPS as readonly string[]).includes(prop)) extraStyle[prop] = value
  }
  const extraAttrs: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'class' || attr.name === 'style' || attr.name === 'data-shape') continue
    extraAttrs[attr.name] = attr.value
  }

  if (el.classList.contains('el-text')) {
    return { type: 'text', id, frame, extraStyle, extraAttrs, html: el.innerHTML.trim() }
  }
  if (el.classList.contains('el-image')) {
    const imgs = el.querySelectorAll('img')
    const img = imgs.length === 1 ? imgs[0] : null
    if (!img) return opaque()
    return {
      type: 'image',
      id,
      frame,
      extraStyle,
      extraAttrs,
      src: img.getAttribute('src') ?? '',
      alt: img.getAttribute('alt') ?? '',
      imgStyle: img.getAttribute('style') ?? '',
    }
  }
  if (el.classList.contains('el-shape')) {
    if (el.getAttribute('data-shape') !== 'rect') return opaque()
    return { type: 'shape', id, frame, extraStyle, extraAttrs, shape: 'rect' }
  }
  return opaque()
}

function readFrame(style: Record<string, string>): Frame | null {
  const values: number[] = []
  for (const prop of FRAME_PROPS) {
    const v = style[prop]
    if (v === undefined || !PX_VALUE.test(v)) return null
    values.push(parseFloat(v))
  }
  const [left, top, width, height] = values as [number, number, number, number]
  return { left, top, width, height }
}
