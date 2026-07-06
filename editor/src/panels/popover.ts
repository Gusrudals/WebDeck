import type { CSSProperties } from 'react'

/**
 * 앵커(트리거 버튼의 래퍼) 기준 fixed 팝오버 좌표.
 *
 * .toolbar는 overflow-x:auto 스크롤 컨테이너라서, CSS 명세상 overflow-y도
 * auto로 강제된다 — absolute 팝오버는 z-index와 무관하게 툴바 높이(44px)에서
 * 클리핑된다. position:fixed는 조상 overflow 클리핑을 받지 않으므로(조상에
 * transform 없음 전제) 뷰포트 기준 좌표로 탈출한다. 창 리사이즈 중에는 좌표가
 * 갱신되지 않지만 팝오버는 외부 클릭으로 닫히는 단명 UI라 수용한다.
 */
export function anchoredPopoverStyle(anchor: HTMLElement | null): CSSProperties | undefined {
  const r = anchor?.getBoundingClientRect()
  return r ? { position: 'fixed', top: r.bottom + 4, left: r.left } : undefined
}
