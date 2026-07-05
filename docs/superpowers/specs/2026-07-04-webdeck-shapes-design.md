# WebDeck Plan 9 설계 — 도형 확장·회전

2026-07-04 브레인스토밍 승인본. 마스터 설계(`2026-07-02-webdeck-design.md`)를 보완하는 확장 스펙이며, 완료 시 마스터 스펙 §12에 이력을 추가한다. 포맷 v1.1 **요소 확장**의 본대다 (버전 속성은 `"1"` 유지 — 신규는 전부 기존 요소의 값·스타일 확장).

표 편집기(el-table)는 사용자 결정으로 **Plan 9b로 분리**되었다 (이 스펙 범위 아님).

## 1. 범위

포함:

1. **도형 종류 확장** — `data-shape` 값 `ellipse`(타원)·`rounded`(둥근 사각형) 추가
2. **선·화살표** — `data-shape` 값 `line`·`arrow` 추가, "수평 세그먼트 + 회전" 설계 (끝점 편집 없음)
3. **요소 회전** — 도형·텍스트·이미지 공통 `rotation` 1급 필드, 회전 핸들 + 패널 수치 입력
4. **도형 삽입 팝오버** — 툴바에서 5종 선택 삽입
5. v1.1 요소 확장 5종 세트: 스펙 → 검증기 → 파서/직렬화(왕복) → 렌더 → 에디터 UI

비범위: 표 편집기(Plan 9b), 선 끝점 자유 편집, 선 굵기 조절 UI(고정 2px — 후속), 그룹화(유예 유지), 회전된 요소의 캔버스 드래그 리사이즈(§4 제한), 자유 다각형·별 등 추가 도형, 다중 선택 회전.

## 2. 도형 확장 (ellipse·rounded)

- `ShapeElement.shape: 'rect' | 'ellipse' | 'rounded' | 'line' | 'arrow'`
- **렌더링 원칙: 외형은 요소 인라인 스타일에 내장** — 문서 런타임·head CSS 변경 없이 뷰어·에디터·인쇄·문서 모드 어디서나 동일 렌더 (자기완결):
  - 타원: 삽입 시 extraStyle에 `border-radius: 50%`
  - 둥근 사각형: 삽입 시 extraStyle에 `border-radius: 24px`
  - `data-shape`는 의미 표시자(검증기·삽입 UI·AI 가이드용) — 파서는 border-radius를 검사하지 않는다(사용자가 지워도 semantic은 유지, 렌더만 각지게 됨 — 수용)
- 파서: 5종 값이면 ShapeElement, **그 외 값은 기존대로 opaque 보존** (v1 문서의 rect 전용 동작과 하위 호환)
- rect/ellipse/rounded는 기존 rect 규칙 유지: 자식·텍스트가 있으면 opaque

## 3. 선·화살표 (line·arrow)

끝점 편집 UI(최대 공수 항목)를 만들지 않는 설계:

