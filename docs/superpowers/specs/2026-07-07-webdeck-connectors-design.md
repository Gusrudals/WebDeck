# WebDeck Plan 9d 설계 — 꺾인 연결선·곡선 (경유점 도형)

2026-07-07 브레인스토밍 승인본. 마스터 설계(`2026-07-02-webdeck-design.md`)를 보완하는 확장 스펙이며, 완료 시 마스터 스펙 §12에 이력을 추가한다. Plan 9c(`2026-07-07-webdeck-line-styling-design.md`)에서 "경유점 모델이 필요한 별개 규모"로 분리된 후속이다. 버전 속성은 `"1"` 유지.

사용자 결정 3건: ① **독립 도형** — 도형에 붙어 따라다니는 연결(커넥터 추종)은 비범위, 요구 확인 시 Plan 9e. ② **전용 핸들은 line/arrow 끝점까지 포함**(9c 백로그 해소). ③ **elbow는 직교 유지 편집**(자유 폴리라인 아님).

## 1. 범위

포함:

1. **도형 2종 추가** — `data-shape` 값 `elbow`(직교 폴리라인)·`curve`(3차 베지어 1개), 경유점은 `data-points` 속성
2. **정준 SVG** — polyline/path를 직렬화·렌더 시점에 %→px 환산 재생성, Plan 9c 선 서식(굵기·대시·머리) 전면 재사용
3. **드래그 그리기 확장** — drawMode에 elbow/curve 추가, 두 점 → 초기 라우팅 자동
4. **전용 핸들 편집** — elbow(끝점+중간 세그먼트), curve(끝점+제어점), line/arrow(끝점 — 9c 백로그)
5. v1.x 확장 세트: 스펙 → 검증기 → 파서/직렬화(왕복) → 정준 SVG → 에디터 UI

비범위: 도형 연결 추종(Plan 9e 후보), 자유 폴리라인·꺾임점 추가/삭제(라우팅 패턴+세그먼트 드래그로 충분), 다중 세그먼트 곡선(S자 이상), 회전된 elbow/curve의 핸들 편집(패널 수치로 — Plan 9 회전 제한 선례), elbow 자동 장애물 회피 라우팅.

## 2. 모델·마크업

`ShapeKind`에 `'elbow' | 'curve'` 추가(총 7종). `ShapeElement`에 필수 필드 `points: [number, number][]` 추가 — **frame 기준 % 좌표**(소수 허용), elbow/curve에서만 의미(그 외 kind는 빈 배열 고정·직렬화 미출력).

마크업: `.el-shape[data-shape="elbow"|"curve"]`에 **`data-points="x,y x,y …"`**(공백 구분 쌍, 각 좌표 유한수).

- **승격 조건**: elbow = 파싱 성공 + 점 ≥ 2, curve = 정확히 4점(시작·제어1·제어2·끝). **위반(속성 부재·형식 오류·개수 미달) 시 opaque 강등** — line/arrow의 "무효→기본값" 관용과 다른 이유: points는 형상 그 자체라 합리적 기본값이 없고, 모르는 것은 보존이 WebDeck 철학이다.
- % 좌표가 0~100 밖이어도 파서는 수용한다(렌더 가능). **불변량 "frame = 점들의 bounding box"는 에디터 편집 연산이 재정규화로 유지**하는 에디터 측 규율이며 파서 강제 사항이 아니다. 베지어 곡선은 제어점 볼록 껍질 안에 있으므로 점 bbox면 곡선 전체를 덮는다.
- elbow의 **직교성(연속 두 점이 x 또는 y 공유)도 파서는 강제하지 않는다**(비직교여도 polyline 렌더는 정상) — 편집 연산이 유지하고 검증기가 경고한다.
- **선 서식 재사용**: strokeWidth/strokeDash/headStart/headEnd 4필드와 `data-stroke-width` 등 4속성을 elbow/curve에 그대로 적용. `lineDefaults`를 4종으로 확장 — elbow/curve 기본은 line과 동일(굵기 2·실선·머리 없음).
- 판별자: 기존 `isLinear`(line/arrow — 회전 기반 정준 `<line>`)는 유지하고, **`isStroke(kind)`**(line/arrow/elbow/curve — 선 서식·color 스트로크 계열)를 신설한다. 패널의 allLinear 분기(채우기→color 매핑·테두리/그림자 숨김·선 섹션)는 isStroke 기준으로 확장.
- 직렬화: `data-points`는 소수 최대 2자리로 결정적 출력(문자 정규화 허용 — 왕복 계약은 모델 동등성). 내부 SVG는 항상 정준 재생성, 파서는 내부 무시(line/arrow와 동일).

