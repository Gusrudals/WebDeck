export interface Frame {
  left: number
  top: number
  width: number
  height: number
}

interface ElementBase {
  id: string
  frame: Frame
  /** 회전 각도(도, [0,360)). 0이면 직렬화 시 transform 미출력 */
  rotation: number
  /** frame(left/top/width/height) 외의 인라인 스타일 — background 등. 왕복 보존 */
  extraStyle: Record<string, string>
  /** class/style/data-shape 외의 속성 — 왕복 보존 */
  extraAttrs: Record<string, string>
  /** el/el-text·el-image·el-shape 외의 class 토큰 — 왕복 보존 (에디터 렌더에는 미적용) */
  extraClasses: string[]
}

export interface TextElement extends ElementBase {
  type: 'text'
  /** 요소 내부 HTML 원문 (<p>…</p> 목록) */
  html: string
}

export interface ImageElement extends ElementBase {
  type: 'image'
  src: string
  alt: string
  imgStyle: string
}

export type ShapeKind = 'rect' | 'ellipse' | 'rounded' | 'line' | 'arrow'

export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: ShapeKind
}

export type CellAlign = 'left' | 'center' | 'right'

export interface TableCell {
  /** 셀 내부 HTML — el-text와 같은 계약(인라인 서식 보존, trim) */
  html: string
  colspan: number
  rowspan: number
  /** th 여부 */
  header: boolean
  /** 1급 셀 서식 — background/text-align. 그 외 스타일은 extraStyle 보존 */
  bg: string | null
  align: CellAlign | null
  extraStyle: Record<string, string>
  extraAttrs: Record<string, string>
}

export interface TableElement extends ElementBase {
  type: 'table'
  /** 열 너비 % — 길이 = 그리드 열 수 */
  colWidths: number[]
  /** 앵커 셀만 (HTML 마크업과 1:1). 스팬으로 덮인 행은 빈 배열 허용 */
  rows: TableCell[][]
}

/** 파서가 이해하지 못하는 슬라이드 자식 — 원문 그대로 보존(왕복 보존 원칙) */
export interface OpaqueElement {
  type: 'opaque'
  id: string
  html: string
}

export type SlideElement = TextElement | ImageElement | ShapeElement | TableElement | OpaqueElement
export type KnownElement = TextElement | ImageElement | ShapeElement | TableElement

export interface Slide {
  id: string
  bg: string | null
  /** 발표 전환 효과 — data-transition. fade/push만 1급, 그 외 값은 extraAttrs에 보존 */
  transition: 'fade' | 'push' | null
  /** 슬라이드 노트 — data-notes 평문 (없으면 '') */
  notes: string
  /** class/data-bg 외의 section 속성 — 왕복 보존 */
  extraAttrs: Record<string, string>
  /** slide 외의 class 토큰 — 왕복 보존 */
  extraClasses: string[]
  elements: SlideElement[]
}

export interface DeckDoc {
  title: string
  slideWidth: number
  slideHeight: number
  /** deck 외의 main class 토큰 — 왕복 보존 */
  deckExtraClasses: string[]
  /** class/data-slide-width/data-slide-height 외의 main 속성 — 왕복 보존 */
  deckExtraAttrs: Record<string, string>
  /** <head>에서 <title>/<meta charset>을 제외한 원문 (뷰어 CSS 포함) — 왕복 보존 */
  headExtra: string
  /** <body> 태그의 속성 — 왕복 보존 */
  bodyAttrs: Record<string, string>
  /** <body> 직속의 main/script 외 요소 원문 — 왕복 보존 */
  bodyExtra: string
  /** <body> 직속 <script> 원문 (뷰어 스크립트) — 왕복 보존 */
  bodyScript: string
  /** <html> 태그의 속성 전부 (lang, data-webdeck-version 등) */
  htmlAttrs: Record<string, string>
  slides: Slide[]
}

export function isKnownElement(el: SlideElement): el is KnownElement {
  return el.type !== 'opaque'
}
