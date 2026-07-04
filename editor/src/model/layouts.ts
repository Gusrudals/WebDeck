import { createShapeElement, createTextElement } from './ops.ts'
import type { KnownElement } from './types.ts'

export interface SlideLayout {
  key: string
  label: string
  build: (idGen: () => string) => KnownElement[]
}

const TITLE = '<p><strong><span style="font-size:36px;">제목을 입력하세요</span></strong></p>'
const BODY = (text: string) => `<p><span style="font-size:24px;">${text}</span></p>`

/** 좌표는 docs/ai-guide.md의 검증된 레시피. 색·폰트는 var(--wd-*)로 문서 테마를 따라간다 */
export const LAYOUTS: SlideLayout[] = [
  { key: 'blank', label: '빈 장', build: () => [] },
  {
    key: 'cover',
    label: '표지',
    build: (idGen) => [
      createTextElement(idGen, { left: 96, top: 240, width: 1088, height: 140 }, '<p><strong><span style="font-size:54px;">제목을 입력하세요</span></strong></p>'),
      createTextElement(idGen, { left: 96, top: 400, width: 1088, height: 60 }, '<p><span style="font-size:24px; color:var(--wd-muted);">부제목을 입력하세요</span></p>'),
    ],
  },
  {
    key: 'title-body',
    label: '제목+본문',
    build: (idGen) => [
      createTextElement(idGen, { left: 96, top: 64, width: 1088, height: 80 }, TITLE),
      createShapeElement(idGen, { left: 96, top: 150, width: 64, height: 6 }, 'var(--wd-primary)'),
      createTextElement(idGen, { left: 96, top: 200, width: 1088, height: 440 }, BODY('본문을 입력하세요')),
    ],
  },
  {
    key: 'two-col',
    label: '2단',
    build: (idGen) => [
      createTextElement(idGen, { left: 96, top: 64, width: 1088, height: 80 }, TITLE),
      createShapeElement(idGen, { left: 96, top: 150, width: 64, height: 6 }, 'var(--wd-primary)'),
      createTextElement(idGen, { left: 96, top: 200, width: 520, height: 440 }, BODY('왼쪽 내용')),
      createTextElement(idGen, { left: 664, top: 200, width: 520, height: 440 }, BODY('오른쪽 내용')),
    ],
  },
]
