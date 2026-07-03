import { useEffect, useRef } from 'react'

/**
 * contentEditable 래퍼 — "모델이 진실" 원칙의 유일한 예외 구간.
 * innerHTML은 mount 시 1회만 주입하고(재렌더에도 편집 내용 유지),
 * blur·Escape 시 onCommit(innerHTML)으로 모델에 되돌린다.
 */
export function TextEditable({ html, onCommit }: { html: string; onCommit: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = html
    el.focus()
    try {
      const sel = window.getSelection?.()
      if (sel && document.createRange) {
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    } catch {
      // happy-dom 등 Range 미지원 환경에서는 캐럿 이동 생략 (편집 자체는 동작)
    }
    // mount 시 1회만 — html prop 변화에 반응하면 편집 중 내용이 날아간다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = () => {
    const el = ref.current
    if (el) onCommit(el.innerHTML)
  }

  return (
    <div
      ref={ref}
      className="text-editable"
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        // 텍스트 도구(크기 입력·hex·드롭다운)로의 포커스 이동은 편집 세션 유지 — 도구가 종료를 책임진다
        if ((e.relatedTarget as HTMLElement | null)?.closest?.('[data-text-tool]')) return
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          commit()
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  )
}
