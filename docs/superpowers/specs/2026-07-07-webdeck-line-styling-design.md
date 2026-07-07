# WebDeck Plan 9c 설계 — 선 서식·드래그 그리기

2026-07-07 브레인스토밍 승인본. 마스터 설계(`2026-07-02-webdeck-design.md`)를 보완하는 확장 스펙이며, 완료 시 마스터 스펙 §12에 이력을 추가한다. Plan 9 스펙(`2026-07-04-webdeck-shapes-design.md`)이 "후속"으로 미룬 선 굵기 조절을 포함해 line/arrow를 실사용 수준으로 끌어올린다. 버전 속성은 `"1"` 유지 — 신규는 전부 기존 line/arrow 요소의 **선택(optional) 속성** 확장이다.

배경: 사용자 피드백 "도형 중 선이 너무 단조롭다". 현재 선은 색·회전·길이만 조절 가능하고 굵기 2px 고정, 실선만, 화살표 머리는 끝쪽 삼각형 한 종뿐이다.

꺾인 연결선·곡선은 경유점 모델이 필요한 별개 규모라 **Plan 9d로 분리**되었다 (이 스펙 범위 아님, 로드맵 등재).

## 1. 범위

포함:

1. **선 서식 4필드** — 굵기, 대시(실선/파선/점선), 시작 머리, 끝 머리 (line/arrow 한정 1급 필드)
2. **속성 패널 "선" 섹션** — 위 4필드의 편집 UI
3. **드래그 그리기 모드** — 툴바에서 선/화살표 선택 후 캔버스 드래그로 두 점 사이에 생성 (frame+rotation 환산, 포맷 무변경)
4. v1.x 확장 세트: 스펙 → 검증기 → 파서/직렬화(왕복) → 정준 SVG → 에디터 UI

비범위: 꺾인 연결선·곡선(Plan 9d), 끝점 드래그 핸들(생성 후 재조정은 패널 수치·재그리기 — 필요 확인 시 백로그), 화살표 머리 모양 추가(삼각형만 — 사용자 결정, YAGNI), 머리 크기 독립 조절(굵기 비례 자동), rect/ellipse/rounded의 테두리 대시(기존 border UI 소관).

## 2. 모델·마크업 (선 서식 필드)

`ShapeElement`에 line/arrow에서만 의미 있는 필드 4개를 추가한다:

```ts
interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: ShapeKind
  /** 선 굵기 px — line/arrow 전용, 기본 2 */
  strokeWidth: number
  /** 대시 — line/arrow 전용, 기본 solid */
  strokeDash: 'solid' | 'dashed' | 'dotted'
  /** 화살표 머리 — line 기본 false/false, arrow 기본 false/true */
  headStart: boolean
  headEnd: boolean
}
```

마크업은 `.el-shape[data-shape="line"|"arrow"]`의 **선택 data 속성**:

| 속성 | 값 | 기본 |
|---|---|---|
| `data-stroke-width` | 양의 정수(px) | `2` |
| `data-stroke-dash` | `dashed` \| `dotted` | 실선(속성 없음) |
| `data-head-start` | `0` \| `1` | 없음(kind 기본 = 0) |
| `data-head-end` | `0` \| `1` | line은 없음, arrow는 있음 |

- **직렬화는 kind 기본값과 다를 때만 속성을 출력한다** — 기존 문서·템플릿은 바이트 하나 바뀌지 않는다.
- 파서: 유효한 값만 필드로 승격, 무효 값(음수·비숫자·미지 대시명)은 **무시하고 kind 기본값 사용** — 속성 자체는 extraAttrs가 아니라 "소비된 뒤 정준 재출력" (line/arrow 내부 마크업 무시 철학과 동일: 직렬화가 항상 정준형을 재생성하므로 무효 값은 왕복에서 기본값 표기로 정규화된다). rect/ellipse/rounded에 붙은 동명 속성은 기존 규칙대로 extraAttrs 보존.
- **kind 정규화는 하지 않는다**: `data-shape="line"` + `data-head-end="1"`은 arrow와 시각적으로 같지만 kind를 바꾸지 않는다 (하위 호환·왕복 보수, AI가 어느 쪽을 생성해도 수용).

## 3. 정준 SVG 생성 (shapeSvg.ts)

`shapeInnerHtml`이 `(kind, uid, strokeWidth, strokeDash, headStart, headEnd)`를 받아 재생성한다. 기존 원칙 유지: 퍼센트 좌표, `stroke="currentColor"`, `overflow: visible`, 요소별 유일 marker id, 직렬화·에디터 렌더의 유일 원본.

