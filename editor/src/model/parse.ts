import { createIdGen } from './id.ts'
import { ROTATE_PATTERN, normalizeAngle } from './rotation.ts'
import { isLinear, lineDefaults } from './shapeSvg.ts'
import type { LineStyle } from './shapeSvg.ts'
import { parseInlineStyle } from './style.ts'
import { parseTableMarkup } from './tableMarkup.ts'
import type { DeckDoc, Frame, Slide, SlideElement } from './types.ts'

export class WebdeckParseError extends Error {}

export interface ParseOptions {
  idGen?: () => string
}

const FRAME_PROPS = ['left', 'top', 'width', 'height'] as const
const PX_VALUE = /^-?\d+(\.\d+)?px$/
const SHAPE_KINDS = ['rect', 'ellipse', 'rounded', 'line', 'arrow'] as const

/** class 속성에서 known 토큰을 제외한 나머지를 원문 순서대로 반환 */
function extraClassesOf(el: Element, known: string[]): string[] {
  return (el.getAttribute('class') ?? '')
    .split(/\s+/)
    .filter((t) => t !== '' && !known.includes(t))
}

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

  const deckExtraClasses = extraClassesOf(deck, ['deck'])
  const deckExtraAttrs: Record<string, string> = {}
  for (const attr of Array.from(deck.attributes)) {
    if (attr.name === 'class' || attr.name === 'data-slide-width' || attr.name === 'data-slide-height') continue
    deckExtraAttrs[attr.name] = attr.value
  }

  const htmlAttrs: Record<string, string> = {}
  for (const attr of Array.from(htmlEl.attributes)) htmlAttrs[attr.name] = attr.value

  const headClone = dom.head.cloneNode(true) as HTMLElement
  const title = headClone.querySelector('title')?.textContent ?? ''
  headClone.querySelector('title')?.remove()
  headClone.querySelector('meta[charset]')?.remove()
  const headExtra = headClone.innerHTML.trim()

  const bodyAttrs: Record<string, string> = {}
  for (const attr of Array.from(dom.body.attributes)) bodyAttrs[attr.name] = attr.value

  const bodyChildren = Array.from(dom.body.children)
  const bodyScript = bodyChildren
    .filter((c) => c.tagName === 'SCRIPT')
    .map((s) => s.outerHTML)
    .join('\n')
  const bodyExtra = bodyChildren
    .filter((c) => c.tagName !== 'SCRIPT' && c !== deck)
    .map((c) => c.outerHTML)
    .join('\n')

  const slides: Slide[] = []
  for (const child of Array.from(deck.children)) {
    if (child.tagName !== 'SECTION' || !child.classList.contains('slide')) {
      throw new WebdeckParseError(`deck의 자식은 <section class="slide">만 허용됩니다 (<${child.tagName.toLowerCase()}> 발견)`)
    }
    slides.push(parseSlide(child, idGen))
  }

  return { title, slideWidth, slideHeight, deckExtraClasses, deckExtraAttrs, headExtra, bodyAttrs, bodyExtra, bodyScript, htmlAttrs, slides }
}

function parseSlide(section: Element, idGen: () => string): Slide {
  const id = idGen()
  const rawTransition = section.getAttribute('data-transition')
  const transition = rawTransition === 'fade' || rawTransition === 'push' ? rawTransition : null
  const notes = section.getAttribute('data-notes') ?? ''
  const extraAttrs: Record<string, string> = {}
  for (const attr of Array.from(section.attributes)) {
    if (attr.name === 'class' || attr.name === 'data-bg' || attr.name === 'data-notes') continue
    // 유효한 transition만 1급 필드로 승격 — 미지원 값은 extraAttrs에 원문 보존
    if (attr.name === 'data-transition' && transition !== null) continue
    extraAttrs[attr.name] = attr.value
  }
  const elements = Array.from(section.children).map((el) => parseElement(el, idGen))
  return { id, bg: section.getAttribute('data-bg'), transition, notes, extraAttrs, extraClasses: extraClassesOf(section, ['slide']), elements }
}

