import { useState } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent } from 'react'
import { alignFrame } from '../canvas/geometry.ts'
import type { AlignMode } from '../canvas/geometry.ts'
import {
  addElement,
  createImageElement,
  createShapeElement,
  createTextElement,
  moveElementZ,
  removeElement,
  setElementFrame,
  setSlideBg,
} from '../model/ops.ts'
import type { ZDirection } from '../model/ops.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction, EditorState } from '../state/store.ts'
import { FONT_SIZES, TEXT_COLORS, execColor, execFontSize, execFormat } from './format.ts'

const keepFocus = (e: ReactPointerEvent) => e.preventDefault()

function pickImage(onLoad: (dataUrl: string, fileName: string) => void): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onLoad(reader.result, file.name)
    }
    reader.readAsDataURL(file)
  }
  input.click()
}

export function Toolbar({
  state,
  dispatch,
  idGen,
}: {
  state: EditorState
  dispatch: Dispatch<EditorAction>
  idGen: () => string
}) {
  const { doc, currentSlideIndex, selectedIds, editingTextId } = state
  /** 배경색 피커 조작 중 임시값 — OS 피커 드래그 동안 onChange가 연속 발화하므로 blur 시 1회만 커밋 */
  const [bgDraft, setBgDraft] = useState<string | null>(null)
  const slide = doc?.slides[currentSlideIndex] ?? null
  const hasDoc = doc !== null && slide !== null
  const hasSelection = hasDoc && selectedIds.length > 0
  const singleId = hasSelection && selectedIds.length === 1 ? selectedIds[0]! : null
  const editing = editingTextId !== null

  const insertText = () => {
    if (!doc || !slide) return
    const el = createTextElement(idGen, { left: 440, top: 310, width: 400, height: 60 }, '<p>텍스트를 입력하세요</p>')
    dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
  }

  const insertShape = () => {
    if (!doc || !slide) return
    const el = createShapeElement(idGen, { left: 540, top: 300, width: 200, height: 120 }, 'var(--wd-accent)')
    dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
  }

  const insertImage = () => {
    if (!doc || !slide) return
    pickImage((dataUrl, fileName) => {
      const base = createImageElement(idGen, { left: 400, top: 180, width: 480, height: 360 }, dataUrl, fileName)
      const el = { ...base, imgStyle: 'width:100%; height:100%; object-fit: contain;' }
      dispatch({ type: 'APPLY_DOC', doc: addElement(doc, slide.id, el), select: [el.id] })
    })
  }

  const alignSelected = (mode: AlignMode) => {
    if (!doc || !slide) return
    let d = doc
    for (const el of slide.elements.filter(isKnownElement)) {
      if (selectedIds.includes(el.id)) {
        d = setElementFrame(d, slide.id, el.id, alignFrame(el.frame, doc.slideWidth, doc.slideHeight, mode))
      }
    }
    dispatch({ type: 'APPLY_DOC', doc: d })
  }

  const zOrder = (dir: ZDirection) => {
    if (!doc || !slide || !singleId) return
    const d = moveElementZ(doc, slide.id, singleId, dir)
    if (d !== doc) dispatch({ type: 'APPLY_DOC', doc: d })
  }

  const removeSelected = () => {
    if (!doc || !slide) return
    let d = doc
    for (const id of selectedIds) d = removeElement(d, slide.id, id)
    dispatch({ type: 'APPLY_DOC', doc: d, select: [] })
  }

  const changeBg = (value: string) => {
    if (!doc || !slide) return
    dispatch({ type: 'APPLY_DOC', doc: setSlideBg(doc, slide.id, value) })
  }

  const bgValue = slide?.bg && /^#[0-9a-fA-F]{6}$/.test(slide.bg) ? slide.bg : '#ffffff'

  return (
    <div className="toolbar" role="toolbar" aria-label="편집 도구">
      <div className="group" aria-label="삽입">
        <button type="button" disabled={!hasDoc} onClick={insertText}>텍스트 상자</button>
        <button type="button" disabled={!hasDoc} onClick={insertShape}>도형</button>
        <button type="button" disabled={!hasDoc} onClick={insertImage}>이미지</button>
      </div>
      <div className="group" aria-label="텍스트 서식">
        <button type="button" aria-label="굵게" title="굵게" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('bold')}><b>가</b></button>
        <button type="button" aria-label="기울임" title="기울임" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('italic')}><i>가</i></button>
        <button type="button" aria-label="밑줄" title="밑줄" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('underline')}><u>가</u></button>
        {FONT_SIZES.map((px) => (
          <button key={px} type="button" aria-label={`글자 크기 ${px}`} title={`글자 크기 ${px}px`} disabled={!editing} onPointerDown={keepFocus} onClick={() => execFontSize(px)}>{px}</button>
        ))}
        {TEXT_COLORS.map((c) => (
          <button key={c} type="button" className="swatch" aria-label={`글자색 ${c}`} title={`글자색 ${c}`} style={{ background: c }} disabled={!editing} onPointerDown={keepFocus} onClick={() => execColor(c)} />
        ))}
        <button type="button" aria-label="왼쪽 정렬" title="왼쪽 정렬" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('justifyLeft')}>⇤</button>
        <button type="button" aria-label="가운데 정렬" title="가운데 정렬" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('justifyCenter')}>⇔</button>
        <button type="button" aria-label="오른쪽 정렬" title="오른쪽 정렬" disabled={!editing} onPointerDown={keepFocus} onClick={() => execFormat('justifyRight')}>⇥</button>
      </div>
      <div className="group" aria-label="개체 정렬">
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('left')}>왼쪽</button>
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('center-h')}>가로 가운데</button>
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('right')}>오른쪽</button>
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('top')}>위</button>
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('middle')}>세로 가운데</button>
        <button type="button" disabled={!hasSelection} onClick={() => alignSelected('bottom')}>아래</button>
      </div>
      <div className="group" aria-label="순서">
        <button type="button" disabled={!singleId} onClick={() => zOrder('front')}>맨 앞</button>
        <button type="button" disabled={!singleId} onClick={() => zOrder('forward')}>앞으로</button>
        <button type="button" disabled={!singleId} onClick={() => zOrder('backward')}>뒤로</button>
        <button type="button" disabled={!singleId} onClick={() => zOrder('back')}>맨 뒤</button>
      </div>
      <div className="group" aria-label="요소">
        <button type="button" disabled={!hasSelection} onClick={removeSelected}>삭제</button>
      </div>
      <div className="group" aria-label="슬라이드">
        <label className="bg-label">
          배경
          <input
            type="color"
            aria-label="배경색"
            disabled={!hasDoc}
            value={bgDraft ?? bgValue}
            onChange={(e) => setBgDraft(e.target.value)}
            onBlur={() => {
              if (bgDraft !== null && bgDraft !== bgValue) changeBg(bgDraft)
              setBgDraft(null)
            }}
          />
        </label>
      </div>
    </div>
  )
}
