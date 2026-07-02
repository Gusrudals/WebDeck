import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { parseWebdeck } from '../model/parse.ts'
import { CanvasArea } from './CanvasArea.tsx'
import { SlideView } from './SlideView.tsx'

const TEMPLATES = import.meta.dirname
  ? join(import.meta.dirname, '../../../templates/')
  : fileURLToPath(new URL('../../../templates/', import.meta.url))

const report = parseWebdeck(readFileSync(join(TEMPLATES, 'business-report.html'), 'utf8'))

describe('SlideView', () => {
  test('텍스트·이미지·도형 요소를 렌더링한다 (실제 템플릿 표지)', () => {
    render(<SlideView slide={report.slides[0]!} width={1280} height={720} themeVars={{}} />)
    expect(screen.getByText('2026년 상반기 업무 보고')).toBeTruthy()
  })

  test('이미지는 alt와 src로 렌더링된다 (본문 2단 슬라이드)', () => {
    render(<SlideView slide={report.slides[2]!} width={1280} height={720} themeVars={{}} />)
    const img = screen.getByAltText('성과 차트 자리') as HTMLImageElement
    expect(img.src.startsWith('data:image/svg+xml')).toBe(true)
  })

  test('opaque 요소는 원문 그대로 렌더링된다', () => {
    const slide = {
      id: 's',
      bg: null,
      extraAttrs: {},
      extraClasses: [],
      elements: [{ type: 'opaque' as const, id: 'o', html: '<div data-x="1">보존된 위젯</div>' }],
    }
    render(<SlideView slide={slide} width={1280} height={720} themeVars={{}} />)
    expect(screen.getByText('보존된 위젯')).toBeTruthy()
  })
})

test('CanvasArea는 현재 슬라이드를 렌더링한다', () => {
  render(<CanvasArea doc={report} slideIndex={1} />)
  expect(screen.getByText('목차')).toBeTruthy()
})