function parseElement(el: Element, idGen: () => string): SlideElement {
  const id = idGen()
  const opaque = (): SlideElement => ({ type: 'opaque', id, html: el.outerHTML })

  if (!el.classList.contains('el')) return opaque()

  const style = parseInlineStyle(el.getAttribute('style') ?? '')
  const frame = readFrame(style)
  if (!frame) return opaque()

  const rawTransform = style['transform']
  const rotateMatch = rawTransform !== undefined ? ROTATE_PATTERN.exec(rawTransform.trim()) : null
  const rotation = rotateMatch ? normalizeAngle(parseFloat(rotateMatch[1]!)) : 0

  const extraStyle: Record<string, string> = {}
  for (const [prop, value] of Object.entries(style)) {
    if ((FRAME_PROPS as readonly string[]).includes(prop)) continue
    if (prop === 'transform' && rotateMatch) continue
    extraStyle[prop] = value
  }
  const extraAttrs: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'class' || attr.name === 'style' || attr.name === 'data-shape') continue
    extraAttrs[attr.name] = attr.value
  }
  const extraClasses = extraClassesOf(el, ['el', 'el-text', 'el-image', 'el-shape', 'el-table'])

  if (el.classList.contains('el-table')) {
    const tables = Array.from(el.children).filter((c) => c.tagName === 'TABLE')
    const hasStrayText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
    if (tables.length !== 1 || el.children.length !== 1 || hasStrayText) return opaque()
    const parsed = parseTableMarkup(tables[0]!)
    if (!parsed) return opaque()
    return { type: 'table', id, frame, rotation, extraStyle, extraAttrs, extraClasses, colWidths: parsed.colWidths, rows: parsed.rows }
  }
  if (el.classList.contains('el-text')) {
    return { type: 'text', id, frame, rotation, extraStyle, extraAttrs, extraClasses, html: el.innerHTML.trim() }
  }
  if (el.classList.contains('el-image')) {
    const imgs = el.querySelectorAll('img')
    const img = imgs.length === 1 ? imgs[0] : null
    if (!img) return opaque()
    const IMG_ATTRS = ['src', 'alt', 'style']
    const hasExtraImgAttrs = Array.from(img.attributes).some((a) => !IMG_ATTRS.includes(a.name))
    const hasExtraChildren = Array.from(el.children).some((c) => c !== img)
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
    if (hasExtraImgAttrs || hasExtraChildren || hasText) return opaque()
    return {
      type: 'image',
      id,
      frame,
      rotation,
      extraStyle,
      extraAttrs,
      extraClasses,
      src: img.getAttribute('src') ?? '',
      alt: img.getAttribute('alt') ?? '',
      imgStyle: img.getAttribute('style') ?? '',
    }
  }
  if (el.classList.contains('el-shape')) {
    const kind = el.getAttribute('data-shape') as (typeof SHAPE_KINDS)[number] | null
    if (kind === null || !SHAPE_KINDS.includes(kind)) return opaque()
    if (!isLinear(kind)) {
      const hasChildren = el.children.length > 0
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
      if (hasChildren || hasText) return opaque()
      return { type: 'shape', id, frame, rotation, extraStyle, extraAttrs, extraClasses, shape: kind, ...lineDefaults('line') }
    }
    // line/arrow는 내부 마크업을 무시한다 — 직렬화가 정준 SVG를 재생성 (스펙 §3)
    return { type: 'shape', id, frame, rotation, extraStyle, extraAttrs, extraClasses, shape: kind, ...readLineStyle(el, kind as 'line' | 'arrow', extraAttrs) }
  }
  return opaque()
}

const LINE_STYLE_ATTRS = ['data-stroke-width', 'data-stroke-dash', 'data-head-start', 'data-head-end']

/** 선 서식 속성 승격 — 유효한 값만, 무효 값은 kind 기본값(관용, 스펙 §7). extraAttrs에서 소비한다 */
function readLineStyle(el: Element, kind: 'line' | 'arrow', extraAttrs: Record<string, string>): LineStyle {
  const d = lineDefaults(kind)
  const w = el.getAttribute('data-stroke-width')
  const dash = el.getAttribute('data-stroke-dash')
  const hs = el.getAttribute('data-head-start')
  const he = el.getAttribute('data-head-end')
  for (const a of LINE_STYLE_ATTRS) delete extraAttrs[a]
  return {
    strokeWidth: w !== null && /^[1-9][0-9]*$/.test(w) ? Number(w) : d.strokeWidth,
    strokeDash: dash === 'dashed' || dash === 'dotted' ? dash : d.strokeDash,
    headStart: hs === '1' ? true : hs === '0' ? false : d.headStart,
    headEnd: he === '1' ? true : he === '0' ? false : d.headEnd,
  }
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
