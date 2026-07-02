import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { validateWebdeck } from '../../../tools/lib/validate.mjs'
import { parseWebdeck } from './parse.ts'
import { serializeWebdeck } from './serialize.ts'

const TEMPLATES = import.meta.dirname ? `${import.meta.dirname}/../../../templates/` : fileURLToPath(new URL('../../../templates/', import.meta.url))
const NAMES = ['minimal.html', 'business-report.html', 'project-proposal.html']

describe('serializeWebdeck 왕복 계약', () => {
  test('parse → serialize → parse는 모델을 보존한다', () => {
    for (const name of NAMES) {
      const m1 = parseWebdeck(readFileSync(`${TEMPLATES}${name}`, 'utf8'))
      const m2 = parseWebdeck(serializeWebdeck(m1))
      expect(m2, name).toEqual(m1)
    }
  })

  test('두 번째 왕복부터는 문자열 고정점이다', () => {
    for (const name of NAMES) {
      const once = serializeWebdeck(parseWebdeck(readFileSync(`${TEMPLATES}${name}`, 'utf8')))
      const twice = serializeWebdeck(parseWebdeck(once))
      expect(twice, name).toBe(once)
    }
  })

  test('왕복한 템플릿은 검증기를 통과한다 (오류·경고 0건)', () => {
    for (const name of NAMES) {
      const out = serializeWebdeck(parseWebdeck(readFileSync(`${TEMPLATES}${name}`, 'utf8')))
      const { errors, warnings } = validateWebdeck(out)
      expect(errors, name).toEqual([])
      expect(warnings, name).toEqual([])
    }
  })

  test('opaque 요소는 원문 그대로 출력된다', () => {
    const raw = '<div class="fancy-widget" data-x="1"><span>?</span></div>'
    const html = `<!DOCTYPE html><html lang="ko" data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head><body><main class="deck" data-slide-width="1280" data-slide-height="720"><section class="slide">${raw}</section></main></body></html>`
    expect(serializeWebdeck(parseWebdeck(html))).toContain(raw)
  })

  test('제목과 속성값은 이스케이프된다', () => {
    const doc = parseWebdeck(
      `<!DOCTYPE html><html lang="ko" data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head><body><main class="deck" data-slide-width="1280" data-slide-height="720"><section class="slide"></section></main></body></html>`,
    )
    const edited = { ...doc, title: 'A < B & "C"' }
    const out = serializeWebdeck(edited)
    expect(out).toContain('<title>A &lt; B &amp; "C"</title>')
    expect(parseWebdeck(out).title).toBe('A < B & "C"')
  })
})
