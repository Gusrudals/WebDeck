# WebDeck 문서 모드(일반 HTML 편집) 설계

2026-07-03 브레인스토밍 승인본. 로드맵(Plan 6~10)과 별개로 추가된 기능 플랜이며, 완료 시 마스터 스펙 §12에 이력을 추가한다.

## 1. 배경과 목표

WebDeck은 표준 포맷(`data-webdeck-version="1"` + `main.deck`)이 아닌 HTML을 열면 거부한다. 그러나 사내에서는 AI가 생성한 "페이지로 나뉘지 않은" 일반 HTML 문서(보고서·요약문 등)도 흔하고, 이 문서들의 오타·문구를 고치려고 개발자를 찾는 일이 생긴다.

**문서 모드**: 일반 HTML을 열면 문서 모습 그대로 렌더링하고, Word처럼 문서 전체를 자유 편집(전체 contentEditable)한 뒤, **일반 HTML 그대로** 저장한다. 슬라이드로 변환하지 않는다.

승인된 방향 (브레인스토밍 결정):

1. 편집 목표 — 원본 유지 가벼운 편집 (슬라이드 변환 아님)
2. 편집 범위 — 텍스트 내용 위주 (전용 서식 UI 없음)
3. 스크립트 — 편집 중 실행 차단, 저장 시 원문 보존
4. 구현 접근 — **A안: 문서 전체 contentEditable** (블록 단위 편집이 아닌 Word식 자유 편집)

## 2. 범위

포함:

- 일반 HTML 열기 → 문서 모드 자동 진입 (기존 "WebDeck 문서가 아닙니다" 오류 알림 대체)
- iframe 격리 렌더링 + 문서 전체 contentEditable 편집
- 브라우저 네이티브 undo/redo (상단 버튼은 iframe에 위임)
- 저장/다른 이름으로 저장 (FSA + 다운로드 폴백 재사용), dirty 가드(beforeunload + 열기 확인)

비범위 (1차):

- 전용 서식 툴바·속성 패널 (문서 모드에서는 숨김. Cmd+B/I 등 contentEditable 기본 단축키는 브라우저 동작 그대로 수용)
- 일반 HTML → 슬라이드 변환 (별도 플랜 후보)
- 이미지 삽입·교체, 요소 삽입 UI
- WebDeck History 스택 통합 (문서 모드는 네이티브 undo 사용)

## 3. 진입 UX와 모드 전환

- 열기 버튼(Cmd+O)은 기존 하나 그대로. `parseWebdeck` 성공 → 기존 슬라이드 에디터, `WebdeckParseError` → 문서 모드 진입
- `data-webdeck-version="1"`은 있지만 구조가 깨져 파싱에 실패하는 문서도 문서 모드로 열린다 — 오류 알림으로 막는 것보다 원문 보존 편집이 낫다 (기존 OPEN_ERROR 알림 경로는 파일 읽기 실패 등 예외 상황용으로만 남음)
- 문서 모드 화면: 자체 상단바(파일명 + dirty 표시 + **"문서 모드 — 일반 HTML" 배지** + 열기/저장/다른 이름으로/undo/redo 버튼) + iframe 편집 영역. 슬라이드 패널·속성 패널·서식 툴바는 렌더링하지 않음
- 모드 전환 dirty 가드:
  - 슬라이드 에디터에서 일반 HTML을 열 때 — 기존 열기 dirty 확인 흐름 그대로 통과 후 전환
  - 문서 모드에서 다른 파일을 열 때 — 문서 모드 자체 dirty 확인(confirm) 후 App의 공용 열기 흐름 호출. WebDeck 문서면 슬라이드 에디터로 전환
- 새 문서(시작 화면 템플릿)는 문서 모드와 무관 — 기존 흐름 유지

## 4. 렌더링·편집 구조

- 문서를 **iframe `srcdoc`으로 렌더링**, `sandbox="allow-same-origin"` (allow-scripts 없음)
  - 스크립트 실행 차단. `<script>`·`<noscript>` 태그는 DOM에 남아 저장 시 자연 보존
  - 문서의 CSS(`body { ... }` 등 전역 셀렉터)가 에디터 UI로 새지 않는 완전 격리
  - same-origin이므로 부모에서 `contentDocument` 접근 가능
