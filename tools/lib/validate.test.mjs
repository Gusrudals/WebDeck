import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateWebdeck, parseInlineStyle } from './validate.mjs'
import { makeDoc } from './helpers.mjs'

test('유효한 문서는 오류와 경고가 없다', () => {
  const { errors, warnings } = validateWebdeck(makeDoc())
  assert.deepEqual(errors, [])
  assert.deepEqual(warnings, [])
})

test('data-webdeck-version 누락은 오류', () => {
  const { errors } = validateWebdeck(makeDoc({ version: null }))
  assert.ok(errors.some((e) => e.includes('data-webdeck-version')))
})

test('deck의 크기 속성 누락은 오류', () => {
  const { errors } = validateWebdeck(makeDoc({ deckAttrs: '' }))
  assert.ok(errors.some((e) => e.includes('data-slide-width')))
  assert.ok(errors.some((e) => e.includes('data-slide-height')))
})

test('슬라이드가 없으면 오류', () => {
  const { errors } = validateWebdeck(makeDoc({ slides: '' }))
  assert.ok(errors.some((e) => e.includes('슬라이드')))
})

test('슬라이드 자식이 .el이 아니면 오류', () => {
  const slides = `<section class="slide"><p>맨몸 텍스트</p></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('.el')))
})

test('.el에 타입 클래스가 없으면 오류', () => {
  const slides = `<section class="slide"><div class="el" style="left:0px; top:0px; width:100px; height:100px;"></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('타입 클래스')))
})

test('위치/크기 style 누락은 오류', () => {
  const slides = `<section class="slide"><div class="el el-text" style="left:0px; top:0px;"><p>x</p></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('width')))
  assert.ok(errors.some((e) => e.includes('height')))
})

test('px가 아닌 단위는 오류', () => {
  const slides = `<section class="slide"><div class="el el-text" style="left:10%; top:0px; width:100px; height:100px;"><p>x</p></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('px 단위')))
})

test('캔버스를 벗어난 요소는 경고', () => {
  const slides = `<section class="slide"><div class="el el-text" style="left:1200px; top:0px; width:200px; height:100px;"><p>x</p></div></section>`
  const { errors, warnings } = validateWebdeck(makeDoc({ slides }))
  assert.deepEqual(errors, [])
  assert.ok(warnings.some((w) => w.includes('밖으로')))
})

test('el-shape에 data-shape="rect"가 없으면 오류', () => {
  const slides = `<section class="slide"><div class="el el-shape" style="left:0px; top:0px; width:100px; height:100px;"></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('data-shape')))
})

test('data URI가 아닌 이미지는 경고', () => {
  const slides = `<section class="slide"><div class="el el-image" style="left:0px; top:0px; width:100px; height:100px;"><img src="https://example.com/a.png" alt="외부"></div></section>`
  const { errors, warnings } = validateWebdeck(makeDoc({ slides }))
  assert.deepEqual(errors, [])
  assert.ok(warnings.some((w) => w.includes('data URI')))
})

test('외부 스크립트는 오류', () => {
  const doc = makeDoc({ extraHead: '<script src="https://cdn.example.com/x.js"></script>' })
  const { errors } = validateWebdeck(doc)
  assert.ok(errors.some((e) => e.includes('script')))
})

test('대소문자/다중 토큰 rel의 외부 스타일시트도 오류', () => {
  for (const rel of ['STYLESHEET', 'Stylesheet', 'stylesheet preload']) {
    const doc = makeDoc({ extraHead: `<link rel="${rel}" href="https://cdn.example.com/x.css">` })
    const { errors } = validateWebdeck(doc)
    assert.ok(errors.some((e) => e.includes('스타일시트')), `rel="${rel}"가 통과함`)
  }
})

test('parseInlineStyle은 선언을 소문자 속성 맵으로 파싱한다', () => {
  assert.deepEqual(parseInlineStyle('LEFT: 10px; top:20px ; color: var(--wd-text)'), {
    left: '10px',
    top: '20px',
    color: 'var(--wd-text)',
  })
})

test('중첩된 .el은 오류', () => {
  const slides = `<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:200px; height:100px;"><p>a</p><div class="el el-shape" data-shape="rect" style="left:10px; top:10px; width:50px; height:50px;"></div></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('중첩')))
})

test('<style> 안의 @import는 오류', () => {
  const doc = makeDoc({ extraHead: '<style>@import url("https://cdn.example.com/x.css");</style>' })
  const { errors } = validateWebdeck(doc)
  assert.ok(errors.some((e) => e.includes('@import')))
})

test('iframe/video 등 외부 콘텐츠 요소는 오류', () => {
  const slides = `<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:200px; height:100px;"><iframe src="https://example.com"></iframe></div></section>`
  const { errors } = validateWebdeck(makeDoc({ slides }))
  assert.ok(errors.some((e) => e.includes('iframe')))
})

test('data-transition은 fade/push만 허용한다', () => {
  const bad = validateWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide" data-transition="zoom"></section>
</main></body></html>`)
  assert.ok(bad.errors.some((e) => e.includes('data-transition')))

  const good = validateWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide" data-transition="fade" data-notes="멘트"></section>
<section class="slide" data-transition="push"></section>
</main></body></html>`)
  assert.deepStrictEqual(good.errors, [])
})