## 3. 정준 SVG (%→px 환산)

SVG polyline/path 좌표는 %를 지원하지 않으므로(line의 `y1="50%"` 방식 불가), **직렬화·에디터 렌더 시점에 frame 크기를 곱한 px 좌표로 재생성**한다. `shapeSvg.ts`에 신규 `pathInnerHtml(kind: 'elbow' | 'curve', uid, style: LineStyle, points, frameW, frameH): string`:

- elbow: `<svg width="100%" height="100%" style="overflow: visible; display: block;"><polyline points="x,y x,y …" fill="none" stroke="currentColor" stroke-width="…"/></svg>`
- curve: 같은 래퍼에 `<path d="M x0,y0 C x1,y1 x2,y2 x3,y3" fill="none" …/>`
- px = %/100 × frame 변, 소수 2자리 반올림(결정적). **`fill="none"` 필수**(path/polyline 기본 fill 검정).
- 대시·marker는 9c 정준식·marker 규격 공유(내부 헬퍼 추출로 중복 제거). `orient="auto"`/`auto-start-reverse`가 polyline/path의 끝 세그먼트 접선 방향을 자동 추적하므로 머리 방향 처리 추가 코드 없음.
- viewBox+`preserveAspectRatio="none"` 방식은 기각(Plan 9 선례: stroke·marker 비등방 왜곡). frame이 바뀌면 저장 시 px가 재계산되므로 정합은 정준 재생성이 보장한다.

## 4. 드래그 그리기 확장

- `drawMode: 'line' | 'arrow' | 'elbow' | 'curve' | null`. 도형 메뉴에 `꺾인 연결선`·`곡선` 항목 추가(문구 verbatim).
- 두 점 p1→p2 드래그, frame = 두 점 bbox(변이 8px 미만이면 그 축 최소 8px, 점 % 재계산):
  - **elbow**: |dx| ≥ |dy|면 H-V-H(Z자): `[(sx,sy), (50,sy), (50,ey), (ex,ey)]`, 아니면 V-H-V: `[(sx,sy), (sx,50), (ex,50), (ex,ey)]` — sx/sy/ex/ey는 p1·p2가 bbox 모서리에서 갖는 %(0 또는 100). 최소 8px로 보정된 퇴화 축(두 점이 같은 좌표)은 두 점 모두 50%.
  - **curve**: 완만한 아치 — 제어점 2개를 시작→끝 방향 1/3·2/3 지점에서 수직 방향(px 공간 기준)으로 직선 길이의 25%만큼 같은 쪽 오프셋. 생성 직후 4점 bbox로 frame 재정규화(아치 제어점이 두 점 bbox 밖으로 나가므로).
- 클릭 폴백(드래그 거리 8px 미만): 기본 도형 삽입 — 신규 상수 `PATH_INSERT_FRAME = { left: 480, top: 280, width: 320, height: 160 }`, 기본 points: elbow `[(0,0),(50,0),(50,100),(100,100)]`, curve `[(0,100),(33.33,0),(66.67,0),(100,100)]`.
- Shift 15° 스냅은 line/arrow 전용 유지 — elbow/curve 그리기에서는 무시(YAGNI).
- Esc·캔버스 밖 취소, 생성 직후 선택, 1 APPLY_DOC — 9c 규칙 그대로.

## 5. 전용 핸들 편집

단일 선택 시 SelectionOverlay에 점 핸들 레이어를 추가한다. elbow/curve는 기존 8핸들·회전 핸들과 공존(8핸들 리사이즈는 % 좌표라 자동 스케일이므로 유지). **line/arrow는 8핸들·회전 핸들을 끝점 핸들 2개로 대체한다** — 높이 8px 요소에 핸들 11개는 혼잡하고, 끝점 드래그가 길이·각도 조정의 상위 호환이다(PPT도 선 선택 시 끝점만). 위치·크기·회전 수치는 패널에 그대로 남는다:

