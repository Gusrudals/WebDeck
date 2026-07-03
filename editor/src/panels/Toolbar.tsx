import { useState } from 'react'
import type { Dispatch, FocusEvent, PointerEvent as ReactPointerEvent } from 'react'
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
  setTextHtml,
} from '../model/ops.ts'
import type { ZDirection } from '../model/ops.ts'
import { isKnownElement } from '../model/types.ts'
import type { EditorAction, EditorState } from '../state/store.ts'
import {
  FONT_FAMILIES, FONT_SIZES, LINE_HEIGHTS, clampFontSize, execColor, execFontName, execFontSize, execFormat, execList,
  focusEditable, restoreSelection, saveSelection, setLineHeight,
} from './format.ts'
import { ColorPopover } from './ColorPopover.tsx'

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
  const slide = doc?.slides[currentSlideIndex] ?? null
  const hasDoc = doc !== null && slide !== null
  const hasSelection = hasDoc && selectedIds.length > 0
  const singleId = hasSelection && selectedIds.length === 1 ? selectedIds[0]! : null
  const editing = editingTextId !== null
  const [sizeDraft, setSizeDraft] = useState('')

  /** 텍스트 도구 blur 폴백 — 포커스가 도구/에디터블 밖으로 나가면 편집을 정상 종료한다 */
  const commitEditingFromTool = (e: FocusEvent<HTMLElement>) => {
    const next = e.relatedTarget as HTMLElement | null
    if (next?.closest?.('[data-text-tool], .text-editable')) return
    const node = document.querySelector<HTMLElement>('.text-editable')
    if (!node || !doc || !slide || editingTextId === null) return
    const el = slide.elements.filter(isKnownElement).find((k) => k.id === editingTextId)
    if (el?.type === 'text' && el.html !== node.innerHTML) {
      dispatch({ type: 'APPLY_DOC', doc: setTextHtml(doc, slide.id, editingTextId, node.innerHTML) })
    }
    dispatch({ type: 'END_TEXT_EDIT' })
  }

  const applyFontSize = () => {
    const n = Number(sizeDraft)
    if (sizeDraft.trim() === '' || !Number.isFinite(n)) return
    restoreSelection()
    execFontSize(clampFontSize(n))
    focusEditable()
    setSizeDraft('')
  }

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
        <select
          aria-label="폰트"
          data-text-tool="1"
          disabled={!editing}
          value=""
          onFocus={saveSelection}
          onBlur={commitEditingFromTool}
          onChange={(e) => {
            if (!e.target.value) return
            restoreSelection()
            execFontName(e.target.value)
            focusEditable()
          }}
        >
          <option value="" disabled>폰트</option>
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.stack}>{f.label}</option>
          ))}
        </select>
        <input
          className="size-input"
          aria-label="글자 크기"
          data-text-tool="1"
          placeholder="크기"
          inputMode="numeric"
          disabled={!editing}
          value={sizeDraft}
          onFocus={saveSelection}
          onBlur={(e) => {
            setSizeDraft('')
            commitEditingFromTool(e)
          }}
          onChange={(e) => setSizeDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applyFontSize()
            }
          }}
        />
        <select
          aria-label="글자 크기 프리셋"
          data-text-tool="1"
          disabled={!editing}
          value=""
          onFocus={saveSelection}
          onBlur={commitEditingFromTool}
          onChange={(e) => {
            const px = Number(e.target.value)
            if (!px) return
            restoreSelection()
            execFontSize(px)
            focusEditable()
          }}
        >
          <option value="" disabled>크기</option>
          {FONT_SIZES.map((px) => (
            <option key={px} value={px}>{px}px</option>
          ))}
        </select>
        <ColorPopover
          label="글자색"
          disabled={!editing}
          textTool
          onActivate={saveSelection}
          onHexBlur={commitEditingFromTool}
          onPick={(c) => {
            restoreSelection()
            execColor(c)
            focusEditable()
          }}
        />
        <button type="button" aria-label="글머리 기호" title="글머리 기호" disabled={!editing} onPointerDown={keepFocus} onClick={() => execList('ul')}>••</button>
        <button type="button" aria-label="번호 매기기" title="번호 매기기" disabled={!editing} onPointerDown={keepFocus} onClick={() => execList('ol')}>1.</button>
        <select
          aria-label="줄 간격"
          data-text-tool="1"
          disabled={!editing}
          value=""
          onFocus={saveSelection}
          onBlur={commitEditingFromTool}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (!v) return
            restoreSelection()
            setLineHeight(v)
            focusEditable()
          }}
        >
          <option value="" disabled>줄간격</option>
          {LINE_HEIGHTS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
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
    </div>
  )
}
