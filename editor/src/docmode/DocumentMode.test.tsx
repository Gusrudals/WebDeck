import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { DocumentMode } from './DocumentMode.tsx'
import type { DocModeFile } from './DocumentMode.tsx'

// happy-dom에는 window.confirm이 없어 vi.spyOn 대상이 될 프로퍼티가 없다 — 채워둔다
if (!window.confirm) window.confirm = () => true

const PLAIN_HTML = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>보고서</title><style>body { color: #111; }</style></head>
<body>
<h1>분기 보고</h1>
<p>본문 내용</p>
<script>console.log('chart')</script>
</body>
</html>`

/** DOMParser 문서를 편집 표면으로 주입하고 iframe load를 수동 트리거한다 (happy-dom은 srcdoc을 로드하지 않음) */
function setup(over: Partial<DocModeFile> = {}, onOpen = vi.fn()) {
  const editDoc = new DOMParser().parseFromString(PLAIN_HTML, 'text/html')
  const file: DocModeFile = { name: 'plain.html', handle: null, html: PLAIN_HTML, ...over }
  render(<DocumentMode file={file} onOpen={onOpen} getEditDocument={() => editDoc} />)
  fireEvent.load(screen.getByTitle('문서 편집'))
  return { editDoc, onOpen }
}

function writableHandle() {
  const written: string[] = []
  const handle = {
    createWritable: () =>
      Promise.resolve({
        write: (d: string) => {
          written.push(d)
          return Promise.resolve()
        },
        close: () => Promise.resolve(),
      }),
  } as unknown as FileSystemFileHandle
  return { handle, written }
}

test('배지·파일명·버튼이 렌더링되고 본문이 편집 가능해진다', () => {
  const { editDoc } = setup()
  expect(screen.getByText('문서 모드 — 일반 HTML')).toBeTruthy()
  expect(screen.getByText('plain.html')).toBeTruthy()
  expect(screen.getByRole('button', { name: '저장' })).toBeTruthy()
  expect(editDoc.body.getAttribute('contenteditable')).toBe('true')
})

test('iframe은 스크립트 실행을 차단하는 sandbox로 렌더링된다', () => {
  setup()
  expect(screen.getByTitle('문서 편집').getAttribute('sandbox')).toBe('allow-same-origin')
})

test('입력하면 dirty 표시가 나타나고 저장하면 사라진다', async () => {
  const { handle, written } = writableHandle()
  const { editDoc } = setup({ handle })
  fireEvent.input(editDoc.body)
  expect(screen.getByTitle('저장되지 않은 변경')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await vi.waitFor(() => expect(written).toHaveLength(1))
  expect(screen.queryByTitle('저장되지 않은 변경')).toBeNull()
})

test('저장물은 DOCTYPE·script를 보존하고 contenteditable을 제거한다', async () => {
  const { handle, written } = writableHandle()
  setup({ handle })
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await vi.waitFor(() => expect(written).toHaveLength(1))
  expect(written[0]!.startsWith('<!DOCTYPE html>')).toBe(true)
  expect(written[0]).toContain("console.log('chart')")
  expect(written[0]).not.toContain('contenteditable')
})

test('쓰기 실패 시 오류와 다운로드 폴백을 제안한다', async () => {
  const handle = {
    createWritable: () => Promise.reject(new Error('권한 거부')),
  } as unknown as FileSystemFileHandle
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  setup({ handle })
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('저장하지 못했습니다')
  await userEvent.click(screen.getByRole('button', { name: '다운로드로 저장' }))
  expect(URL.createObjectURL).toHaveBeenCalled()
})

test('핸들이 없고 저장 피커 미지원이면 다운로드로 저장하고 dirty를 해제한다', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  const { editDoc } = setup()
  fireEvent.input(editDoc.body)
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
  expect(screen.queryByTitle('저장되지 않은 변경')).toBeNull()
})

test('실행 취소/다시 실행 버튼은 문서의 execCommand에 위임한다', async () => {
  const { editDoc } = setup()
  const spy = vi.fn()
  ;(editDoc as unknown as { execCommand?: (c: string) => void }).execCommand = spy
  await userEvent.click(screen.getByRole('button', { name: '실행 취소' }))
  expect(spy).toHaveBeenCalledWith('undo')
  await userEvent.click(screen.getByRole('button', { name: '다시 실행' }))
  expect(spy).toHaveBeenCalledWith('redo')
})

test('dirty 상태의 열기는 확인을 요구하고 거절 시 onOpen을 부르지 않는다', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const onOpen = vi.fn()
  const { editDoc } = setup({}, onOpen)
  fireEvent.input(editDoc.body)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  expect(confirmSpy).toHaveBeenCalled()
  expect(onOpen).not.toHaveBeenCalled()
  confirmSpy.mockRestore()
})

test('dirty가 아니면 확인 없이 onOpen을 부른다', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm')
  const onOpen = vi.fn()
  setup({}, onOpen)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  expect(confirmSpy).not.toHaveBeenCalled()
  expect(onOpen).toHaveBeenCalled()
  confirmSpy.mockRestore()
})
