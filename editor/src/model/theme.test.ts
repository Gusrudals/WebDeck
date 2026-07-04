import { describe, expect, test } from 'vitest'
import { parseWebdeck } from './parse.ts'
import { checkRoundTrip } from './roundtrip.ts'
import { THEME_PRESETS, readTheme, setThemeVars } from './theme.ts'

const DOC_HTML = `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title><style>
  /* 상단 주석 유지 확인용 */
  :root {
    --wd-primary: #1a56db;
    --wd-accent: #e8f0fe;
    --wd-text: #1f2937;
    --wd-muted: #6b7280;
    --wd-font-heading: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
    --wd-font-body: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
  }
  .slide { background: #fff; }
</style></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
</main></body></html>`

const doc = () => parseWebdeck(DOC_HTML)

describe('readTheme', () => {
  test('6종 변수를 읽는다', () => {
    const t = readTheme(doc())!
    expect(t['--wd-primary']).toBe('#1a56db')
    expect(t['--wd-muted']).toBe('#6b7280')
    expect(t['--wd-font-heading']).toBe('"Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif')
  })

  test(':root 블록이 없으면 null', () => {
    const d = parseWebdeck(DOC_HTML.replace(/:root \{[\s\S]*?\}/, ''))
    expect(readTheme(d)).toBeNull()
  })

  test('일부 변수만 있으면 있는 것만 반환한다', () => {
    const d = parseWebdeck(DOC_HTML.replace('--wd-muted: #6b7280;', ''))
    const t = readTheme(d)!
    expect(t['--wd-muted']).toBeUndefined()
    expect(t['--wd-primary']).toBe('#1a56db')
  })
})

describe('setThemeVars', () => {
  test('값 부분만 교체하고 주변 CSS는 바이트 무손상', () => {
    const d = doc()
    const out = setThemeVars(d, { '--wd-primary': '#ff0000' })
    expect(readTheme(out)!['--wd-primary']).toBe('#ff0000')
    // 값 문자열 치환 외에 다른 바이트가 변하지 않았다
    expect(out.headExtra).toBe(d.headExtra.replace('#1a56db', '#ff0000'))
    expect(out.headExtra).toContain('/* 상단 주석 유지 확인용 */')
    expect(out.headExtra).toContain('.slide { background: #fff; }')
    expect(checkRoundTrip(out)).toBeNull()
  })

  test('여러 변수를 한 번에 교체한다 (프리셋)', () => {
    const preset = THEME_PRESETS[1]!
    const out = setThemeVars(doc(), preset.colors)
    const t = readTheme(out)!
    expect(t['--wd-primary']).toBe('#047857')
    expect(t['--wd-accent']).toBe('#ecfdf5')
  })

  test('블록에 없는 변수는 무시한다 (주입 금지)', () => {
    const d = parseWebdeck(DOC_HTML.replace('--wd-muted: #6b7280;', ''))
    const out = setThemeVars(d, { '--wd-muted': '#000000' })
    expect(out.headExtra).toBe(d.headExtra)
  })

  test('변경이 없으면 같은 객체를 반환한다', () => {
    const d = doc()
    expect(setThemeVars(d, { '--wd-primary': '#1a56db' })).toBe(d)
    const noRoot = parseWebdeck(DOC_HTML.replace(/:root \{[\s\S]*?\}/, ''))
    expect(setThemeVars(noRoot, { '--wd-primary': '#ff0000' })).toBe(noRoot)
  })

  test('프리셋은 4종이고 색 4개씩 갖는다', () => {
    expect(THEME_PRESETS).toHaveLength(4)
    expect(THEME_PRESETS.map((p) => p.label)).toEqual(['파랑 기본', '그린', '버건디', '다크 네이비'])
    for (const p of THEME_PRESETS) expect(Object.keys(p.colors)).toHaveLength(4)
  })
})