- **선은 항상 프레임 가로 중앙을 지나는 수평 세그먼트** — 기울기·방향은 §4 회전으로 표현 (PPT에서 선을 돌려 쓰는 감각). 화살표는 오른쪽 끝에 삼각형 머리
- **정준(canonical) SVG**: 요소 내부에 SVG 1개 —
  - viewBox 없이 `width="100%" height="100%"` + **퍼센트 좌표**(`<line x1="0" y1="50%" x2="100%" y2="50%">`) — viewBox 왜곡이 원천적으로 없어 `preserveAspectRatio`/`vector-effect` 불필요 *(2026-07-04 플랜 작성 중 정정: 초안의 preserveAspectRatio="none"+polygon 방식은 얇은 프레임에서 화살표 머리가 심하게 왜곡됨)*
  - `stroke="currentColor"` — 선 색은 요소 extraStyle의 `color`로 제어. 삽입 기본 `color: #374151`
  - 굵기 고정 `stroke-width="2"` (조절 UI는 후속)
  - 화살표 머리는 `marker-end` + `markerUnits="userSpaceOnUse"`(고정 픽셀 크기 — 상자 비율 무관 무왜곡). marker id는 **요소별 유일**(`wd-arrow-head-<요소id>`) — *(2026-07-05 최종 리뷰 정정: 상수 id는 url(#id)가 문서 전역 첫 정의로 해석되고 marker 안 currentColor가 정의 위치의 color를 따르므로, 색이 다른 화살표들의 머리가 첫 화살표 색으로 고정되는 실결함이 실브라우저에서 확인됨)*. 파서의 id 발급이 문서 순서대로 결정적이라 왕복 정준성은 유지된다. SVG에 `overflow: visible`로 머리 잘림 방지
- **직렬화는 모델에서 SVG를 항상 재생성**(정준형 — 2회 직렬화 동일), **파서는 line/arrow의 내부 마크업을 무시**(자식이 있어도 opaque로 강등하지 않음) — 내부 드리프트 원천 차단. 왕복 계약: line/arrow의 내부는 "정준형으로 정규화됨"을 스펙에 명시 (보존 비목표)
- 속성 패널 매핑: line/arrow 선택 시 **채우기 조작이 `background` 대신 `color`(선 색)를 패치**. 테두리·그림자 UI는 line/arrow에서 숨김(상자에 적용되어 어색함). 투명도·위치크기·회전은 공통 적용
- 삽입 기본 크기: 도형 240×160, 선·화살표 320×8

## 4. 회전 (rotation)

### 4.1 모델·왕복

- `KnownElement.rotation: number` (도 단위, 기본 0, 소수 허용)
- 저장: rotation ≠ 0일 때만 인라인 스타일에 `transform: rotate(<n>deg)` 출력 — 뷰어·인쇄가 런타임 변경 없이 렌더. 회전 중심은 요소 중앙(transform-origin 기본값)
- 파싱: style의 transform 값이 **정확히 `rotate(<수>deg)` 형태**면 1급 승격(transform은 extraStyle에서 제외), 그 외(matrix·다중 함수·단위 없음)는 extraStyle에 원문 보존하고 rotation=0 (Plan 6 transition의 관대 규칙과 동일)
- 값 정규화: 저장·표시는 [0, 360) 범위로 정규화 (음수 입력·드래그는 변환)

### 4.2 에디터 UI

- **회전 핸들**: 단일 선택 시 선택 오버레이 상단 중앙 위에 핸들 표시. 드래그 = 요소 중심 기준 자유 회전, **Shift = 15° 스냅**. 제스처 중 로컬 상태 미리보기, pointerup에 1 APPLY_DOC
- **패널 수치 입력**: 속성 패널 위치·크기 섹션에 "회전" 입력(단일 선택, NumberField 드래프트 패턴 — blur/Enter 커밋, Escape 취소, [0,360) 정규화)
- 다중 선택: 회전 핸들·회전 입력 미표시 (기존 다중 선택의 위치·크기 숨김 관례)

### 4.3 상호작용 제한 (정직한 범위 축소)

- rotation ≠ 0인 요소는:
  1. 캔버스 **리사이즈 핸들 비활성**(미표시) — 크기는 패널 수치로 (축 정렬 전제의 리사이즈·스냅 수학 무변경)
  2. **스냅 대상에서 제외**(buildSnapTargets), 자신의 이동 스냅도 비활성
- 이동·복제·삭제·정렬(중심 기준)·분배·z순서·클립보드는 정상 동작
- 텍스트 편집: 회전된 텍스트 상자도 더블클릭 편집 허용 (contentEditable은 transform 하에서 동작 — 캐럿이 회전된 채 보이는 것 수용)

## 5. 삽입 UI

- 툴바의 기존 도형 삽입 버튼을 **팝오버**(레이아웃 팝오버 패턴: role=menu/menuitem, 외부 클릭 닫힘)로 교체: `사각형`/`둥근 사각형`/`타원`/`선`/`화살표`
- 삽입 = 1 APPLY_DOC + 삽입 요소 선택 (기존 삽입 관례)

## 6. 검증기·문서

- 검증기(tools/lib/validate.mjs): `data-shape` 5종 허용(그 외 오류 — 문구 갱신). line/arrow는 자식으로 svg 1개까지 허용(그 외 자식은 오류), rect/ellipse/rounded는 기존 자식 금지 유지. transform 회전은 검증하지 않음(스타일 자유)
- ai-guide.md: 도형 5종 레시피·회전 사용법 추가 + **data-bg 확장 값(그라데이션·이미지 규약) 문서화** (Plan 7 백로그 1건 함께 해소)
- 템플릿·런타임 변경 없음. 완료 시 마스터 스펙 §12 이력 추가

## 7. 오류 처리·알려진 한계

- 회전된 요소: 드래그 리사이즈·스냅 제외(패널 수치로 조정) — 문서화
- 선 기울기는 회전으로만, 굵기 고정 2px
- line/arrow 내부 마크업은 저장 시 정준형으로 정규화(원문 보존 비목표 — 스펙 명시)
- 회전 요소의 변 기준 정렬(왼쪽/오른쪽/위/아래)은 시각적 경계가 아닌 frame 기준 — 중심 정렬만 회전과 무관하게 정확 (한계)
- v1 검증기·구버전 에디터는 신규 도형을 오류/opaque로 취급 — 문서 자체 렌더는 인라인 스타일이라 정상
- 비표준 transform이 있는 요소에 에디터에서 회전을 적용하면: 1급 rotation이 transform을 새로 출력하면서 **extraStyle의 기존 transform과 중복 충돌** → 이를 막기 위해 `setElementRotation`은 extraStyle의 `transform` 키를 항상 제거(Plan 6 transition 잔재 제거와 동일 패턴)

## 8. 테스트 전략

- 파서/직렬화: 5종 도형 왕복, 비표준 data-shape opaque 회귀, rotate 정확 형태 승격·비표준 transform 보존, rotation 직렬화([0,360) 정규화·0일 때 미출력), line/arrow SVG 정준성(2회 직렬화 동일, 내부 임의 마크업 입력 시 정규화)
- ops: setElementRotation(extraStyle transform 잔재 제거 포함), 도형 팩토리 5종 기본값
- 기하: 각도 계산·15° 스냅·[0,360) 정규화 순수 함수
- 검증기(tools): 5종 허용, 6번째 값 거부, line/arrow svg 자식 허용·기타 자식 거부
- RTL: 팝오버 삽입 5종, 회전 핸들 드래그·Shift 스냅·pointerup 1 APPLY_DOC, 패널 회전 입력 드래프트, 회전 요소의 리사이즈 핸들 미노출·스냅 제외, line 선택 시 채우기→color 매핑
- 최종 리뷰: 실브라우저(저장 문서·발표 모드)에서 5종 도형·회전 렌더 검증 관례
