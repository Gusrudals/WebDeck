import { describe, expect, test } from 'vitest'
import { setTextHtml } from './ops.ts'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-text" style="left:0px; top:0px; width:100px; height:50px;"><p>제목</p></div>
<div class="el el-shape" data-shape="rect" style="left:300px; top:300px; width:80px; height:80px;"></div>
</section>
</main></body></html>`)

const SLIDE = DOC.slides[0]!.id
const EL = DOC.slides[0]!.elements[0]!.id

describe('checkRoundTrip', () => {
  test('정상 문서는 null을 반환한다', () => {
    expect(checkRoundTrip(DOC)).toBeNull()
  })

  test('일반적인 텍스트 편집 후에도 null이다', () => {
    const d = setTextHtml(DOC, SLIDE, EL, '<p>수정 <strong>강조</strong> <span style="color: #dc2626;">색</span></p>')
    expect(checkRoundTrip(d)).toBeNull()
  })

  test('앞뒤 공백만 있는 텍스트는 통과한다 (trim 정규화)', () => {
    const d = setTextHtml(DOC, SLIDE, EL, '  <p>공백</p>  ')
    expect(checkRoundTrip(d)).toBeNull()
  })

  test('요소를 삼키는 마크업은 차단한다', () => {
    const d = setTextHtml(DOC, SLIDE, EL, '</div><div class="pwn">x')
    const msg = checkRoundTrip(d)
    expect(msg).toBeTruthy()
  })

  test('비균형 마크업은 차단한다', () => {
    const d = setTextHtml(DOC, SLIDE, EL, '<p>a<div>b</div>')
    expect(checkRoundTrip(d)).toBeTruthy()
  })

  test('Plan 5 신규 스타일 조합은 왕복 안전하다 (그림자·투명도·flex 정렬·테두리·목록·줄간격)', () => {
    const doc = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">
<div class="el el-shape" data-shape="rect" style="left:10px; top:10px; width:100px; height:80px; background:#1a56db; border:2px dashed #dc2626; box-shadow:0 2px 6px rgba(0,0,0,0.25); opacity:0.6;"></div>
<div class="el el-text" style="left:200px; top:10px; width:400px; height:200px; display:flex; flex-direction:column; justify-content:center;"><p style="line-height:1.5;">문단</p><ul><li style="line-height:1.15;">항목 하나</li><li>항목 둘</li></ul><ol><li>번호</li></ol></div>
</section>
</main></body></html>`)
    expect(checkRoundTrip(doc)).toBeNull()
  })
})
