import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import type { DeckDoc } from '../model/types.ts'
import { SlideBgSection } from './SlideBgSection.tsx'

if (!window.confirm) window.confirm = () => true
if (!window.alert) window.alert = () => {}

function docWith(bgAttr: string) {
  return parseWebdeck(`<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>t</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"${bgAttr}></section></main></body></html>`)
}

function setup(bgAttr = ' data-bg="#ffffff"', readFile?: (f: File) => Promise<string>) {
  const doc = docWith(bgAttr)
  const dispatch = vi.fn()
  const utils = render(
    <SlideBgSection doc={doc} slide={doc.slides[0]!} dispatch={dispatch} readFile={readFile} />,
  )
  return { doc, dispatch, ...utils }
}

function appliedBg(dispatch: ReturnType<typeof vi.fn>): string | null | undefined {
  const call = dispatch.mock.calls.find(([a]) => a?.type === 'APPLY_DOC')
  return call ? (call[0].doc as DeckDoc).slides[0]!.bg : undefined
}

test('단색 모드: 기존 bgDraft 패턴 — blur 시 1회 커밋', () => {
  const { dispatch, getByLabelText } = setup()
  const input = getByLabelText('배경색')
  fireEvent.change(input, { target: { value: '#ff0000' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.blur(input)
  expect(appliedBg(dispatch)).toBe('#ff0000')
  expect(dispatch.mock.calls.filter(([a]) => a?.type === 'APPLY_DOC')).toHaveLength(1)
})

test('유형 전환 자체는 디스패치하지 않는다', () => {
  const { dispatch, getByLabelText } = setup()
  fireEvent.change(getByLabelText('배경 유형'), { target: { value: 'gradient' } })
  expect(dispatch).not.toHaveBeenCalled()
})

test('그라데이션: 색·방향 후 적용 1회 커밋', () => {
  const { dispatch, getByLabelText, getByRole } = setup()
  fireEvent.change(getByLabelText('배경 유형'), { target: { value: 'gradient' } })
  fireEvent.change(getByLabelText('시작 색'), { target: { value: '#1a56db' } })
  fireEvent.change(getByLabelText('끝 색'), { target: { value: '#e8f0fe' } })
  fireEvent.change(getByLabelText('방향'), { target: { value: '90' } })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.click(getByRole('button', { name: '적용' }))
  expect(appliedBg(dispatch)).toBe('linear-gradient(90deg, #1a56db, #e8f0fe)')
})

test('기존 규약 그라데이션 값은 역파싱해 초기 표시한다', () => {
  const { getByLabelText } = setup(' data-bg="linear-gradient(180deg, #111111, #222222)"')
  expect((getByLabelText('배경 유형') as HTMLSelectElement).value).toBe('gradient')
  expect((getByLabelText('시작 색') as HTMLInputElement).value).toBe('#111111')
})

test('custom 값은 사용자 지정으로 표시하고 보존한다', () => {
  const { dispatch, getByLabelText, getByText } = setup(' data-bg="var(--wd-accent)"')
  expect((getByLabelText('배경 유형') as HTMLSelectElement).value).toBe('custom')
  expect(getByText(/사용자 지정 값 보존됨/)).toBeTruthy()
  expect(dispatch).not.toHaveBeenCalled()
})

test('이미지: 파일 선택 → data URI로 1회 커밋', async () => {
  const readFile = vi.fn().mockResolvedValue('data:image/png;base64,AAAA')
  const { dispatch, getByLabelText } = setup(' data-bg="#ffffff"', readFile)
  fireEvent.change(getByLabelText('배경 유형'), { target: { value: 'image' } })
  const file = new File(['x'], 'bg.png', { type: 'image/png' })
  fireEvent.change(getByLabelText('배경 이미지 선택'), { target: { files: [file] } })
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalled())
  expect(appliedBg(dispatch)).toBe('url(data:image/png;base64,AAAA) center / cover no-repeat')
})

test('그라데이션에서 단색 흰색으로 전환할 수 있다 (최종 리뷰 회귀)', () => {
  const { dispatch, getByLabelText } = setup(' data-bg="linear-gradient(180deg, #111111, #222222)"')
  fireEvent.change(getByLabelText('배경 유형'), { target: { value: 'solid' } })
  const input = getByLabelText('배경색')
  // 단색 전환 직후 표시값은 흰색 폴백(solidValue)과 우연히 같아, 흰색으로 단일 change를 쏘면
  // jsdom의 값 트래커가 "값 변화 없음"으로 보고 React onChange 자체가 발화하지 않는다(React/jsdom 공통 동작).
  // 실사용에서는 사용자가 피커를 열어 다른 색을 거쳤다가 다시 흰색을 고르는 경로로 동일 현상이 재현되므로
  // 중간에 다른 색을 한 번 거쳐 실제 값 변화를 발생시킨 뒤 흰색으로 되돌린다 — 회귀 대상인 가드
  // `bgDraft !== solidValue`는 이 경로에서 bgDraft가 solidValue와 같아지는 순간 커밋을 막았었다.
  fireEvent.change(input, { target: { value: '#123456' } })
  fireEvent.change(input, { target: { value: '#ffffff' } })
  fireEvent.blur(input)
  expect(appliedBg(dispatch)).toBe('#ffffff')
})

test('이미지가 아닌 파일은 무시하고 알림한다', async () => {
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
  const readFile = vi.fn()
  const { dispatch, getByLabelText } = setup(' data-bg="#ffffff"', readFile)
  fireEvent.change(getByLabelText('배경 유형'), { target: { value: 'image' } })
  const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
  fireEvent.change(getByLabelText('배경 이미지 선택'), { target: { files: [file] } })
  expect(alertSpy).toHaveBeenCalled()
  expect(readFile).not.toHaveBeenCalled()
  expect(dispatch).not.toHaveBeenCalled()
  alertSpy.mockRestore()
})
