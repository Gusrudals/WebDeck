import { parse } from 'node-html-parser'

export const ELEMENT_TYPES = ['el-text', 'el-image', 'el-shape']

const REQUIRED_STYLE_PROPS = ['left', 'top', 'width', 'height']
const PX_VALUE = /^-?\d+(\.\d+)?px$/

export function parseInlineStyle(styleText) {
  const out = {}
  for (const decl of String(styleText).split(';')) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const value = decl.slice(idx + 1).trim()
    if (prop) out[prop] = value
  }
  return out
}

export function validateWebdeck(html) {
  const errors = []
  const warnings = []
  const root = parse(html)

  const htmlEl = root.querySelector('html')
  if (!htmlEl) {
    errors.push('문서: <html> 태그가 없습니다')
    return { errors, warnings }
  }
  if (htmlEl.getAttribute('data-webdeck-version') !== '1') {
    errors.push('문서: <html>에 data-webdeck-version="1" 속성이 필요합니다')
  }

  const charset = root.querySelector('meta[charset]')
  if (!charset || (charset.getAttribute('charset') || '').toLowerCase() !== 'utf-8') {
    warnings.push('문서: <meta charset="utf-8">가 필요합니다')
  }
  const title = root.querySelector('title')
  if (!title || !title.text.trim()) {
    warnings.push('문서: <title>이 비어 있습니다')
  }
  if (root.querySelector('script[src]')) {
    errors.push('문서: 외부 <script src="...">는 허용되지 않습니다 (자기완결형 원칙)')
  }
  const links = root.querySelectorAll('link')
  const hasExternalStylesheet = links.some((l) =>
    (l.getAttribute('rel') || '').toLowerCase().split(/\s+/).includes('stylesheet'),
  )
  if (hasExternalStylesheet) {
    errors.push('문서: 외부 스타일시트 <link>는 허용되지 않습니다 (자기완결형 원칙)')
  }

  for (const styleEl of root.querySelectorAll('style')) {
    if (styleEl.text.includes('@import')) {
      errors.push('문서: <style> 안의 @import는 허용되지 않습니다 (자기완결형 원칙)')
      break
    }
  }
  const forbidden = root.querySelectorAll('iframe, video, audio, embed, object')
  if (forbidden.length > 0) {
    errors.push(`문서: iframe/video/audio/embed/object 요소는 허용되지 않습니다 (v1, ${forbidden.length}개 발견)`)
  }

  const decks = root.querySelectorAll('main.deck')
  if (decks.length !== 1) {
    errors.push(`문서: <main class="deck">가 정확히 1개여야 합니다 (현재 ${decks.length}개)`)
    return { errors, warnings }
  }
  const deck = decks[0]
  const canvasW = Number(deck.getAttribute('data-slide-width'))
  const canvasH = Number(deck.getAttribute('data-slide-height'))
  if (!Number.isFinite(canvasW) || canvasW <= 0) errors.push('deck: data-slide-width는 양수여야 합니다')
  if (!Number.isFinite(canvasH) || canvasH <= 0) errors.push('deck: data-slide-height는 양수여야 합니다')

  const deckChildren = deck.childNodes.filter((n) => n.nodeType === 1)
  const slides = deckChildren.filter(
    (n) => n.rawTagName.toLowerCase() === 'section' && n.classList.contains('slide'),
  )
  if (slides.length !== deckChildren.length) {
    errors.push('deck: <main class="deck">의 자식은 <section class="slide">만 허용됩니다')
  }
  if (slides.length === 0) {
    errors.push('deck: 슬라이드(<section class="slide">)가 1개 이상 필요합니다')
  }

  slides.forEach((slide, i) => {
    validateSlide(slide, i + 1, { canvasW, canvasH, errors, warnings })
  })

  return { errors, warnings }
}

function validateSlide(slide, num, ctx) {
  const { canvasW, canvasH, errors, warnings } = ctx
  const label = `슬라이드 ${num}`
  const transition = slide.getAttribute('data-transition')
  if (transition != null && !['fade', 'push'].includes(transition)) {
    errors.push(`${label}: data-transition은 fade/push만 지원합니다 (현재 "${transition}")`)
  }
  const children = slide.childNodes.filter((n) => n.nodeType === 1)

  for (const el of children) {
    if (!el.classList.contains('el')) {
      errors.push(`${label}: 슬라이드의 자식은 .el 요소여야 합니다 (<${el.rawTagName}> 발견)`)
      continue
    }
    const type = ELEMENT_TYPES.find((t) => el.classList.contains(t))
    if (!type) {
      errors.push(`${label}: .el 요소에 타입 클래스(${ELEMENT_TYPES.join('/')})가 없습니다`)
      continue
    }

    if (el.querySelector('.el')) {
      errors.push(`${label}: .el 안에 다른 .el을 중첩할 수 없습니다 (겹침은 절대 좌표와 순서로 표현)`)
    }

    const style = parseInlineStyle(el.getAttribute('style') || '')
    let hasAllProps = true
    for (const prop of REQUIRED_STYLE_PROPS) {
      const value = style[prop]
      if (value === undefined) {
        errors.push(`${label}: ${type} 요소의 style에 ${prop}가 없습니다`)
        hasAllProps = false
      } else if (!PX_VALUE.test(value)) {
        errors.push(`${label}: ${type} 요소의 ${prop}는 px 단위여야 합니다 (현재 "${value}")`)
        hasAllProps = false
      }
    }
    if (hasAllProps && canvasW > 0 && canvasH > 0) {
      const left = parseFloat(style.left)
      const top = parseFloat(style.top)
      const width = parseFloat(style.width)
      const height = parseFloat(style.height)
      if (left < 0 || top < 0 || left + width > canvasW || top + height > canvasH) {
        warnings.push(`${label}: ${type} 요소가 캔버스(${canvasW}×${canvasH}) 밖으로 나갑니다`)
      }
    }

    if (type === 'el-image') validateImage(el, label, ctx)
    if (type === 'el-shape') {
      const SHAPE_KINDS = ['rect', 'ellipse', 'rounded', 'line', 'arrow']
      const kind = el.getAttribute('data-shape')
      if (!SHAPE_KINDS.includes(kind)) {
        errors.push(`${label}: el-shape의 data-shape는 rect/ellipse/rounded/line/arrow만 지원합니다 (v1.1)`)
      } else if (kind === 'line' || kind === 'arrow') {
        const kids = el.childNodes.filter((n) => n.nodeType === 1)
        if (kids.length > 1 || (kids.length === 1 && kids[0].rawTagName.toLowerCase() !== 'svg')) {
          errors.push(`${label}: line/arrow 도형의 자식은 svg 1개만 허용됩니다`)
        }
      }
    }
  }
}

function validateImage(el, label, { errors, warnings }) {
  const imgs = el.querySelectorAll('img')
  if (imgs.length !== 1) {
    errors.push(`${label}: el-image에는 <img>가 정확히 1개 있어야 합니다 (현재 ${imgs.length}개)`)
    return
  }
  const img = imgs[0]
  const src = img.getAttribute('src') || ''
  if (!src) {
    errors.push(`${label}: <img>에 src가 없습니다`)
  } else if (!src.startsWith('data:')) {
    warnings.push(`${label}: 이미지 src가 data URI가 아닙니다 (단일 파일 유통이 깨질 수 있음)`)
  }
  if (img.getAttribute('alt') === undefined || img.getAttribute('alt') === null) {
    warnings.push(`${label}: <img>에 alt 속성이 없습니다`)
  }
}