- iframe `load` 후 `contentDocument.body.contentEditable = 'true'` 설정 (designMode는 사용하지 않음 — head까지 편집 대상이 되는 것을 피함)
- `contentDocument`의 `input` 이벤트로 dirty 플래그 설정

## 5. undo/redo

- 전체 contentEditable에서는 브라우저 네이티브 undo가 가장 정확하므로 그대로 사용. iframe에 포커스가 있을 때 Cmd+Z/Shift+Cmd+Z는 자동 동작
- 상단바 undo/redo 버튼은 `contentDocument.execCommand('undo' | 'redo')` 위임
- WebDeck의 `History`는 문서 모드에서 사용하지 않는다

## 6. 저장

- 직렬화: `documentElement` 깊은 복제 → 편집 부산물 속성 제거(body의 `contenteditable`, `spellcheck`) → 원본에서 추출해 둔 DOCTYPE 문자열(있으면 원문 그대로, 없으면 생략) + `outerHTML`
- 저장 경로: 기존 `saveToHandle`(FSA) → 실패/미지원 시 `downloadHtml` 폴백, 다른 이름으로 저장은 기존 Save As 흐름 재사용
- dirty: `input` 이벤트 → true, 저장 성공 → false (단순 플래그 — undo로 저장 시점 내용에 되돌아가도 dirty가 유지될 수 있음은 수용)
- 검증 없음: 일반 HTML에는 포맷 계약이 없으므로 checkRoundTrip 미적용. 원칙은 "저장 = 현재 편집 화면의 DOM"

## 7. 상태 구조

- 기존 `EditorState`/리듀서는 변경하지 않는다
- App 수준 분기: `docFile: { name, handle, html } | null` — 값이 있으면 `DocumentMode` 렌더링, 없으면 기존 에디터
- 신규 파일:
  - `editor/src/docmode/DocumentMode.tsx` — 문서 모드 화면 전체(상단바 + iframe + dirty/저장/undo 상태 자체 관리)
  - `editor/src/docmode/serialize.ts` — 순수 함수: DOCTYPE 추출, 직렬화+클리닝
- App의 공용 열기 핸들러가 파싱 결과에 따라 `docFile`을 설정/해제

## 8. 오류 처리·알려진 한계

- HTML로도 못 읽는 파일: DOMParser는 어떤 텍스트든 HTML로 강제 해석하므로 열기 자체는 항상 성공 — 빈 body라도 문서 모드로 열린다 (별도 오류 분기 없음)
- JS가 그리는 콘텐츠(차트 등)는 편집 화면에서 빈 영역으로 보임 — 저장 후 브라우저로 열면 정상 (한계로 문서화)
- 상대 경로 이미지·CSS는 srcdoc 기준이라 편집 화면에서 깨질 수 있음 — 저장본은 무손상
- 저장 시 DOM 직렬화 정규화(속성 따옴표·공백·태그 소문자화 등)로 원본과 바이트 동일하지 않을 수 있음 — 렌더링 결과는 동일
- 원본 body에 이미 `contenteditable` 속성이 있던 극단 케이스는 저장 시 제거됨 (수용)

## 9. 테스트 전략

- `serialize.ts` 순수 함수 — DOMParser 문서 기반 단위 테스트: DOCTYPE 보존(있음/없음/비표준), 클리닝(contenteditable·spellcheck 제거), script/noscript/head 원문 보존
- `DocumentMode` — happy-dom의 iframe srcdoc 지원이 불확실하므로, iframe에서 편집 문서를 얻는 접근자를 주입 가능하게 두고(기본값은 `contentDocument`) 테스트에서는 DOMParser 문서를 주입해 dirty·저장·undo 위임을 RTL로 검증
- App 분기 — 일반 HTML 열기 → 문서 모드 배지 표시, WebDeck 문서 열기 → 기존 에디터(회귀), 문서 모드에서 WebDeck 문서 열기 → 슬라이드 에디터 전환