test('data-shape는 5종을 허용하고 그 외는 오류다', () => {
  const wrap = (el) => `<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">${el}</section></main></body></html>`
  for (const kind of ['rect', 'ellipse', 'rounded', 'line', 'arrow']) {
    const r = validateWebdeck(wrap(`<div class="el el-shape" data-shape="${kind}" style="left:0px; top:0px; width:100px; height:50px;"></div>`))
    assert.deepStrictEqual(r.errors, [], kind)
  }
  const bad = validateWebdeck(wrap('<div class="el el-shape" data-shape="star" style="left:0px; top:0px; width:100px; height:50px;"></div>'))
  assert.ok(bad.errors.some((e) => e.includes('data-shape')))
})

test('line/arrow는 svg 자식 1개만 허용한다', () => {
  const wrap = (el) => `<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">${el}</section></main></body></html>`
  const ok = validateWebdeck(wrap('<div class="el el-shape" data-shape="line" style="left:0px; top:0px; width:100px; height:8px;"><svg></svg></div>'))
  assert.deepStrictEqual(ok.errors, [])
  const bad = validateWebdeck(wrap('<div class="el el-shape" data-shape="arrow" style="left:0px; top:0px; width:100px; height:8px;"><svg></svg><p>x</p></div>'))
  assert.ok(bad.errors.some((e) => e.includes('svg')))
})

const wrapSlide = (el) => `<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide">${el}</section></main></body></html>`
const tableEl = (inner) =>
  wrapSlide(
    `<div class="el el-table" style="left:0px; top:0px; width:400px; height:100px;"><table>${inner}</table></div>`,
  )

test('el-table — 정형은 통과, 부정합·중첩·비셀 자식은 오류', () => {
  const ok = validateWebdeck(tableEl('<tbody><tr><th colspan="2">H</th></tr><tr><td>a</td><td>b</td></tr></tbody>'))
  assert.deepStrictEqual(ok.errors, [])
  const mismatch = validateWebdeck(tableEl('<tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></tbody>'))
  assert.ok(mismatch.errors.some((e) => e.includes('el-table')))
  const nested = validateWebdeck(tableEl('<tbody><tr><td><table></table></td></tr></tbody>'))
  assert.ok(nested.errors.some((e) => e.includes('el-table')))
  const noTable = validateWebdeck(
    wrapSlide('<div class="el el-table" style="left:0px; top:0px; width:400px; height:100px;"></div>'),
  )
  assert.ok(noTable.errors.some((e) => e.includes('el-table')))
})

test('el-table — tbody 안 비-tr 자식은 오류 (재귀 반환값 폐기 회귀)', () => {
  // 유효한 tr을 담은 tbody 옆에 비정형 tbody를 둔다 — 재귀 반환값을 버리는 구현이면
  // 두 번째 tbody의 위반이 조용히 무시되고(trs가 첫 tbody의 tr만으로 비어있지 않게 되어)
  // 통과해버리는 회귀를 잡는다.
  const r = validateWebdeck(tableEl('<tbody><tr><td>a</td></tr></tbody><tbody><div>bad</div></tbody>'))
  assert.ok(r.errors.some((e) => e.includes('el-table')))
})

test('el-table — 중첩 tbody는 오류 (중첩 thead/tbody 허용 회귀)', () => {
  const r = validateWebdeck(tableEl('<tbody><tbody><tr><td>a</td></tr></tbody></tbody>'))
  assert.ok(r.errors.some((e) => e.includes('el-table')))
})

test('el-table — caption은 오류 (기존 정형 오류 문구)', () => {
  const r = validateWebdeck(tableEl('<caption>c</caption><tbody><tr><td>a</td></tr></tbody>'))
  assert.ok(r.errors.some((e) => e.includes('정형이 아닙니다')))
})

test('el-table 직계에 공백 아닌 텍스트가 있으면 오류 (에디터 hasStrayText 정합)', () => {
  const r = validateWebdeck(
    wrapSlide(
      '<div class="el el-table" style="left:0px; top:0px; width:400px; height:100px;">텍스트<table><tbody><tr><td>a</td></tr></tbody></table></div>',
    ),
  )
  assert.ok(r.errors.some((e) => e.includes('el-table') && e.includes('텍스트')))
  const okBlank = validateWebdeck(
    wrapSlide(
      '<div class="el el-table" style="left:0px; top:0px; width:400px; height:100px;">\n  <table><tbody><tr><td>a</td></tr></tbody></table>\n</div>',
    ),
  )
  assert.deepStrictEqual(okBlank.errors, [])
})

test('el-table — 완전 피복 빈 행(rowspan 확장, mergeCells 산출물)은 통과', () => {
  const r = validateWebdeck(tableEl('<tbody><tr><td colspan="2" rowspan="2">M</td></tr><tr></tr></tbody>'))
  assert.deepStrictEqual(r.errors, [])
})