- **line/arrow(회전 무관)**: 끝점 핸들 2개 — 위치 = frame 중심 ± (width/2)·(cos θ, sin θ). 드래그 시 반대 끝점 고정, 새 두 점으로 중심·길이·각도 재계산(9c beginDraw 수학 재사용), Shift = 15° 스냅. 회전된 사선의 마우스 재조정이 목적이므로 rotation ≠ 0에서도 동작한다.
- **elbow(rotation 0 전제)**: 끝점 2개 + **중간 세그먼트 중점 핸들**(첫·끝 세그먼트 제외). 세그먼트 핸들은 수평 세그먼트 = 상하로만, 수직 세그먼트 = 좌우로만 드래그 — 세그먼트 양 끝점의 공유 좌표를 함께 갱신(직교 불변). 끝점 드래그 = 인접 꺾임점의 공유 축 좌표가 따라옴(첫 세그먼트가 H면 인접점 y 동기, V면 x 동기) — 세그먼트 수 불변의 국소 재라우팅.
- **curve(rotation 0 전제)**: 끝점 2개 + 제어점 2개(제어점은 대응 끝점과 점선 가이드로 연결 표시).
- 드래그 중 미리보기는 기존 Gesture 패턴(신규 'points' 제스처 — previewDoc 경유), 커밋은 1 APPLY_DOC.
- **커밋 시 재정규화**: 점들의 px 절대좌표 bbox → 새 frame + 새 %(불변량 복원). bbox 변이 1px 미만(완전 수평 elbow 등)이면 해당 축 frame을 8px로 하고 그 축 점들은 50%로 — 0 나눗셈 가드.
- 핸들 편집 중에는 요소 이동 제스처와 충돌하지 않도록 핸들이 stopPropagation(기존 리사이즈 핸들 관례). 그리기 모드 중에는 9c 게이트 그대로 핸들 전체 비표시.

## 6. 검증기·문서

- `tools/lib/validate.mjs`: `data-shape` 허용 값 7종으로 확장. elbow/curve에 `data-points` **필수**(부재·형식 오류·개수 위반 = 오류 — 에디터의 opaque 관용과 달리 AI 생성 검증은 엄격). elbow 연속 점 비직교 = **경고**(렌더는 되므로). 선 서식 4속성 검증을 elbow/curve에도 적용.
- `docs/ai-guide.md`: 규칙·예시 갱신(elbow Z자, curve 아치 예시 포함).
- 마스터 스펙 §12 이력 1줄, 로드맵 갱신.

## 7. 오류 처리·알려진 한계

- points 무효 문서: 에디터는 opaque 강등(요소 보존·이동/크기만 가능), 검증기는 오류 — §2 승격 조건과 §6이 대칭.
- 곡선의 클릭 히트 영역은 frame 박스 전체(곡선 획 주변만이 아님) — 기존 도형들과 동일한 수용.
- elbow 끝점 드래그의 재라우팅은 인접 축 동기만(전역 재라우팅·세그먼트 수 변화 없음) — 극단적으로 접힌 형상은 세그먼트 핸들로 사용자가 정리.
- 8핸들 리사이즈로 한 축을 극단 축소하면 형상이 납작해진다(% 스케일의 자연 결과) — 수용.
- 비직교 elbow(AI 생성)는 렌더·이동·리사이즈는 정상이나 세그먼트 핸들이 직교 세그먼트에만 제공된다.

## 8. 테스트 전략

- **모델**: data-points 파싱(정상/부재/형식 오류/개수 위반 → opaque)·직렬화 결정성(소수 2자리)·왕복(checkRoundTrip), pathInnerHtml %→px 환산·fill="none"·대시/marker 재사용, lineDefaults 4종·isStroke, 재정규화(bbox·0 나눗셈 가드).
- **그리기**: 방향 4조합(H-V-H/V-H-V × 좌우상하) 라우팅·frame bbox, curve 생성 직후 재정규화, 클릭 폴백 기본형, 기존 line/arrow 그리기 회귀.
- **핸들**: elbow 세그먼트 드래그 직교 유지·끝점 인접 축 동기, curve 제어점 드래그, line 끝점 재계산(중심·길이·각도) + Shift 스냅, 커밋 후 frame 재정규화, 그리기 모드 중 핸들 비표시 회귀.
- **패널**: isStroke 확장(elbow/curve 선택 시 선 섹션·color 매핑, 테두리/그림자 숨김).
- **검증기**: 7종 kind·data-points 필수/형식/개수·비직교 경고.
- **fable 최종 리뷰**: 실브라우저에서 그리기 4방향·세그먼트/제어점/끝점 핸들 실조작, 머리 orient 접선 추적 실측, 저장 왕복·file:// 단독 렌더, 굵은 파선 elbow+양쪽 머리 픽셀 확인.
