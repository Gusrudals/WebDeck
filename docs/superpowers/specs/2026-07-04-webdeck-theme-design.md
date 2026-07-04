# WebDeck Plan 7 설계 — 테마·레이아웃·템플릿

2026-07-04 브레인스토밍 승인본. 마스터 설계(`2026-07-02-webdeck-design.md`)를 보완하는 확장 스펙이며, 완료 시 마스터 스펙 §12에 이력을 추가한다.

## 1. 범위

포함 (승인된 4개 축):

1. **테마 편집** — 문서의 `--wd-*` CSS 변수(색 4종·폰트 2종)를 UI로 일괄 변경 + 색 프리셋 4종
2. **슬라이드 레이아웃** — 새 슬라이드 추가 시 레이아웃 4종(빈 장/표지/제목+본문/2단) 선택
3. **커스텀 템플릿** — 현재 문서를 템플릿으로 등록(localStorage) + 파일에서 가져오기 + 시작 화면 카드(삭제 가능) + **모든 템플릿 카드에 첫 슬라이드 썸네일**
4. **배경 확장** — 슬라이드 배경을 단색 외에 그라데이션·이미지(data URI)로 지정

**포맷 확장 없음**: 전부 기존 필드 범위 — headExtra의 `:root` 변수 수술, `data-bg` 값(이미 임의 CSS background 통과), 요소 삽입. 검증기·파서 변경 없음.

비범위:

- 슬라이드 크기 변경(4:3/A4) — 로드맵 유예 항목 유지
- 테마 변수가 없는 문서에 `:root` 블록 주입 — 그런 문서는 `var()` 참조도 없어 효과가 없으므로 "테마 변수 없음" 표시만
- 레이아웃 미니 시각 미리보기 — 라벨 텍스트로 충분
- 템플릿 폴더 동기화(파일 시스템 감시) — 공유는 파일 전달 + 가져오기로

## 2. 테마 편집

### 2.1 모델 (`editor/src/model/theme.ts` 신규, 순수 함수)

- 대상 변수 6종: `--wd-primary`, `--wd-accent`, `--wd-text`, `--wd-muted`(색), `--wd-font-heading`, `--wd-font-body`(폰트 스택)
- `readTheme(doc): Record<변수명, 값> | null` — headExtra의 **첫 `:root` 블록**에서 6종의 현재 값을 읽는다. `:root` 블록이 없으면 null
- `setThemeVars(doc, patch: Record<변수명, 값>): DeckDoc` — headExtra **문자열 외과 수술**: 첫 `:root` 블록 안에서 해당 변수 선언의 값 부분만 교체. 주변 CSS·공백·주석은 바이트 무손상 (headExtra는 왕복 원문 보존 필드이므로 수술 범위 최소화가 계약). 블록에 없는 변수는 patch에서 무시(주입하지 않음)
- 값 검증은 하지 않는다(자유 문자열) — UI가 hex/스택만 생성

### 2.2 UI (속성 패널 선택 없음 모드, 슬라이드 섹션 위 "문서 테마" 섹션)

- 색 4종: ColorPopover 재사용(스와치 12 + hex). 표시값이 `#rrggbb`가 아니면 "사용자 지정"으로 표시, 덮어쓰기 전까지 보존
- 폰트 2종(제목/본문): Plan 5 `FONT_FAMILIES` 스택 select 재사용. 현재 값이 목록에 없으면 "사용자 지정" 옵션으로 표시·보존
- **프리셋 4종**: 파랑 기본(`#1a56db`/`#e8f0fe`/`#1f2937`/`#6b7280`), 그린(`#047857`/`#ecfdf5`/`#1f2937`/`#6b7280`), 버건디(`#9f1239`/`#fff1f2`/`#1f2937`/`#6b7280`), 다크 네이비(`#1e3a5f`/`#e8eef5`/`#111827`/`#4b5563`). 클릭 1번 = 색 4종 일괄 = 1 APPLY_DOC
- 개별 변경도 1 조작 = 1 APPLY_DOC (ColorPopover 스와치/hex 커밋, select change). 같은 값 no-dispatch
- `readTheme`가 null이면 섹션에 "이 문서에는 테마 변수가 없습니다" 안내만 표시

## 3. 슬라이드 레이아웃

### 3.1 모델 (`editor/src/model/layouts.ts` 신규)

- `LAYOUTS: { key, label, build(idGen): KnownElement[] }[]` 4종:
  - `blank` "빈 장" — 요소 없음
  - `cover` "표지" — 제목(96,240,1088,140 / 54px bold) + 부제(96,400,1088,60 / 24px, `var(--wd-muted)`)
  - `title-body` "제목+본문" — 제목(96,64,1088,80 / 36px bold) + 포인트 바(96,150,64,6 shape `var(--wd-primary)`) + 본문(96,200,1088,440 / 24px)
  - `two-col` "2단" — 제목+포인트 바 + 좌(96,200,520,440) + 우(664,200,520,440)
- 색·폰트는 전부 `var(--wd-*)` 참조 → 문서 테마를 자동 따라감. 좌표는 ai-guide 검증 레시피
- `addSlide(doc, idGen, index?, elements?)` — 선택적 elements 파라미터 추가 (기존 호출 하위 호환)

### 3.2 UI

- 슬라이드 패널 "추가" 버튼 클릭 → 레이아웃 4종 팝오버(라벨 목록, 외부 클릭 닫힘) → 선택 시 현재 다음 위치에 추가 + 그 슬라이드로 이동. 1 선택 = 1 APPLY_DOC

