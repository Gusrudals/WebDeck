import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import { readTheme } from '../model/theme.ts'
import type { DeckDoc } from '../model/types.ts'
import { ThemeSection } from './ThemeSection.tsx'

const DOC = parseWebdeck(`<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>t</title><style>
  :root {
    --wd-primary: #1a56db;
    --wd-accent: #e8f0fe;
    --wd-text: #1f2937;
    --wd-muted: #6b7280;
    --wd-font-heading: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
    --wd-font-body: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
  }
</style></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section>
</main></body></html>`)

function setup(doc: DeckDoc = DOC) {
  const dispatch = vi.fn()
  const utils = render(<ThemeSection doc={doc} dispatch={dispatch} />)
  return { dispatch, ...utils }
}

function appliedDoc(dispatch: ReturnType<typeof vi.fn>): DeckDoc | null {
  const call = dispatch.mock.calls.find(([a]) => a?.type === 'APPLY_DOC')
  return call ? (call[0].doc as DeckDoc) : null
}

test('프리셋 1클릭은 색 4종을 1 APPLY_DOC으로 바꾼다', () => {
  const { dispatch, getByRole } = setup()
  fireEvent.click(getByRole('button', { name: /그린/ }))
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')).toHaveLength(1)
  const t = readTheme(appliedDoc(dispatch)!)!
  expect(t['--wd-primary']).toBe('#047857')
  expect(t['--wd-accent']).toBe('#ecfdf5')
})

test('폰트 select 변경은 1 APPLY_DOC, 같은 값은 no-dispatch', () => {
  const { dispatch, getByLabelText } = setup()
  const sel = getByLabelText('제목 폰트') as HTMLSelectElement
  fireEvent.change(sel, { target: { value: '"NanumMyeongjo", "나눔명조", "Batang", "바탕", serif' } })
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')).toHaveLength(1)
  expect(readTheme(appliedDoc(dispatch)!)!['--wd-font-heading']).toContain('NanumMyeongjo')
})

test('같은 폰트 값 재선택은 디스패치하지 않는다', () => {
  const { dispatch, getByLabelText } = setup()
  fireEvent.change(getByLabelText('본문 폰트'), { target: { value: '"Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif' } })
  expect(dispatch).not.toHaveBeenCalled()
})

test('테마 변수가 없는 문서는 안내만 보여준다', () => {
  const noTheme = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section></main></body></html>`)
  const { getByText, queryByLabelText } = setup(noTheme)
  expect(getByText('이 문서에는 테마 변수가 없습니다')).toBeTruthy()
  expect(queryByLabelText('제목 폰트')).toBeNull()
})

test(':root는 있지만 테마 변수가 없으면 안내만 보여준다 (최종 리뷰 회귀)', () => {
  const empty = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title><style>:root { --other: 1; }</style></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section></main></body></html>`)
  const { getByText, queryByRole } = setup(empty)
  expect(getByText('이 문서에는 테마 변수가 없습니다')).toBeTruthy()
  expect(queryByRole('button', { name: /파랑 기본/ })).toBeNull()
})

test('hex가 아닌 색 값은 사용자 지정 표시로 보존된다', () => {
  const weird = parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title><style>:root { --wd-primary: rgb(20, 20, 20); }</style></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"></section></main></body></html>`)
  const { getByText } = setup(weird)
  expect(getByText(/사용자 지정 값 보존됨/)).toBeTruthy()
})
