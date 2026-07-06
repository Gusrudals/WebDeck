import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { buildGrid } from '../model/tableOps.ts'
import type { TableCell, TableElement } from '../model/types.ts'
import { styleFromModel, cssTextToReact } from './styleFromModel.ts'
import { TextEditable } from './TextEditable.tsx'
import { serializeInlineStyle } from '../model/style.ts'

export interface TableInteraction {
  selectedRange: { r1: number; c1: number; r2: number; c2: number } | null
  editingCell: { r: number; c: number } | null
  onCellPointerDown: (e: ReactPointerEvent, r: number, c: number) => void
  onCellPointerEnter: (r: number, c: number) => void
  onCellDoubleClick: (r: number, c: number) => void
  onCellCommit: (r: number, c: number, html: string) => void
  onCellTab: (r: number, c: number, backward: boolean) => void
  onColBorderPointerDown: (e: ReactPointerEvent, leftCol: number) => void
}

function cellStyle(cell: TableCell) {
  return cssTextToReact(
    serializeInlineStyle({
      ...cell.extraStyle,
      ...(cell.bg !== null ? { background: cell.bg } : {}),
      ...(cell.align !== null ? { 'text-align': cell.align } : {}),
    }),
  )
}

function inRange(range: TableInteraction['selectedRange'], r: number, c: number, span: { rowspan: number; colspan: number }): boolean {
  if (!range) return false
  const top = Math.min(range.r1, range.r2)
  const bottom = Math.max(range.r1, range.r2)
  const left = Math.min(range.c1, range.c2)
  const right = Math.max(range.c1, range.c2)
  return r <= bottom && r + span.rowspan - 1 >= top && c <= right && c + span.colspan - 1 >= left
}

export function TableView({
  element,
  elementHandlers,
  table,
}: {
  element: TableElement
  elementHandlers?: { onPointerDown?: (e: ReactPointerEvent) => void; onDoubleClick?: () => void }
  table?: TableInteraction
}) {
  const grid = buildGrid(element)
  const anchorCols: number[][] = element.rows.map((row, r) => {
    const cols: number[] = []
    for (let c = 0; c < element.colWidths.length; c++) {
      const a = grid[r]?.[c]
      if (a && a.r === r && a.c === c) cols.push(c)
    }
    return cols
  })
  // 열 경계 누적 % (마지막 경계 제외)
  const boundaries: number[] = []
  let acc = 0
  for (let i = 0; i < element.colWidths.length - 1; i++) {
    acc += element.colWidths[i]!
    boundaries.push(acc)
  }
  return (
    <div className="el el-table" style={styleFromModel(element.frame, element.extraStyle, element.rotation)} {...(elementHandlers ?? {})}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <colgroup>
          {element.colWidths.map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <tbody>
          {element.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => {
                const c = anchorCols[r]![i]!
                const Tag = cell.header ? 'th' : 'td'
                const editing = table?.editingCell?.r === r && table.editingCell.c === c
                const selected = table ? inRange(table.selectedRange, r, c, cell) : false
                return (
                  <Tag
                    key={`${r}-${c}`}
                    data-r={r}
                    data-c={c}
                    colSpan={cell.colspan > 1 ? cell.colspan : undefined}
                    rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined}
                    className={selected ? 'cell-selected' : undefined}
                    style={cellStyle(cell)}
                    onPointerDown={table ? (e) => table.onCellPointerDown(e, r, c) : undefined}
                    onPointerEnter={table ? () => table.onCellPointerEnter(r, c) : undefined}
                    onDoubleClick={table ? (e) => { e.stopPropagation(); table.onCellDoubleClick(r, c) } : undefined}
                    onKeyDown={
                      editing
                        ? (e: ReactKeyboardEvent) => {
                            if (e.key === 'Tab') {
                              e.preventDefault()
                              ;(e.target as HTMLElement).blur()
                              table!.onCellTab(r, c, e.shiftKey)
                            }
                          }
                        : undefined
                    }
                  >
                    {editing ? (
                      <TextEditable html={cell.html} onCommit={(html) => table!.onCellCommit(r, c, html)} />
                    ) : (
                      <div dangerouslySetInnerHTML={{ __html: cell.html }} />
                    )}
                  </Tag>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {table &&
        boundaries.map((pct, i) => (
          <div
            key={i}
            className="col-resize-handle"
            style={{ left: `${pct}%` }}
            onPointerDown={(e) => table.onColBorderPointerDown(e, i)}
          />
        ))}
    </div>
  )
}