## 4. 커스텀 템플릿 + 썸네일

### 4.1 저장 (`editor/src/file/customTemplates.ts` 신규)

- localStorage 키 `webdeck.templates`, 값은 `{ id, label, html, savedAt }[]` JSON
- `listCustomTemplates()`, `saveCustomTemplate(label, html)`(id 발급), `removeCustomTemplate(id)`
- 용량 초과(QuotaExceededError) → 한국어 오류로 변환해 throw, UI가 알림 표시
- localStorage 파손(JSON 파싱 실패) → 빈 목록 취급 (기존 데이터 덮어쓰지 않고 다음 저장 시 재생성)

### 4.2 등록·가져오기

- **등록**: 상단바 "템플릿으로 등록" 버튼(doc 있을 때) → `window.prompt`로 이름(기본값: 문서 제목 또는 파일명) → 취소 시 무동작 → `checkRoundTrip` 통과 확인 후 `serializeWebdeck(doc)` 저장. 실패 시 기존 저장 오류 표시 관례
- **가져오기**: 시작 화면 "파일에서 템플릿 가져오기" 버튼 → `openHtmlFile` 재사용 → `parseWebdeck` 성공 시 파일명(확장자 제외)으로 등록, `WebdeckParseError`면 "WebDeck 문서만 템플릿으로 등록할 수 있습니다" 알림
- 등록/삭제는 문서 상태와 무관한 localStorage 부수효과 — undo 대상 아님

### 4.3 시작 화면

- 내장 템플릿 3종 + 커스텀 템플릿 카드 나열. 커스텀 카드에는 삭제(×) 버튼 — 클릭 시 confirm 후 제거
- **모든 카드에 첫 슬라이드 썸네일**: 템플릿 html을 파싱해 첫 슬라이드를 SlideView 축소 렌더(SlidePanel 썸네일 관례 재사용, useMemo 캐시). 파싱 실패 카드는 썸네일 자리에 "미리보기 불가" 표시(카드 자체는 유지, 시작 시도 시 오류 알림)
- 시작 동작: 내장·커스텀 동일하게 해당 html을 `parseWebdeck`+`normalizeRuntime` 후 START_DOC (기존 handleStart 흐름 확장)

## 5. 배경 확장 (그라데이션·이미지)

### 5.1 값 규약 (`editor/src/model/bg.ts` 신규, 순수 함수)

- data-bg 값 패턴 인식 `parseBg(value)`:
  - `#rrggbb` → 단색
  - `linear-gradient(<0|90|180|270>deg, #rrggbb, #rrggbb)` (정확히 이 형태) → 그라데이션
  - `url(data:image/...) center / cover no-repeat` (url이 data URI로 시작) → 이미지
  - 그 외 → `custom` (사용자 지정 — 원문 보존, 덮어쓰기 전까지 유지)
- 생성 `buildGradient(angle, from, to)`, `buildImageBg(dataUri)` — 위 규약 문자열 생성

### 5.2 UI (속성 패널 슬라이드 섹션)

- 배경 유형 select: 단색 / 그라데이션 / 이미지 (+ 현재 값이 custom이면 "사용자 지정" 항목 표시)
- 단색: 기존 color input 유지 (bgDraft 패턴)
- 그라데이션: 색 2개(color input ×2, 드래프트) + 방향 select(아래로 180°/오른쪽으로 90°/위로 0°/왼쪽으로 270°) — 커밋 시 1 APPLY_DOC
- 이미지: 파일 선택 → FileReader로 data URI → 2MB 초과 시 confirm("파일이 큽니다(N MB). 문서 파일이 그만큼 커집니다. 계속할까요?") → `setSlideBg` 1회
- 유형 전환 자체는 디스패치하지 않고(로컬 상태), 실제 값 커밋 시에만 APPLY_DOC

## 6. 오류 처리

- 테마: `:root` 없음 → 안내 표시, 편집 UI 미노출. 수술 실패 케이스 없음(없는 변수는 무시)
- 템플릿: 용량 초과·파싱 실패·왕복 실패 전부 한국어 알림, 파괴 동작 없음
- 배경 이미지: 이미지가 아닌 파일 선택 → 무시 + 알림. FileReader 실패 → 알림
- 썸네일: 파싱 실패 시 카드 유지 + "미리보기 불가"

## 7. 테스트 전략

- **theme.ts**: 값 교체 정확성, **주변 CSS·공백 바이트 무손상**(수술 전후 headExtra diff가 값 부분만), `:root` 없음 null, 없는 변수 무시, 왕복(checkRoundTrip) 통과
- **layouts.ts**: 4종 build → addSlide(elements) 통합 → checkRoundTrip, 모든 요소가 1280×720 안, var(--wd-*) 참조 포함
- **customTemplates.ts**: 저장/목록/삭제, id 유일성, 파손 JSON 복구, QuotaExceededError 한국어 변환 (happy-dom localStorage)
- **bg.ts**: parseBg 4분류(경계: 비표준 그라데이션 → custom), build↔parse 왕복
- **RTL**: 테마 색·프리셋 1 APPLY_DOC(같은 값 no-dispatch), 레이아웃 팝오버 추가·이동, 시작 화면 커스텀 카드·삭제·가져오기, 배경 유형 전환 무디스패치·그라데이션 커밋 1회, 썸네일 렌더
- **App 통합**: 등록 → 시작 화면 노출 → 그 템플릿으로 새 문서
