import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateWebdeck, parseInlineStyle } from './validate.mjs'
import { makeDoc } from './test-helpers.mjs'

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

test('parseInlineStyle은 선언을 소문자 속성 맵으로 파싱한다', () => {
  assert.deepEqual(parseInlineStyle('LEFT: 10px; top:20px ; color: var(--wd-text)'), {
    left: '10px',
    top: '20px',
    color: 'var(--wd-text)',
  })
})
