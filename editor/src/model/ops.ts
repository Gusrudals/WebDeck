import { normalizeAngle } from './rotation.ts'
import { isLinear, isPath, isStroke, lineDefaults } from './shapeSvg.ts'
import type { LineStyle } from './shapeSvg.ts'
import type { DeckDoc, Frame, ImageElement, KnownElement, Point, ShapeElement, ShapeKind, Slide, SlideElement, TextElement } from './types.ts'
import { isKnownElement } from './types.ts'

// ---------- 내부 헬퍼 ----------

function slideIndexOf(doc: DeckDoc, slideId: string): number {
  const i = doc.slides.findIndex((s) => s.id === slideId)
  if (i === -1) throw new Error(`슬라이드를 찾을 수 없습니다: ${slideId}`)
  return i
}

function mapSlide(doc: DeckDoc, slideId: string, fn: (slide: Slide) => Slide): DeckDoc {
  const i = slideIndexOf(doc, slideId)
  const slides = doc.slides.slice()
  slides[i] = fn(slides[i]!)
  return { ...doc, slides }
}

function elementIndexOf(slide: Slide, elementId: string): number {
  const i = slide.elements.findIndex((e) => e.id === elementId)
  if (i === -1) throw new Error(`요소를 찾을 수 없습니다: ${elementId}`)
  return i
}

export function mapKnownElement(doc: DeckDoc, slideId: string, elementId: string, fn: (el: KnownElement) => KnownElement): DeckDoc {
  return mapSlide(doc, slideId, (slide) => {
    const i = elementIndexOf(slide, elementId)
    const el = slide.elements[i]!
    if (!isKnownElement(el)) throw new Error(`편집할 수 없는 요소입니다 (보존된 원문 블록): ${elementId}`)
    const elements = slide.elements.slice()
    elements[i] = fn(el)
    return { ...slide, elements }
  })
}

// ---------- 요소 커맨드 ----------

export function moveElement(doc: DeckDoc, slideId: string, elementId: string, dx: number, dy: number): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) => ({
    ...el,
    frame: { ...el.frame, left: el.frame.left + dx, top: el.frame.top + dy },
  }))
}

export function setElementFrame(doc: DeckDoc, slideId: string, elementId: string, frame: Frame): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) => ({ ...el, frame: { ...frame } }))
}

export function setTextHtml(doc: DeckDoc, slideId: string, elementId: string, html: string): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) => {
    if (el.type !== 'text') throw new Error(`텍스트 요소가 아닙니다: ${elementId}`)
    return { ...el, html }
  })
}

/** extraStyle 패치 — 값 null은 해당 속성 제거. frame 속성(left/top/width/height)은 다루지 않는다 */
export function setElementStyle(
  doc: DeckDoc,
  slideId: string,
  elementId: string,
  patch: Record<string, string | null>,
): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) => {
    const extraStyle: Record<string, string> = { ...el.extraStyle }
    for (const [prop, value] of Object.entries(patch)) {
      if (value === null) delete extraStyle[prop]
      else extraStyle[prop] = value
    }
    return { ...el, extraStyle }
  })
}

export function addElement(doc: DeckDoc, slideId: string, element: SlideElement, index?: number): DeckDoc {
  return mapSlide(doc, slideId, (slide) => {
    const elements = slide.elements.slice()
    elements.splice(index ?? elements.length, 0, element)
    return { ...slide, elements }
  })
}

export function removeElement(doc: DeckDoc, slideId: string, elementId: string): DeckDoc {
  return mapSlide(doc, slideId, (slide) => {
    const i = elementIndexOf(slide, elementId)
    const elements = slide.elements.slice()
    elements.splice(i, 1)
    return { ...slide, elements }
  })
}

export type ZDirection = 'forward' | 'backward' | 'front' | 'back'

export function moveElementZ(doc: DeckDoc, slideId: string, elementId: string, dir: ZDirection): DeckDoc {
  const si = slideIndexOf(doc, slideId)
  const slide = doc.slides[si]!
  const i = elementIndexOf(slide, elementId)
  const target = { forward: i + 1, backward: i - 1, front: slide.elements.length - 1, back: 0 }[dir]
  const clamped = Math.max(0, Math.min(slide.elements.length - 1, target))
  if (clamped === i) return doc
  const elements = slide.elements.slice()
  const [el] = elements.splice(i, 1)
  elements.splice(clamped, 0, el!)
  const slides = doc.slides.slice()
  slides[si] = { ...slide, elements }
  return { ...doc, slides }
}

// ---------- 슬라이드 커맨드 ----------

export function addSlide(doc: DeckDoc, idGen: () => string, index?: number, elements: SlideElement[] = []): DeckDoc {
  const slide: Slide = { id: idGen(), bg: '#ffffff', transition: null, notes: '', extraAttrs: {}, extraClasses: [], elements }
  const slides = doc.slides.slice()
  slides.splice(index ?? slides.length, 0, slide)
  return { ...doc, slides }
}

export function removeSlide(doc: DeckDoc, slideId: string): DeckDoc {
  if (doc.slides.length <= 1) throw new Error('마지막 슬라이드는 삭제할 수 없습니다')
  const i = slideIndexOf(doc, slideId)
  const slides = doc.slides.slice()
  slides.splice(i, 1)
  return { ...doc, slides }
}

