import { useMemo } from 'react'
import { extractThemeVars } from '../canvas/styleFromModel.ts'
import { SlideView } from '../canvas/SlideView.tsx'
import type { CustomTemplate } from '../file/customTemplates.ts'
import { TEMPLATES } from '../file/templates.ts'
import { parseWebdeck } from '../model/parse.ts'

const CARD_THUMB_WIDTH = 148

function TemplateThumb({ html }: { html: string }) {
  const preview = useMemo(() => {
    try {
      const doc = parseWebdeck(html)
      const slide = doc.slides[0]
      if (!slide) return null
      return { slide, width: doc.slideWidth, height: doc.slideHeight, themeVars: extractThemeVars(doc.headExtra) }
    } catch {
      return null
    }
  }, [html])
  if (!preview) return <div className="card-thumb card-thumb-error">미리보기 불가</div>
  const scale = CARD_THUMB_WIDTH / preview.width
  return (
    <div className="card-thumb" style={{ width: CARD_THUMB_WIDTH, height: preview.height * scale }} aria-hidden="true">
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <SlideView slide={preview.slide} width={preview.width} height={preview.height} themeVars={preview.themeVars} />
      </div>
    </div>
  )
}

export function StartScreen({
  onStart,
  onOpen,
  customTemplates,
  onImport,
  onDeleteTemplate,
}: {
  onStart: (key: string) => void
  onOpen: () => void
  customTemplates: CustomTemplate[]
  onImport: () => void
  onDeleteTemplate: (id: string) => void
}) {
  return (
    <main className="canvas-area">
      <div className="start-screen">
        <h2>시작하기</h2>
        <div className="start-cards">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="start-card" onClick={() => onStart(t.key)}>
              <TemplateThumb html={t.html} />
              <strong>{t.label}</strong>
              <span>{t.description}</span>
            </button>
          ))}
          {customTemplates.map((t) => (
            <div key={t.id} className="start-card custom-card">
              <button type="button" className="card-main" onClick={() => onStart(t.id)}>
                <TemplateThumb html={t.html} />
                <strong>{t.label}</strong>
                <span>내 템플릿</span>
              </button>
              <button
                type="button"
                className="card-delete"
                aria-label={`템플릿 ${t.label} 삭제`}
                onClick={() => onDeleteTemplate(t.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="start-open" onClick={onImport}>파일에서 템플릿 가져오기…</button>
        <button type="button" className="start-open" onClick={onOpen}>기존 문서 열기…</button>
      </div>
    </main>
  )
}
