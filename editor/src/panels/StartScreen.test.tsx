import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { CustomTemplate } from '../file/customTemplates.ts'
import { StartScreen } from './StartScreen.tsx'

function renderStart(overrides: {
  onStart?: (key: string) => void
  onOpen?: () => void
  customTemplates?: CustomTemplate[]
  onImport?: () => void
  onDeleteTemplate?: (id: string) => void
} = {}) {
  const onStart = overrides.onStart ?? vi.fn()
  const onOpen = overrides.onOpen ?? vi.fn()
  const onImport = overrides.onImport ?? vi.fn()
  const onDeleteTemplate = overrides.onDeleteTemplate ?? vi.fn()
  const customTemplates = overrides.customTemplates ?? []
  const utils = render(
    <StartScreen
      onStart={onStart}
      onOpen={onOpen}
      customTemplates={customTemplates}
      onImport={onImport}
      onDeleteTemplate={onDeleteTemplate}
    />,
  )
  return { onStart, onOpen, onImport, onDeleteTemplate, ...utils }
}

test('템플릿 카드들이 렌더되고 첫 카드는 빈 문서다', () => {
  const { container } = renderStart()
  const cards = container.querySelectorAll('.start-card')
  expect(cards.length).toBeGreaterThanOrEqual(3)
  expect(cards[0]!.textContent).toContain('빈 문서')
})

test('카드 클릭은 해당 템플릿 key로 onStart를 호출한다', () => {
  const { onStart, getByRole } = renderStart()
  fireEvent.click(getByRole('button', { name: /업무 보고/ }))
  expect(onStart).toHaveBeenCalledWith('business-report')
})

test('기존 문서 열기는 onOpen을 호출한다', () => {
  const { onOpen, getByRole } = renderStart()
  fireEvent.click(getByRole('button', { name: '기존 문서 열기…' }))
  expect(onOpen).toHaveBeenCalled()
})

const CUSTOM = {
  id: 'tc1',
  label: '회사 표준',
  savedAt: '2026-07-04T00:00:00.000Z',
  html: `<!DOCTYPE html>
<html data-webdeck-version="1"><head><meta charset="utf-8"><title>c</title></head>
<body><main class="deck" data-slide-width="1280" data-slide-height="720">
<section class="slide"><div class="el el-text" style="left:0px; top:0px; width:400px; height:80px;"><p>커스텀 첫 장</p></div></section>
</main></body></html>`,
}

test('내장 템플릿 카드에 첫 슬라이드 썸네일이 렌더된다', () => {
  const { getAllByText } = renderStart()  // 파일의 기존 렌더 헬퍼(없으면 render 직접) 사용
  // minimal 템플릿 첫 장의 텍스트가 썸네일에 보인다
  expect(getAllByText('문서 제목').length).toBeGreaterThanOrEqual(1)
})

test('커스텀 템플릿 카드가 나타나고 클릭 시 id로 시작한다', () => {
  const onStart = vi.fn()
  const { getByText } = renderStart({ onStart, customTemplates: [CUSTOM] })
  fireEvent.click(getByText('회사 표준'))
  expect(onStart).toHaveBeenCalledWith('tc1')
})

test('커스텀 카드 삭제 버튼은 onDeleteTemplate을 부른다', () => {
  const onDeleteTemplate = vi.fn()
  const { getByLabelText } = renderStart({ customTemplates: [CUSTOM], onDeleteTemplate })
  fireEvent.click(getByLabelText('템플릿 회사 표준 삭제'))
  expect(onDeleteTemplate).toHaveBeenCalledWith('tc1')
})

test('파싱 불가 커스텀 템플릿은 미리보기 불가로 표시하되 카드는 유지한다', () => {
  const broken = { ...CUSTOM, id: 'tb', label: '깨진 것', html: '<html><body>x</body></html>' }
  const { getByText } = renderStart({ customTemplates: [broken] })
  expect(getByText('미리보기 불가')).toBeTruthy()
  expect(getByText('깨진 것')).toBeTruthy()
})

test('파일에서 템플릿 가져오기 버튼이 onImport를 부른다', () => {
  const onImport = vi.fn()
  const { getByRole } = renderStart({ onImport })
  fireEvent.click(getByRole('button', { name: /파일에서 템플릿 가져오기/ }))
  expect(onImport).toHaveBeenCalled()
})
