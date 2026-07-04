import { useState } from 'react'
import type { ChangeEvent, Dispatch } from 'react'
import { readFileAsDataUrl } from '../file/fileAccess.ts'
import { buildGradient, buildImageBg, parseBg } from '../model/bg.ts'
import type { BgAngle } from '../model/bg.ts'
import { setSlideBg } from '../model/ops.ts'
import type { DeckDoc, Slide } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'

type BgMode = 'solid' | 'gradient' | 'image' | 'custom'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024

export function SlideBgSection({
  doc,
  slide,
  dispatch,
  readFile = readFileAsDataUrl,
}: {
  doc: DeckDoc
  slide: Slide
  dispatch: Dispatch<EditorAction>
  /** 테스트 주입용 — 기본은 FileReader 기반 */
  readFile?: (file: File) => Promise<string>
}) {
  const bg = parseBg(slide.bg)
  const initialMode: BgMode = bg.kind === 'gradient' ? 'gradient' : bg.kind === 'image' ? 'image' : bg.kind === 'custom' ? 'custom' : 'solid'
  const [mode, setMode] = useState<BgMode>(initialMode)
  /** 단색 드래프트 — OS 피커 드래그 동안 onChange 연속 발화, blur 시 1회 커밋 */
  const [bgDraft, setBgDraft] = useState<string | null>(null)
  const [from, setFrom] = useState(bg.kind === 'gradient' ? bg.from : '#1a56db')
  const [to, setTo] = useState(bg.kind === 'gradient' ? bg.to : '#e8f0fe')
  const [angle, setAngle] = useState<BgAngle>(bg.kind === 'gradient' ? bg.angle : 180)

  const commit = (value: string) => {
    if (value !== slide.bg) dispatch({ type: 'APPLY_DOC', doc: setSlideBg(doc, slide.id, value) })
  }

  const solidValue = bg.kind === 'solid' ? bg.color : '#ffffff'

  async function handleImageFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      window.alert('이미지 파일만 선택할 수 있습니다')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      if (!window.confirm(`파일이 큽니다 (${mb}MB). 문서 파일이 그만큼 커집니다. 계속할까요?`)) return
    }
    let dataUri: string
    try {
      dataUri = await readFile(file)
    } catch {
      window.alert('이미지를 읽지 못했습니다')
      return
    }
    commit(buildImageBg(dataUri))
  }

  return (
    <>
      <label className="prop-row">
        배경 유형
        <select aria-label="배경 유형" value={mode} onChange={(e) => setMode(e.target.value as BgMode)}>
          <option value="solid">단색</option>
          <option value="gradient">그라데이션</option>
          <option value="image">이미지</option>
          {bg.kind === 'custom' && <option value="custom">사용자 지정</option>}
        </select>
      </label>
      {mode === 'custom' && <span className="notice-inline">사용자 지정 값 보존됨</span>}
      {mode === 'solid' && (
        <label className="prop-row">
          배경색
          <input
            type="color"
            aria-label="배경색"
            value={bgDraft ?? solidValue}
            onChange={(e) => setBgDraft(e.target.value)}
            onBlur={() => {
              if (bgDraft !== null && bgDraft !== solidValue) commit(bgDraft)
              setBgDraft(null)
            }}
          />
        </label>
      )}
      {mode === 'gradient' && (
        <>
          <label className="prop-row">
            시작 색
            <input type="color" aria-label="시작 색" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="prop-row">
            끝 색
            <input type="color" aria-label="끝 색" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="prop-row">
            방향
            <select aria-label="방향" value={String(angle)} onChange={(e) => setAngle(Number(e.target.value) as BgAngle)}>
              <option value="180">아래로</option>
              <option value="90">오른쪽으로</option>
              <option value="0">위로</option>
              <option value="270">왼쪽으로</option>
            </select>
          </label>
          <div className="btn-row">
            <button type="button" onClick={() => commit(buildGradient(angle, from, to))}>적용</button>
          </div>
        </>
      )}
      {mode === 'image' && (
        <label className="prop-col">
          배경 이미지
          <input type="file" accept="image/*" aria-label="배경 이미지 선택" onChange={handleImageFile} />
        </label>
      )}
    </>
  )
}
