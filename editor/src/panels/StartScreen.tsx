import { TEMPLATES } from '../file/templates.ts'

export function StartScreen({ onStart, onOpen }: { onStart: (key: string) => void; onOpen: () => void }) {
  return (
    <main className="canvas-area">
      <div className="start-screen">
        <h2>시작하기</h2>
        <div className="start-cards">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="start-card" onClick={() => onStart(t.key)}>
              <strong>{t.label}</strong>
              <span>{t.description}</span>
            </button>
          ))}
        </div>
        <button type="button" className="start-open" onClick={onOpen}>기존 문서 열기…</button>
      </div>
    </main>
  )
}
