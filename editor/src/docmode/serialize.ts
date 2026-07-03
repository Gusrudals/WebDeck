/** 원본 HTML 첫머리의 DOCTYPE 선언을 원문 그대로 추출한다 (없으면 null) */
export function extractDoctype(html: string): string | null {
  const m = html.match(/^\uFEFF?\s*(<!doctype[^>]*>)/i)
  return m ? m[1]! : null
}

/** 편집된 문서를 일반 HTML 문자열로 직렬화한다 — 편집 부산물 속성 제거, DOCTYPE 원문 유지 */
export function serializeEditedDocument(doc: Document, doctype: string | null): string {
  const root = doc.documentElement.cloneNode(true) as HTMLElement
  const body = root.querySelector('body')
  body?.removeAttribute('contenteditable')
  body?.removeAttribute('spellcheck')
  return (doctype ? doctype + '\n' : '') + root.outerHTML
}