export function duplicateSlide(doc: DeckDoc, slideId: string, idGen: () => string): DeckDoc {
  const i = slideIndexOf(doc, slideId)
  const src = doc.slides[i]!
  const copy: Slide = {
    id: idGen(),
    bg: src.bg,
    transition: src.transition,
    notes: src.notes,
    extraAttrs: { ...src.extraAttrs },
    extraClasses: [...src.extraClasses],
    elements: src.elements.map((el) =>
      el.type === 'opaque'
        ? { ...el, id: idGen() }
        : { ...structuredClone(el), id: idGen() },
    ),
  }
  const slides = doc.slides.slice()
  slides.splice(i + 1, 0, copy)
  return { ...doc, slides }
}

export function moveSlide(doc: DeckDoc, fromIndex: number, toIndex: number): DeckDoc {
  const max = doc.slides.length - 1
  if (fromIndex < 0 || fromIndex > max || toIndex < 0 || toIndex > max) {
    throw new Error(`슬라이드 위치가 범위를 벗어났습니다: ${fromIndex} → ${toIndex}`)
  }
  const slides = doc.slides.slice()
  const [slide] = slides.splice(fromIndex, 1)
  slides.splice(toIndex, 0, slide!)
  return { ...doc, slides }
}

export function setSlideBg(doc: DeckDoc, slideId: string, bg: string | null): DeckDoc {
  return mapSlide(doc, slideId, (slide) => ({ ...slide, bg }))
}

export function setSlideTransition(doc: DeckDoc, slideId: string, transition: Slide['transition']): DeckDoc {
  return mapSlide(doc, slideId, (slide) => {
    // 미지원 값으로 보존돼 있던 data-transition 잔재를 제거 — 중복 속성 직렬화 방지
    const extraAttrs = { ...slide.extraAttrs }
    delete extraAttrs['data-transition']
    return { ...slide, transition, extraAttrs }
  })
}

export function setSlideNotes(doc: DeckDoc, slideId: string, notes: string): DeckDoc {
  return mapSlide(doc, slideId, (slide) => ({ ...slide, notes }))
}

// ---------- 팩토리 ----------

export function createTextElement(idGen: () => string, frame: Frame, html: string): TextElement {
  return { type: 'text', id: idGen(), frame: { ...frame }, rotation: 0, extraStyle: {}, extraAttrs: {}, extraClasses: [], html }
}

/** 레이아웃·툴바의 rect 도형 경로 — 하위 호환을 위해 유지, createShape('rect', …)에 background만 덮어써 위임 */
export function createShapeElement(idGen: () => string, frame: Frame, background: string): ShapeElement {
  return { ...createShape(idGen, 'rect', frame), frame: { ...frame }, extraStyle: { background } }
}

/** line/arrow 삽입 기본 frame — 툴바 클릭 삽입과 그리기 모드의 클릭 폴백이 공유 (스펙 §5) */
export const LINEAR_INSERT_FRAME: Frame = { left: 480, top: 356, width: 320, height: 8 }

/** elbow/curve 삽입 기본 frame — 그리기 모드의 클릭 폴백이 사용 (스펙 9d §4) */
export const PATH_INSERT_FRAME: Frame = { left: 480, top: 280, width: 320, height: 160 }

const DEFAULT_PATH_POINTS: Record<'elbow' | 'curve', Point[]> = {
  elbow: [[0, 0], [50, 0], [50, 100], [100, 100]],
  curve: [[0, 100], [33.33, 0], [66.67, 0], [100, 100]],
}

/** 도형 삽입 팩토리 — kind별 기본 외형은 인라인 스타일에 내장 (런타임·CSS 무의존, 스펙 §2·§3) */
export function createShape(idGen: () => string, kind: ShapeKind, frame: Frame): ShapeElement {
  const extraStyle: Record<string, string> =
    isStroke(kind)
      ? { color: '#374151' }
      : kind === 'ellipse'
        ? { background: 'var(--wd-accent)', 'border-radius': '50%' }
        : kind === 'rounded'
          ? { background: 'var(--wd-accent)', 'border-radius': '24px' }
          : { background: 'var(--wd-accent)' }
  const line = isStroke(kind) ? lineDefaults(kind) : lineDefaults('line')
  const points: Point[] = isPath(kind) ? DEFAULT_PATH_POINTS[kind].map(([x, y]) => [x, y] as Point) : []
  return { type: 'shape', id: idGen(), frame: { ...frame }, rotation: 0, extraStyle, extraAttrs: {}, extraClasses: [], shape: kind, ...line, points }
}

export function createImageElement(idGen: () => string, frame: Frame, src: string, alt: string): ImageElement {
  return { type: 'image', id: idGen(), frame: { ...frame }, rotation: 0, extraStyle: {}, extraAttrs: {}, extraClasses: [], src, alt, imgStyle: 'width:100%; height:100%;' }
}

/** 선 서식 패치 — line/arrow 외에는 무변경. 호출부가 값 비교로 no-op dispatch를 막는다(회전 관례) */
export function setShapeLineStyle(doc: DeckDoc, slideId: string, elementId: string, patch: Partial<LineStyle>): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) =>
    el.type === 'shape' && isLinear(el.shape) ? { ...el, ...patch } : el,
  )
}

export function setElementRotation(doc: DeckDoc, slideId: string, elementId: string, rotation: number): DeckDoc {
  return mapKnownElement(doc, slideId, elementId, (el) => {
    // 비표준 transform 잔재를 제거 — 1급 rotation과의 중복 출력 방지
    const extraStyle = { ...el.extraStyle }
    delete extraStyle['transform']
    return { ...el, rotation: normalizeAngle(rotation), extraStyle }
  })
}
