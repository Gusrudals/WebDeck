import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, PointerEvent as ReactPointerEvent } from 'react'

export const PALETTE = [
  '#000000', '#1f2937', '#6b7280', '#d1d5db', '#ffffff', '#1a56db',
  '#60a5fa', '#dc2626', '#16a34a', '#d97706', '#eab308', '#7c3aed',
]

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function normalizeHex(raw: string): string | null {
  const v = raw.trim()
  if (!HEX_PATTERN.test(v)) return null
  if (v.length === 4) return `#${[...v.slice(1)].map((c) => c + c).join('')}`.toLowerCase()
  return v.toLowerCase()
}

export interface ColorPopoverProps {
  label: string
  value?: string
  disabled?: boolean
  onPick: (color: string) => void
  /** 텍스트 편집 도구 모드 — 버튼이 편집 포커스를 뺏지 않게 하고 hex에 data-text-tool 부여 */
  textTool?: boolean
  /** 트리거 열기(textTool)·hex 포커스 시 호출 — 편집 셀렉션 저장용 */
  onActivate?: () => void
  /** hex 입력 blur 핸들러 — 편집 종료 폴백용 (textTool 컨텍스트) */
  onHexBlur?: (e: FocusEvent<HTMLInputElement>) => void
  showHex?: boolean
  clearLabel?: string
  onClear?: () => void
}

export function ColorPopover({
  label, value, disabled, onPick, textTool, onActivate, onHexBlur, showHex = true, clearLabel, onClear,
}: ColorPopoverProps) {
  const [open, setOpen] = useState(false)
  const [hexDraft, setHexDraft] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const keep = textTool ? (e: ReactPointerEvent) => e.preventDefault() : undefined

  useEffect(() => {
    if (!open) return
    const onOutside = (e: globalThis.PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onOutside)
    return () => window.removeEventListener('pointerdown', onOutside)
  }, [open])

  const pick = (color: string) => {
    onPick(color)
    setOpen(false)
    setHexDraft('')
  }

  const applyHex = () => {
    const hex = normalizeHex(hexDraft)
    if (hex) pick(hex)
  }

  return (
    <div className="color-popover-root" ref={rootRef}>
      <button
        type="button"
        className="color-trigger"
        aria-label={label}
        title={label}
        disabled={disabled}
        onPointerDown={(e) => {
          if (textTool) {
            e.preventDefault()
            onActivate?.()
          }
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="color-chip" style={{ background: value ?? 'transparent' }} />
        {label}
      </button>
      {open && (
        <div className="color-popover" role="dialog" aria-label={`${label} 선택`}>
          <div className="color-grid">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className="swatch"
                aria-label={`색 ${c}`}
                title={c}
                style={{ background: c }}
                onPointerDown={keep}
                onClick={() => pick(c)}
              />
            ))}
          </div>
          {showHex && (
            <div className="color-hex">
              <input
                aria-label={`${label} hex`}
                placeholder="#rrggbb"
                value={hexDraft}
                data-text-tool={textTool ? '1' : undefined}
                onFocus={textTool ? onActivate : undefined}
                onBlur={onHexBlur}
                onChange={(e) => setHexDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyHex()
                  }
                }}
              />
              <button type="button" onPointerDown={keep} onClick={applyHex}>적용</button>
            </div>
          )}
          {clearLabel && onClear && (
            <button
              type="button"
              className="color-clear"
              onPointerDown={keep}
              onClick={() => {
                onClear()
                setOpen(false)
              }}
            >
              {clearLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
