import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from './App.tsx'

const VALID_DOC = `<!DOCTYPE html>
<html lang="ko" data-webdeck-version="1">
<head><meta charset="utf-8"><title>테스트 문서</title><style>.el{position:absolute}</style></head>
<body>
<main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:400px; height:80px;"><p>첫 슬라이드 제목</p></div></section>
<section class="slide"><div class="fancy">위젯</div></section>
</main>
</body>
</html>`

function stubFilePicker(name: string, text: string) {
  const handle = {
    getFile: () => Promise.resolve({ name, text: () => Promise.resolve(text) }),
  }
  ;(window as unknown as { showOpenFilePicker?: () => Promise<unknown[]> }).showOpenFilePicker = () =>
    Promise.resolve([handle])
}

afterEach(() => {
  delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker
})

test('앱 셸이 렌더링된다', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'WebDeck 에디터' })).toBeTruthy()
  expect(screen.getByText('문서를 열어 시작하세요')).toBeTruthy()
})

test('문서를 열면 캔버스·패널·opaque 배지가 나타난다', async () => {
  stubFilePicker('report.html', VALID_DOC)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  // 캔버스와 썸네일 양쪽에 나타나므로 findAllByText 사용 (findByText는 다중 매치로 throw)
  expect((await screen.findAllByText('첫 슬라이드 제목')).length).toBeGreaterThanOrEqual(1)
  expect(screen.getByText('report.html')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^슬라이드 \d/ })).toHaveLength(2)
  expect(screen.getByText('편집 불가 요소 1개 보존됨')).toBeTruthy()
})

test('썸네일 클릭으로 슬라이드를 전환한다', async () => {
  stubFilePicker('report.html', VALID_DOC)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '슬라이드 2' }))
  expect(screen.getAllByText('위젯').length).toBeGreaterThanOrEqual(1)
})

test('WebDeck 문서가 아니면 오류를 표시한다', async () => {
  stubFilePicker('bad.html', '<html><body><p>일반 문서</p></body></html>')
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('WebDeck 문서가 아닙니다')
})

function stubPickerWithWritable(name: string, text: string) {
  const written: string[] = []
  const handle = {
    getFile: () => Promise.resolve({ name, text: () => Promise.resolve(text) }),
    createWritable: () =>
      Promise.resolve({
        write: (d: string) => {
          written.push(d)
          return Promise.resolve()
        },
        close: () => Promise.resolve(),
      }),
  }
  ;(window as unknown as { showOpenFilePicker?: () => Promise<unknown[]> }).showOpenFilePicker = () =>
    Promise.resolve([handle])
  return written
}

test('저장은 검증 통과 후 FSA 핸들에 쓴다', async () => {
  const written = stubPickerWithWritable('report.html', VALID_DOC)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await vi.waitFor(() => expect(written).toHaveLength(1))
  expect(written[0]).toContain('data-webdeck-version="1"')
  expect(written[0]).toContain('첫 슬라이드 제목')
})

test('쓰기 실패 시 오류와 다운로드 폴백을 제안한다', async () => {
  const handle = {
    getFile: () => Promise.resolve({ name: 'r.html', text: () => Promise.resolve(VALID_DOC) }),
    createWritable: () => Promise.reject(new Error('권한 거부')),
  }
  ;(window as unknown as { showOpenFilePicker?: () => Promise<unknown[]> }).showOpenFilePicker = () =>
    Promise.resolve([handle])
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('저장하지 못했습니다')
  await userEvent.click(screen.getByRole('button', { name: '다운로드로 저장' }))
  expect(URL.createObjectURL).toHaveBeenCalled()
})
