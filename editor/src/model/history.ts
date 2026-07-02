import type { DeckDoc } from './types.ts'

export const HISTORY_LIMIT = 100

export interface History {
  past: DeckDoc[]
  present: DeckDoc
  future: DeckDoc[]
}

export function createHistory(initial: DeckDoc): History {
  return { past: [], present: initial, future: [] }
}

export function push(h: History, next: DeckDoc): History {
  const past = [...h.past, h.present]
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT)
  return { past, present: next, future: [] }
}

export function undo(h: History): History {
  if (h.past.length === 0) return h
  const past = h.past.slice(0, -1)
  const present = h.past[h.past.length - 1]!
  return { past, present, future: [h.present, ...h.future] }
}

export function redo(h: History): History {
  if (h.future.length === 0) return h
  const [present, ...future] = h.future
  return { past: [...h.past, h.present], present: present!, future }
}

export function canUndo(h: History): boolean {
  return h.past.length > 0
}

export function canRedo(h: History): boolean {
  return h.future.length > 0
}
