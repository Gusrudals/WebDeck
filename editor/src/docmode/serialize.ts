/** 원본 HTML 첫머리의 DOCTYPE 선언을 원문 그대로 추출한다 (선행 BOM·공백·주석 허용, 없으면 null) */
export function extractDoctype(html: string): string | null {
  const m = html.match(/^﻿?\s*(?:<!--[\s\S]*?-->\s*)*(<!doctype[^>]*>)/i)
  return m ? m[1]! : null
}

/** DocumentType 노드에서 DOCTYPE 선언을 재구성한다 — 원문 추출이 실패한 경우의 폴백 */
function reconstructDoctype(dt: DocumentType): string {
  const publicPart = dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''
  const systemPart = dt.systemId ? (dt.publicId ? ` "${dt.systemId}"` : ` SYSTEM "${dt.systemId}"`) : ''
  return `<!DOCTYPE ${dt.name}${publicPart}${systemPart}>`
}

/** 편집된 문서를 일반 HTML 문자열로 직렬화한다 — 편집 부산물 속성 제거, DOCTYPE·문서 수준 주석 보존 */
export function serializeEditedDocument(doc: Document, doctype: string | null): string {
  const parts: string[] = []
  let sawDoctype = false
  for (const node of Array.from(doc.childNodes)) {
    if (node.nodeType === 10) {
      sawDoctype = true
      parts.push(doctype ?? reconstructDoctype(node as DocumentType))
    } else if (node.nodeType === 8) {
      parts.push(`<!--${(node as Comment).data}-->`)
    } else if (node === doc.documentElement) {
      const root = doc.documentElement.cloneNode(true) as HTMLElement
      const body = root.querySelector('body')
      body?.removeAttribute('contenteditable')
      body?.removeAttribute('spellcheck')
      parts.push(root.outerHTML)
    }
  }
  // 파서가 doctype 노드를 만들지 않았지만 원문에서 추출된 경우 — 앞에 붙여 보존한다
  if (!sawDoctype && doctype) parts.unshift(doctype)
  return parts.join('\n')
}
