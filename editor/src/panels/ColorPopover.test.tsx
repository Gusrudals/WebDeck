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
