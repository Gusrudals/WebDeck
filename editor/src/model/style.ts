export function parseInlineStyle(text: string): Record<string, string> {
  const decls: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ';' && depth === 0) {
      decls.push(current)
      current = ''
      continue
    }
    current += ch
  }
  decls.push(current)

  const out: Record<string, string> = {}
  for (const decl of decls) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const value = decl.slice(idx + 1).trim()
    if (prop) out[prop] = value
  }
  return out
}

export function serializeInlineStyle(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([prop, value]) => `${prop}:${value};`)
    .join(' ')
}
