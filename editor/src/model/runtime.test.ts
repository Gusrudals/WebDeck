import { describe, expect, test } from 'vitest'
import { parseWebdeck } from './parse.ts'
import { RUNTIME_SCRIPT, RUNTIME_VERSION, normalizeRuntime } from './runtime.ts'
import type { DeckDoc } from './types.ts'

const BASE = `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
</main></body></html>`

/** 현행(구) v1 런타임 — 마킹 없음, 시그니처(dataset.slideWidth + beforeprint) 포함 */
const OLD_V1 = `<script>
  (function () {
    var deck = document.querySelector('.deck');
    var slideWidth = Number(deck.dataset.slideWidth) || 1280;
    function fit() { deck.style.zoom = 1; }
    window.addEventListener('beforeprint', function () { deck.style.zoom = 1; });
    fit();
  })();
</script>`

const CUSTOM = '<script>console.log("사용자 커스텀");</script>'
const OLD_MARKED = '<script data-webdeck-runtime="1">(function(){})();</script>'

function docWith(bodyScript: string): DeckDoc {
  return { ...parseWebdeck(BASE), bodyScript }
}

describe('normalizeRuntime', () => {
  test('RUNTIME_SCRIPT는 현재 버전 마커를 갖는다', () => {
    expect(RUNTIME_SCRIPT).toContain(`data-webdeck-runtime="${RUNTIME_VERSION}"`)
    expect(RUNTIME_VERSION).toBe(2)
  })

  test('마킹된 구버전 런타임을 최신본으로 교체한다', () => {
    const out = normalizeRuntime(docWith(OLD_MARKED))
    expect(out.bodyScript).toBe(RUNTIME_SCRIPT)
  })

  test('마킹 없는 v1 시그니처 런타임을 교체한다', () => {
    const out = normalizeRuntime(docWith(OLD_V1))
    expect(out.bodyScript).toBe(RUNTIME_SCRIPT)
  })

  test('커스텀 스크립트는 순서 그대로 보존한다', () => {
    const out = normalizeRuntime(docWith(`${CUSTOM}\n${OLD_V1}`))
    expect(out.bodyScript.startsWith(CUSTOM)).toBe(true)
    expect(out.bodyScript).toContain(`data-webdeck-runtime="${RUNTIME_VERSION}"`)
  })

  test('스크립트가 하나도 없으면 런타임을 추가한다', () => {
    const out = normalizeRuntime(docWith(''))
    expect(out.bodyScript).toBe(RUNTIME_SCRIPT)
  })

  test('미인식 스크립트만 있으면 아무것도 추가·변경하지 않는다 (같은 객체)', () => {
    const doc = docWith(CUSTOM)
    expect(normalizeRuntime(doc)).toBe(doc)
  })

  test('교체 대상이 여럿이면 첫 자리에 1개로 정리한다', () => {
    const out = normalizeRuntime(docWith(`${OLD_MARKED}\n${CUSTOM}\n${OLD_V1}`))
    const occurrences = out.bodyScript.split(`data-webdeck-runtime="${RUNTIME_VERSION}"`).length - 1
    expect(occurrences).toBe(1)
    expect(out.bodyScript.indexOf(RUNTIME_SCRIPT)).toBeLessThan(out.bodyScript.indexOf(CUSTOM))
  })

  test('멱등: 정규화 결과를 다시 정규화하면 같은 객체를 반환한다', () => {
    const once = normalizeRuntime(docWith(OLD_V1))
    expect(normalizeRuntime(once)).toBe(once)
  })
})
