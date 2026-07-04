import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from './App.tsx'

// happy-dom에는 window.confirm이 없어 vi.spyOn 대상이 될 프로퍼티가 없다 — 채워둔다
if (!window.confirm) window.confirm = () => true

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
  expect(screen.getByText('시작하기')).toBeTruthy()
  expect(screen.getByRole('button', { name: /빈 문서/ })).toBeTruthy()
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

test('일반 HTML을 열면 문서 모드로 진입한다', async () => {
  stubFilePicker('plain.html', '<html><body><p>일반 문서</p></body></html>')
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  expect(await screen.findByText('문서 모드 — 일반 HTML')).toBeTruthy()
  expect(screen.getByText('plain.html')).toBeTruthy()
  expect(screen.getByTitle('문서 편집')).toBeTruthy()
  // 슬라이드 에디터 UI는 렌더링되지 않는다
  expect(screen.queryByText('시작하기')).toBeNull()
})

test('문서 모드에서 WebDeck 문서를 열면 슬라이드 에디터로 돌아온다', async () => {
  stubFilePicker('plain.html', '<html><body><p>일반 문서</p></body></html>')
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findByText('문서 모드 — 일반 HTML')
  stubFilePicker('report.html', VALID_DOC)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  expect((await screen.findAllByText('첫 슬라이드 제목')).length).toBeGreaterThanOrEqual(1)
  expect(screen.queryByText('문서 모드 — 일반 HTML')).toBeNull()
})

test('문서 모드에서는 슬라이드 단축키(Cmd+S)가 이전 덱을 저장하지 않는다', async () => {
  const written = stubPickerWithWritable('report.html', VALID_DOC)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  stubFilePicker('plain.html', '<html><body><p>일반 문서</p></body></html>')
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findByText('문서 모드 — 일반 HTML')
  await userEvent.keyboard('{Meta>}s{/Meta}')
  expect(written).toHaveLength(0)
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

test('구버전 런타임 문서는 저장 시 최신 런타임으로 기록된다', async () => {
  const OLD_RUNTIME_DOC = VALID_DOC.replace(
    '</body>',
    `<script>
  (function () {
    var deck = document.querySelector('.deck');
    var slideWidth = Number(deck.dataset.slideWidth) || 1280;
    window.addEventListener('beforeprint', function () { deck.style.zoom = 1; });
  })();
</script>
</body>`,
  )
  const written = stubPickerWithWritable('old.html', OLD_RUNTIME_DOC)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await vi.waitFor(() => expect(written).toHaveLength(1))
  expect(written[0]).toContain('data-webdeck-runtime="2"')
  // 구 런타임 본문이 교체되어 1개만 남는다
  expect(written[0]!.split('data-webdeck-runtime').length - 1).toBe(1)
})

test('핸들에 createWritable이 없으면 다운로드로 저장하고 dirty를 해제한다', async () => {
  stubFilePicker('report.html', VALID_DOC)
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '슬라이드 복제' }))
  expect(screen.getByTitle('저장되지 않은 변경')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
  expect(screen.queryByTitle('저장되지 않은 변경')).toBeNull()
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

test('다른 이름으로 저장은 피커로 핸들을 얻고 파일명을 교체한다', async () => {
  stubPickerWithWritable('report.html', VALID_DOC)
  const written: string[] = []
  const newHandle = {
    name: 'copy.html',
    createWritable: () =>
      Promise.resolve({
        write: (d: string) => {
          written.push(d)
          return Promise.resolve()
        },
        close: () => Promise.resolve(),
      }),
  }
  ;(window as unknown as { showSaveFilePicker?: () => Promise<unknown> }).showSaveFilePicker = () =>
    Promise.resolve(newHandle)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '다른 이름으로 저장' }))
  await vi.waitFor(() => expect(written).toHaveLength(1))
  expect(written[0]).toContain('data-webdeck-version="1"')
  expect(screen.getByText('copy.html')).toBeTruthy()
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
})

test('다른 이름으로 저장 피커 취소는 아무 것도 바꾸지 않는다', async () => {
  stubPickerWithWritable('report.html', VALID_DOC)
  ;(window as unknown as { showSaveFilePicker?: () => Promise<unknown> }).showSaveFilePicker = () =>
    Promise.reject(new DOMException('취소', 'AbortError'))
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '다른 이름으로 저장' }))
  expect(screen.getByText('report.html')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
})

test('새 문서 버튼은 빈 문서로 시작하고 dirty 상태다', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '새 문서' }))
  expect(await screen.findByText('제목 없음.html')).toBeTruthy()
  expect(screen.getByTitle('저장되지 않은 변경')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^슬라이드 \d/ }).length).toBeGreaterThanOrEqual(1)
})

test('시작 화면에서 템플릿을 골라 시작한다', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: /업무 보고/ }))
  expect(await screen.findByText('제목 없음.html')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^슬라이드 \d/ }).length).toBeGreaterThanOrEqual(2)
})

test('dirty 문서에서 새 문서는 확인을 요구하고 거절 시 유지한다', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '새 문서' }))
  await screen.findByText('제목 없음.html')
  // 새 문서는 항상 dirty — 다시 새 문서를 눌러 가드를 확인
  await userEvent.click(screen.getByRole('button', { name: '새 문서' }))
  expect(confirmSpy).toHaveBeenCalled()
  expect(screen.getByText('제목 없음.html')).toBeTruthy()
  confirmSpy.mockRestore()
})

test('dirty 문서에서 열기도 확인을 요구한다', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const picker = vi.fn()
  ;(window as unknown as { showOpenFilePicker?: () => Promise<unknown[]> }).showOpenFilePicker = picker
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '새 문서' }))
  await screen.findByText('제목 없음.html')
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  expect(confirmSpy).toHaveBeenCalled()
  expect(picker).not.toHaveBeenCalled()
  confirmSpy.mockRestore()
})

test('템플릿으로 등록 → 시작 화면 노출 → 그 템플릿으로 새 문서', async () => {
  localStorage.clear()
  const promptSpy = vi.fn(() => '우리 팀 표준')
  ;(window as unknown as { prompt?: typeof promptSpy }).prompt = promptSpy
  window.alert = vi.fn()
  stubFilePicker('base.html', VALID_DOC)
  const { unmount } = render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '열기' }))
  await screen.findAllByText('첫 슬라이드 제목')
  await userEvent.click(screen.getByRole('button', { name: '템플릿으로 등록' }))
  expect(promptSpy).toHaveBeenCalled()
  unmount()
  // 새로 렌더한 앱의 시작 화면에 커스텀 템플릿이 보이고, 그걸로 시작할 수 있다
  render(<App />)
  await userEvent.click(await screen.findByText('우리 팀 표준'))
  expect(await screen.findByText('제목 없음.html')).toBeTruthy()
  expect((await screen.findAllByText('첫 슬라이드 제목')).length).toBeGreaterThanOrEqual(1)
  localStorage.clear()
})
