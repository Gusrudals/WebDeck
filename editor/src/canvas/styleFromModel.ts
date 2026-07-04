import type { CSSProperties } from 'react'
import { parseInlineStyle } from '../model/style.ts'
import type { Frame } from '../model/types.ts'

function toReactKeys(style: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [prop, value] of Object.entries(style)) {
    const key = prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    out[key] = value
  }
  return out
}

export function styleFromModel(frame: Frame, extraStyle: Record<string, string>, rotation = 0): CSSProperties {
  return {
    position: 'absolute',
    left: `${frame.left}px`,
    top: `${frame.top}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    ...(rotation !== 0 ? { transform: `rotate(${rotation}deg)` } : {}),
    ...toReactKeys(extraStyle),
  } as CSSProperties
}

export function cssTextToReact(text: string): CSSProperties {
  return toReactKeys(parseInlineStyle(text)) as CSSProperties
}

export function extractThemeVars(headExtra: string): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const match of headExtra.matchAll(/(--wd-[a-z-]+)\s*:\s*([^;}]+)/g)) {
    vars[match[1]!] = match[2]!.trim()
  }
  return vars
}
