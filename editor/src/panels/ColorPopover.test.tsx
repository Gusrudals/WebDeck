import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ColorPopover, PALETTE } from './ColorPopover.tsx'

test('트리거 클릭으로 열리고 스와치 12종이 렌더링된다', () => {
  const { getByRole, getAllByRole } = render(<ColorPopover label="채우기 색" onPick={vi.fn()} />)
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  expect(getAllByRole('button', { name: /^색 #/ })).toHaveLength(12)
})

test('스와치 클릭은 onPick 호출 후 팝오버를 닫는다', () => {
  const onPick = vi.fn()
  const { getByRole, queryByRole } = render(<ColorPopover label="채우기 색" onPick={onPick} />)
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  fireEvent.click(getByRole('button', { name: `색 ${PALETTE[0]}` }))
  expect(onPick).toHaveBeenCalledWith(PALETTE[0])
  expect(queryByRole('dialog')).toBeNull()
})

test('유효한 hex 입력 + Enter는 onPick을 호출한다', () => {
  const onPick = vi.fn()
  const { getByRole, getByLabelText } = render(<ColorPopover label="글자색" onPick={onPick} />)
  fireEvent.click(getByRole('button', { name: '글자색' }))
  const input = getByLabelText('글자색 hex')
  fireEvent.change(input, { target: { value: '#ff8800' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onPick).toHaveBeenCalledWith('#ff8800')
})

test('3자리 hex는 6자리로 확장된다', () => {
  const onPick = vi.fn()
  const { getByRole, getByLabelText } = render(<ColorPopover label="글자색" onPick={onPick} />)
  fireEvent.click(getByRole('button', { name: '글자색' }))
  fireEvent.change(getByLabelText('글자색 hex'), { target: { value: '#f80' } })
  fireEvent.click(getByRole('button', { name: '적용' }))
  expect(onPick).toHaveBeenCalledWith('#ff8800')
})

test('잘못된 hex는 무시한다', () => {
  const onPick = vi.fn()
  const { getByRole, getByLabelText } = render(<ColorPopover label="글자색" onPick={onPick} />)
  fireEvent.click(getByRole('button', { name: '글자색' }))
  fireEvent.change(getByLabelText('글자색 hex'), { target: { value: 'red' } })
  fireEvent.click(getByRole('button', { name: '적용' }))
  expect(onPick).not.toHaveBeenCalled()
})

test('clearLabel 지정 시 초기화 버튼이 onClear를 호출한다', () => {
  const onClear = vi.fn()
  const { getByRole } = render(
    <ColorPopover label="채우기 색" onPick={vi.fn()} clearLabel="채우기 없음" onClear={onClear} />,
  )
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  fireEvent.click(getByRole('button', { name: '채우기 없음' }))
  expect(onClear).toHaveBeenCalled()
})

test('showHex=false면 hex 입력이 없다', () => {
  const { getByRole, queryByLabelText } = render(<ColorPopover label="테두리 색" onPick={vi.fn()} showHex={false} />)
  fireEvent.click(getByRole('button', { name: '테두리 색' }))
  expect(queryByLabelText('테두리 색 hex')).toBeNull()
})

test('textTool 모드에서 트리거로 닫을 때는 onActivate를 호출하지 않는다', () => {
  const onActivate = vi.fn()
  const { getByRole } = render(<ColorPopover label="글자색" onPick={vi.fn()} textTool onActivate={onActivate} />)
  const trigger = getByRole('button', { name: '글자색' })
  fireEvent.pointerDown(trigger)
  fireEvent.click(trigger) // 열기
  expect(onActivate).toHaveBeenCalledTimes(1)
  fireEvent.pointerDown(trigger)
  fireEvent.click(trigger) // 닫기
  expect(onActivate).toHaveBeenCalledTimes(1)
})

test('textTool 모드에서 hex 입력에 data-text-tool이 붙는다', () => {
  const { getByRole, getByLabelText } = render(<ColorPopover label="글자색" onPick={vi.fn()} textTool />)
  const trigger = getByRole('button', { name: '글자색' })
  fireEvent.pointerDown(trigger)
  fireEvent.click(trigger)
  expect(getByLabelText('글자색 hex').getAttribute('data-text-tool')).toBe('1')
})

test('fixedToAnchor면 팝오버가 fixed로 렌더된다 (스크롤 컨테이너 클리핑 탈출)', () => {
  const { getByRole } = render(<ColorPopover label="글자색" onPick={vi.fn()} fixedToAnchor />)
  fireEvent.click(getByRole('button', { name: '글자색' }))
  expect((getByRole('dialog') as HTMLElement).style.position).toBe('fixed')
})

test('fixedToAnchor 없으면 기존대로 인라인 position이 없다', () => {
  const { getByRole } = render(<ColorPopover label="글자색" onPick={vi.fn()} />)
  fireEvent.click(getByRole('button', { name: '글자색' }))
  expect((getByRole('dialog') as HTMLElement).style.position).toBe('')
})

test('stopPropagation하는 외부 요소를 눌러도 색 팝오버가 닫힌다 (캡처 단계 닫힘)', () => {
  const { getByRole, queryByRole } = render(<ColorPopover label="채우기 색" onPick={vi.fn()} />)
  fireEvent.click(getByRole('button', { name: '채우기 색' }))
  const outside = document.createElement('div')
  outside.addEventListener('pointerdown', (e) => e.stopPropagation())
  document.body.appendChild(outside)
  fireEvent.pointerDown(outside)
  document.body.removeChild(outside)
  expect(queryByRole('dialog')).toBeNull()
})
