# Plan 3 백로그 — 에디터 코어 알려진 갭

Plan 2 최종 리뷰(2026-07-02)에서 식별된, Plan 3(에디터 UI)에서 다뤄야 할 항목.

## 1순위: 왕복 보존 강화 (Plan 3 첫 태스크 권고)

파서가 검증기를 0/0으로 통과하는 문서의 일부 내용을 **첫 왕복에서 조용히 유실**한다 (두 번째 왕복부터는 고정점이므로 계약 자체는 성립하지만, 스펙 §6.2 "알 수 없는 요소/속성 보존" 약속에 미달):

- 슬라이드 `<section>`의 `data-bg`/`class` 외 속성 유실 → 모델에 `Slide.extraAttrs` 추가
- `el-image`의 `<img>` 외 자식(`<figcaption>` 등), `src`/`alt`/`style` 외 img 속성(`loading` 등) 유실 → 표현 불가 내용 발견 시 opaque 폴백
- `el-shape`의 자식 유실 → 동일하게 opaque 폴백
- `<body>` 속성, body 수준 비(非)script/main 요소, deck/slide 수준 주석 유실 → 보존 또는 명시적 파싱 오류 중 설계 결정 필요

리뷰의 적대적 프로브(P1~P7)를 회귀 테스트로 추가할 것.

## UI 통합 시 반영

- **저장 전 검증**: 저장 직전 `validateWebdeck(serialized)`를 최후 안전망으로 실행 (스펙 §8). `setTextHtml`에 비균형 마크업이 들어오면 문서 구조가 깨질 수 있음 — contentEditable 출력 외 입력을 넣지 말 것
- `moveElementZ` 경계 no-op이 새 doc 객체를 반환함 — `next !== doc`으로 no-op을 감지하는 히스토리 통합이 빈 undo 항목을 쌓게 됨. `return doc` 단락 + `toBe` 테스트로 수정
- ops는 대상 미발견 시 throw — UI에서 try/catch 또는 사전 확인 필요
- frame의 캔버스 밖 이동을 코어가 막지 않음 (검증기 경고) — 클램핑은 UI 책임
- barrel `index.ts` 없음 — 딥 임포트 필요, UI 작성 시 추가 검토

## 소소한 정리

- `moveSlide` 범위 초과 오류 경로 테스트 추가 (2줄)
- README `npm test # 전체 테스트` → `npm run test:all`이 전체임을 명시
- 검증기 `@import` 검사가 단순 부분 문자열 매치 (CSS 주석 내 오탐 가능, v1 허용)
- CLI 내부 오류 출력에서 비-Error throw 시 `undefined` 출력 가능
