# Plan 3b 백로그 — 편집 상호작용에서 다룰 항목

Plan 3a까지 완료된 시점의 잔여 항목.

## 편집/저장 통합 (Plan 3b 본문)

- **[저장 출시 전 필수] class 토큰 보존 갭**: 파서가 `class` 속성 전체를 건너뛰어 `<section class="slide intro">`/`<div class="el el-text fancy">`의 추가 토큰(intro/fancy)이 왕복에서 유실됨 — 검증기는 classList.contains 검사라 0/0 통과. 저장 기능이 이 위에 올라가면 사용자 데이터 파괴. 해결: 추가 클래스 토큰 보존(모델 필드 또는 opaque 폴백)
- **보존 비목표 추가 문서화**: body 수준에서 main 앞에 있던 요소는 저장 시 main 뒤로 정규화됨(내용은 보존), body 수준의 텍스트 노드와 HTML 주석은 보존하지 않음
- **저장 전 검증**: 저장 직전 `validateWebdeck(serialized)`를 최후 안전망으로 실행 (스펙 §8). `setTextHtml`에 비균형 마크업이 들어오면 문서 구조가 깨질 수 있음 — contentEditable 출력 외 입력 금지
- ops는 대상 미발견 시 throw — UI에서 try/catch 또는 사전 확인 필요
- frame의 캔버스 밖 이동을 코어가 막지 않음 (검증기 경고) — 클램핑은 UI 책임
- barrel `index.ts` 없음 — 딥 임포트 필요, UI 규모가 커지면 추가 검토
- `AIServiceAdapter` 인터페이스 정의 (스펙 §6.4 — 인터페이스만, 미구현)

## 소소한 정리 (기회가 될 때)

- 검증기 `@import` 검사가 단순 부분 문자열 매치 (CSS 주석 내 오탐 가능, v1 허용)
- CLI 내부 오류 출력에서 비-Error throw 시 `undefined` 출력 가능
