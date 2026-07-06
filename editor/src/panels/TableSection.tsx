import type { Dispatch } from 'react'
import type { TableSel } from '../App.tsx'
import {
  canMergeCells, flattenAnchors, insertCol, insertRow, mergeCells,
  removeCol, removeRow, setCellsStyle, splitCell, toggleHeaderCells,
} from '../model/tableOps.ts'
import type { CellAlign, DeckDoc, Slide, TableElement } from '../model/types.ts'
import type { EditorAction } from '../state/store.ts'
import { ColorPopover } from './ColorPopover.tsx'

const HEX = /^#[0-9a-fA-F]{6}$/

export function TableSection({
  doc, slide, el, sel, dispatch,
}: {
  doc: DeckDoc
  slide: Slide
  el: TableElement
  sel: TableSel | null
  dispatch: Dispatch<EditorAction>
}) {
  const active = sel && sel.elementId === el.id ? sel : null
  // 브리프 보정 1: 행/열 삭제 후에도 같은 표 선택이 유지되면(App의 같은-표 가드) tableSel이
  // 삭제된 행/열 좌표를 그대로 가리킬 수 있다(스테일). rect를 현재 격자 경계로 클램프해
  // insertRow/removeRow 등에 범위 밖 index가 전달되는 것을 막는다(tableOps는 미가드 — Task 4 리뷰).
  const clampR = (v: number) => Math.min(Math.max(v, 0), el.rows.length - 1)
  const clampC = (v: number) => Math.min(Math.max(v, 0), el.colWidths.length - 1)
  const rect = active
    ? {
        r1: clampR(Math.min(active.anchor[0], active.extent[0])),
        c1: clampC(Math.min(active.anchor[1], active.extent[1])),
        r2: clampR(Math.max(active.anchor[0], active.extent[0])),
        c2: clampC(Math.max(active.anchor[1], active.extent[1])),
      }
    : null
  const apply = (next: DeckDoc) => {
    if (next !== doc) dispatch({ type: 'APPLY_DOC', doc: next })
  }
  const anchorCell = rect ? flattenAnchors(el).find((a) => a.r === rect.r1 && a.c === rect.c1) : undefined
  const canSplit = !!anchorCell && (anchorCell.cell.colspan > 1 || anchorCell.cell.rowspan > 1)
  const canMerge = rect !== null && canMergeCells(el, rect.r1, rect.c1, rect.r2, rect.c2)
  const bgValue = anchorCell && anchorCell.cell.bg !== null && HEX.test(anchorCell.cell.bg) ? anchorCell.cell.bg : undefined

  return (
    <section className="theme-section">
      <h2>표</h2>
      <div className="btn-row">
        <button type="button" onClick={() => apply(insertRow(doc, slide.id, el.id, rect ? rect.r1 + 1 : el.rows.length))}>행 추가</button>
        <button type="button" disabled={!rect} onClick={() => rect && apply(removeRow(doc, slide.id, el.id, rect.r1))}>행 삭제</button>
        <button type="button" onClick={() => apply(insertCol(doc, slide.id, el.id, rect ? rect.c1 + 1 : el.colWidths.length))}>열 추가</button>
        <button type="button" disabled={!rect} onClick={() => rect && apply(removeCol(doc, slide.id, el.id, rect.c1))}>열 삭제</button>
      </div>
      <div className="btn-row">
        <button type="button" disabled={!canMerge} onClick={() => rect && apply(mergeCells(doc, slide.id, el.id, rect.r1, rect.c1, rect.r2, rect.c2))}>병합</button>
        <button type="button" disabled={!canSplit} onClick={() => rect && apply(splitCell(doc, slide.id, el.id, rect.r1, rect.c1))}>분할</button>
        <button type="button" disabled={!rect} onClick={() => rect && apply(toggleHeaderCells(doc, slide.id, el.id, rect.r1, rect.c1, rect.r2, rect.c2))}>헤더</button>
      </div>
      <div className="prop-row">
        <ColorPopover
          label="셀 배경"
          value={bgValue}
          disabled={!rect}
          onPick={(c) => rect && apply(setCellsStyle(doc, slide.id, el.id, rect.r1, rect.c1, rect.r2, rect.c2, { bg: c }))}
          clearLabel="배경 없음"
          onClear={() => rect && apply(setCellsStyle(doc, slide.id, el.id, rect.r1, rect.c1, rect.r2, rect.c2, { bg: null }))}
        />
      </div>
      <div className="btn-row">
        {(['left', 'center', 'right'] as CellAlign[]).map((a) => (
          <button
            key={a}
            type="button"
            disabled={!rect}
            aria-label={`셀 ${a === 'left' ? '왼쪽' : a === 'center' ? '가운데' : '오른쪽'} 정렬`}
            onClick={() => rect && apply(setCellsStyle(doc, slide.id, el.id, rect.r1, rect.c1, rect.r2, rect.c2, { align: a }))}
          >
            {a === 'left' ? '⟸' : a === 'center' ? '⟺' : '⟹'}
          </button>
        ))}
      </div>
    </section>
  )
}
