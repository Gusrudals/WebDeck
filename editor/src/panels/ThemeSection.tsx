import type { Dispatch } from 'react'
import { THEME_PRESETS, readTheme, setThemeVars } from '../model/theme.ts'
import type { ThemeVarName } from '../model/theme.ts'
import type { DeckDoc } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'
import { ColorPopover } from './ColorPopover.tsx'
import { FONT_FAMILIES } from './format.ts'

const HEX = /^#[0-9a-fA-F]{6}$/

const COLOR_ROWS: [ThemeVarName, string][] = [
  ['--wd-primary', '강조색'],
  ['--wd-accent', '보조 배경'],
  ['--wd-text', '글자색'],
  ['--wd-muted', '보조 글자'],
]

const FONT_ROWS: [ThemeVarName, string][] = [
  ['--wd-font-heading', '제목 폰트'],
  ['--wd-font-body', '본문 폰트'],
]

export function ThemeSection({ doc, dispatch }: { doc: DeckDoc; dispatch: Dispatch<EditorAction> }) {
  const theme = readTheme(doc)
  if (!theme || Object.keys(theme).length === 0) {
    return (
      <section className="theme-section">
        <h2>문서 테마</h2>
        <p className="theme-empty">이 문서에는 테마 변수가 없습니다</p>
      </section>
    )
  }
  const apply = (patch: Partial<Record<ThemeVarName, string>>) => {
    const next = setThemeVars(doc, patch)
    if (next !== doc) dispatch({ type: 'APPLY_DOC', doc: next })
  }
  return (
    <section className="theme-section">
      <h2>문서 테마</h2>
      <div className="btn-row preset-row">
        {THEME_PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => apply(p.colors)}>
            <span className="preset-chip" style={{ background: p.colors['--wd-primary'] }} aria-hidden="true" />
            {p.label}
          </button>
        ))}
      </div>
      {COLOR_ROWS.filter(([name]) => theme[name] !== undefined).map(([name, label]) => {
        const value = theme[name]!
        const hex = HEX.test(value) ? value : undefined
        return (
          <div className="prop-row" key={name}>
            <ColorPopover label={label} value={hex} onPick={(c) => apply({ [name]: c })} />
            {!hex && <span className="notice-inline">사용자 지정 값 보존됨</span>}
          </div>
        )
      })}
      {FONT_ROWS.filter(([name]) => theme[name] !== undefined).map(([name, label]) => {
        const value = theme[name]!
        const known = FONT_FAMILIES.some((f) => f.stack === value)
        return (
          <label className="prop-row" key={name}>
            {label}
            <select
              aria-label={label}
              value={known ? value : 'custom'}
              onChange={(e) => {
                if (e.target.value !== 'custom' && e.target.value !== value) apply({ [name]: e.target.value })
              }}
            >
              {!known && <option value="custom">사용자 지정</option>}
              {FONT_FAMILIES.map((f) => (
                <option key={f.label} value={f.stack}>{f.label}</option>
              ))}
            </select>
          </label>
        )
      })}
    </section>
  )
}
