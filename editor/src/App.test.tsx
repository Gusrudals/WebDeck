import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { App } from './App.tsx'

test('앱 셸이 렌더링된다', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'WebDeck 에디터' })).toBeTruthy()
  expect(screen.getByText('문서를 열어 시작하세요')).toBeTruthy()
})
