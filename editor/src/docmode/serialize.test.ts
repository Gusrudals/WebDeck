import { describe, expect, test } from 'vitest'
import { extractDoctype, serializeEditedDocument } from './serialize.ts'

const LEGACY_DOCTYPE = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">'

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('extractDoctype', () => {
  test('표준 html5 DOCTYPE을 원문 그대로 추출한다', () => {
    expect(extractDoctype('<!DOCTYPE html>\n<html><body></body></html>')).toBe('<!DOCTYPE html>')
  })

  test('대소문자·레거시 선언도 원문 그대로 보존한다', () => {
    expect(extractDoctype(`${LEGACY_DOCTYPE}\n<html></html>`)).toBe(LEGACY_DOCTYPE)
    expect(extractDoctype('<!doctype html><html></html>')).toBe('<!doctype html>')
  })

  test('앞의 BOM·공백을 허용한다', () => {
    expect(extractDoctype('﻿  \n<!DOCTYPE html><html></html>')).toBe('<!DOCTYPE html>')
  })

  test('DOCTYPE이 없으면 null', () => {
    expect(extractDoctype('<html><body><p>x</p></body></html>')).toBeNull()
  })
})

describe('serializeEditedDocument', () => {
  const SOURCE = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>보고서</title><style>body { color: #111; }</style></head>
<body>
<h1>분기 보고</h1>
<script>console.log('chart')</script>
</body>
</html>`

  test('body의 contenteditable·spellcheck을 제거하고 DOCTYPE을 앞에 붙인다', () => {
    const doc = makeDoc(SOURCE)
    doc.body.setAttribute('contenteditable', 'true')
    doc.body.setAttribute('spellcheck', 'false')
    const out = serializeEditedDocument(doc, '<!DOCTYPE html>')
    expect(out.startsWith('<!DOCTYPE html>\n<html')).toBe(true)
    expect(out).not.toContain('contenteditable')
    expect(out).not.toContain('spellcheck')
  })

  test('script와 head 내용을 원문대로 보존한다', () => {
    const doc = makeDoc(SOURCE)
    const out = serializeEditedDocument(doc, '<!DOCTYPE html>')
    expect(out).toContain("<script>console.log('chart')</script>")
    expect(out).toContain('<style>body { color: #111; }</style>')
    expect(out).toContain('lang="ko"')
  })

  test('doctype이 null이면 붙이지 않는다', () => {
    const out = serializeEditedDocument(makeDoc('<html><body><p>x</p></body></html>'), null)
    expect(out.startsWith('<html')).toBe(true)
  })

  test('전달된 문서를 변형하지 않는다 (라이브 편집 유지)', () => {
    const doc = makeDoc(SOURCE)
    doc.body.setAttribute('contenteditable', 'true')
    serializeEditedDocument(doc, null)
    expect(doc.body.getAttribute('contenteditable')).toBe('true')
  })

  test('편집으로 바뀐 본문이 저장물에 반영된다', () => {
    const doc = makeDoc(SOURCE)
    doc.querySelector('h1')!.textContent = '수정된 제목'
    expect(serializeEditedDocument(doc, null)).toContain('수정된 제목')
  })
})