- **stroke-width**: 필드 값 그대로.
- **대시**: `stroke-dasharray`를 굵기에 비례 생성 — 파선 `${w*3} ${w*2}`, 점선 `0 ${w*2}` + `stroke-linecap="round"`(둥근 점). 실선은 속성 없음.
- **화살표 머리**: marker 하나를 정의하고 `marker-start`는 `orient="auto-start-reverse"`로 반전 사용(사내 표준 브라우저 Chrome에서 지원 — fable 최종 리뷰가 실브라우저로 확인). 머리 크기는 굵기에 비례해야 자연스러우므로 `markerUnits="strokeWidth"`로 전환하고 치수를 굵기 2 기준 현재 픽셀 크기와 동일하게 재계산한다(기존 문서의 화살표 외형 무변화 — 회귀 테스트로 고정). 머리가 있는 쪽 선 끝은 머리 안으로 파고들지 않도록 refX를 기존과 동일 원칙으로 잡는다.
- 파서는 여전히 내부 SVG를 무시한다 — 서식의 단일 원본은 data 속성.

## 4. 속성 패널 "선" 섹션

선택이 전부 line/arrow일 때(기존 `allLinear` 분기 재사용) 속성 패널에 "선" 섹션을 추가한다:

- **굵기**: 숫자 입력 1~24 (폰트 크기 입력과 동일 패턴 — 자유 입력+클램프), 적용 시 1 undo 스텝
- **대시**: 실선/파선/점선 3버튼 세그먼트, 현재 값 활성 표시
- **머리**: "시작 머리"·"끝 머리" 토글 2개 (kind와 무관하게 필드 값 표시 — arrow의 기본 끝 머리는 켜짐으로 보임)
- 다중 선택 혼합 값은 기존 관례(빈 표시, 적용 시 일괄 패치). rect 등 혼합 선택이면 섹션 숨김.

## 5. 드래그 그리기 모드

- 툴바 도형 팝오버에서 선/화살표 선택 → 즉시 삽입 대신 **그리기 모드 진입**: 해당 버튼 활성 표시, 캔버스 커서 `crosshair`, App 로컬 상태 `drawMode: 'line' | 'arrow' | null` (리듀서·포맷 무변경 — 표의 TableSel 선례).
- 캔버스 pointerdown→drag→up: 두 점을 줌 배율 보정해 문서 좌표로 환산, **중심점 = 두 점 중점, width = 두 점 거리, height = 기존 삽입 기본 높이, rotation = atan2 각도**로 요소 생성. 생성 직후 해당 요소 선택, 그리기 모드 해제. 1 undo 스텝.
- **Shift**: 각도를 15° 단위로 스냅.
- **취소**: Esc, 또는 그리기 모드 중 툴바의 다른 조작. 드래그 거리 임계값(문서 좌표 8px) 미만이면 기존 동작 폴백 — 슬라이드 중앙에 기본 가로선 삽입.
- 그리기 모드 중 캔버스의 기존 제스처(요소 선택·이동·마퀴)는 차단된다(모드가 우선). 모드 진입 상태는 시각적으로 항상 식별 가능해야 한다(버튼 활성 + 커서).

## 6. 검증기·문서

- `tools/lib/validate.mjs`: line/arrow의 `data-stroke-width`(양의 정수), `data-stroke-dash`(dashed/dotted), `data-head-start`/`data-head-end`(0/1) 값 검사 — 무효 값은 오류(AI 생성 실수 조기 발견이 목적이므로 에디터의 관용 파싱과 달리 엄격). 속성이 없으면 통과(전부 선택 속성).
- `docs/ai-guide.md`: 선 서식 속성 표·예시 추가 ("굵은 빨간 파선 화살표" 수준의 생성 레시피).
- 마스터 스펙 §12에 이력 1줄.

## 7. 오류 처리·알려진 한계

- 무효 data 속성 값: 에디터는 기본값으로 관용 수용(문서를 여는 것이 우선), 검증기는 오류(생성 시점 교정) — 역할 분담을 명시한다.
- 회전된 선의 드래그 리사이즈 제외는 Plan 9 결정 그대로 — 그리기로 만든 사선도 마찬가지이며, 재조정은 패널 수치 또는 재그리기. 끝점 핸들은 의도적 비범위.
- `markerUnits="strokeWidth"` 전환으로 굵기 1 선의 화살표 머리는 작아진다(비례 축소) — 의도된 동작.
- 점선+화살표 머리 조합에서 머리 쪽 대시 위상은 제어하지 않는다(브라우저 기본) — 수용.

## 8. 테스트 전략

- **모델**: 파서 승격/무시(무효 값)/기본값 생략 직렬화/왕복 정준화, shapeSvg 파라미터별 출력(대시 배열 비례식, marker 치수 회귀 — 굵기 2 = 기존 외형), 기존 문서 바이트 무변경 회귀.
- **UI**: 패널 섹션 표시 조건(allLinear)·각 컨트롤의 dispatch·undo 1스텝, 그리기 모드 진입/생성(각도·중심 환산, 줌 보정)/Shift 스냅/Esc·클릭 폴백.
- **검증기**: 유효/무효 속성 케이스.
- **fable 최종 리뷰**: 실브라우저(Playwright)에서 굵기·파선·양쪽 머리 실측(픽셀·marker 렌더), `orient="auto-start-reverse"` 실지원 확인, 드래그 그리기 실조작.
