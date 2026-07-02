import { describe, expect, test } from 'vitest'
import { HISTORY_LIMIT, canRedo, canUndo, createHistory, push, redo, undo } from './history.ts'
import type { DeckDoc } from './types.ts'

function doc(title: string): DeckDoc {
  return { title, slideWidth: 1280, slideHeight: 720, headExtra: '', bodyAttrs: {}, bodyExtra: '', bodyScript: '', htmlAttrs: {}, slides: [] }
}

describe('history', () => {
  test('push → undo → redo', () => {
    let h = createHistory(doc('v1'))
    expect(canUndo(h)).toBe(false)
    h = push(h, doc('v2'))
    h = push(h, doc('v3'))
    expect(h.present.title).toBe('v3')
    h = undo(h)
    expect(h.present.title).toBe('v2')
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present.title).toBe('v3')
  })

  test('경계에서 undo/redo는 상태를 그대로 반환한다', () => {
    const h = createHistory(doc('v1'))
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })

  test('undo 후 push는 future를 버린다', () => {
    let h = push(createHistory(doc('v1')), doc('v2'))
    h = undo(h)
    h = push(h, doc('v2b'))
    expect(canRedo(h)).toBe(false)
    expect(h.present.title).toBe('v2b')
  })

  test('past는 HISTORY_LIMIT으로 제한된다', () => {
    let h = createHistory(doc('v0'))
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = push(h, doc(`v${i}`))
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]!.title).toBe(`v${10}`)
  })
})
