# WebDeck Plan 9b 설계 — 표 편집기 (el-table)

2026-07-05 브레인스토밍 승인본(범위: 병합 포함 전부). 마스터 설계(`2026-07-02-webdeck-design.md`)를 보완하는 확장 스펙이며, 완료 시 마스터 스펙 §12에 이력을 추가한다. 포맷 v1.1 요소 확장 — 버전 속성은 `"1"` 유지.

## 1. 범위

포함: ① `el-table` 타입 신설 — **colspan/rowspan 병합을 1급으로 포함한 그리드 모델** ② 표 삽입(8×8 그리드 피커) ③ 셀 텍스트 편집(더블클릭·Tab 이동) ④ 행/열 추가·삭제(스팬 인식) ⑤ 셀 병합/분할 ⑥ 셀 서식(배경색·가로 정렬)·헤더(th) 토글 ⑦ 열 너비 드래그 ⑧ opaque 표 → el-table 변환 ⑨ 검증기·ai-guide·왕복 계약.

비범위: 행 높이 수동 조절(내용 자동), 셀별 테두리 UI(원문 보존만), 표 스타일 프리셋, 중첩 표(opaque 강등), 셀 세로 정렬 UI, 다중 표 범위 연산.

## 2. 포맷 (v1.1)

```html
<div class="el el-table" style="left:..px; top:..px; width:..px; height:..px;">
  <table style="border-collapse:collapse; width:100%;">
    <colgroup><col style="width:30%"><col style="width:70%"></colgroup>
    <tbody>
      <tr><th colspan="2" style="border:1px solid #d1d5db; padding:6px 10px; background:var(--wd-accent);"><p>헤더</p></th></tr>
      <tr><td style="...">…</td><td style="...">…</td></tr>
    </tbody>
  </table>
</div>
```

### 2.1 모델

- `TableElement extends ElementBase { type:'table', colWidths: number[], rows: TableCell[][] }` — KnownElement 유니언에 추가
- `TableCell { html: string, colspan: number, rowspan: number, header: boolean, bg: string | null, align: 'left'|'center'|'right'|null, extraStyle: Record<string,string>, extraAttrs: Record<string,string> }`
- `rows`에는 **앵커 셀만** 존재(HTML 마크업과 1:1). 스팬으로 완전히 덮인 행은 빈 배열 허용(`<tr></tr>`). 편집 연산용 점유 그리드는 헬퍼(`buildGrid`)가 계산
- `colWidths`는 % (합 ~100, 길이 = 그리드 열 수)
- 셀 1급 스타일은 `background`(→bg)·`text-align`(→align)만 승격, 그 외 셀 style·속성은 extraStyle/extraAttrs 원문 보존. 셀 html은 el-text와 같은 계약(인라인 서식 보존, trim)

### 2.2 정준·보존 경계

- **table 태그 자체와 colgroup은 정준형**(직렬화가 항상 재생성 — table style은 `border-collapse:collapse; width:100%;` 고정, colgroup은 colWidths에서 생성). 파서는 table 태그의 속성·colgroup 외 내용을 무시
- **td/th는 보존형**: colspan/rowspan/bg/align/기타 스타일·속성·내용 왕복 보존
- 표 기본 외형(테두리·패딩·헤더 배경)은 **삽입 시 셀 extraStyle에 인라인로 내장**(`border:1px solid #d1d5db; padding:6px 10px;`, th는 `background:var(--wd-accent)` 추가) — 런타임·CSS 무의존 자기완결, 이후엔 일반 보존 흐름

### 2.3 승격 조건 (관대함의 경계)

`.el.el-table` + frame + 자식이 `table` 정확히 1개, 내부가 정형(선택적 colgroup·선택적 tbody/thead 아래 tr, 셀은 td/th만, colspan/rowspan 양의 정수, 점유 그리드 정합 — 행별 스팬 합이 열 수와 일치)일 때만 TableElement. 그 외(중첩 표 포함)는 **opaque 보존**. `el-table` 클래스 없는 일반 `<table>`은 기존대로 opaque

- colgroup이 없으면 colWidths는 균등 분배로 유도
- frame.height는 **최소 높이** — 내용이 크면 표가 자연 확장(overflow 클립 없음, 뷰어·에디터 동일)

## 3. 표 연산 (`model/tableOps.ts` 순수 함수 — 이 플랜의 핵심)

- `buildGrid(el): ({ r, c } | null)[][]` — 그리드 각 칸의 앵커 좌표(빈 칸 없음이 정합 조건)
- `createTable(idGen, rowCount, colCount, frame): TableElement` — 첫 행 header, 기본 외형 내장, 열 균등
- `setCellHtml(doc, slideId, elId, r, c, html)`
- `insertRow(doc, …, index)` / `insertCol(doc, …, index)`: 삽입선을 가로지르는 스팬(`앵커 < index < 앵커+스팬`)은 스팬 +1, 그 구간을 제외한 위치에 빈 셀 생성. insertCol은 colWidths에 `100/(n+1)` 삽입 후 전체 정규화
- `removeRow(doc, …, index)` / `removeCol(doc, …, index)`: 가로지르는 스팬은 -1. **앵커가 삭제선에 있고 스팬 > 1이면 앵커를 다음 행/열로 이동(내용 유지, 스팬 -1)**. 마지막 행/열은 no-op(같은 doc). colWidths 제거 후 정규화
- `canMergeCells(el, r1,c1,r2,c2): boolean` — 정규화된 사각 범위 안에 점유 셀들의 앵커+스팬이 **완전히 포함**될 때만 true (부분 겹침 거부), 범위가 단일 셀이면 false
- `mergeCells(doc, …, r1,c1,r2,c2)`: canMerge 전제(아니면 같은 doc). 앵커 (r1,c1)에 스팬 설정, **내용은 범위 내 앵커들의 html을 행 우선 순서로 연결(무손실)**, 나머지 앵커 제거. 서식은 (r1,c1) 것 유지
- `splitCell(doc, …, r, c)`: 스팬 1로 되돌리고 덮였던 칸에 빈 셀 생성(내용은 앵커에 잔류)
- `setCellsStyle(doc, …, r1,c1,r2,c2, patch: { bg?: string|null, align?: … })` — 범위 내 앵커 전부
- `toggleHeaderCells(doc, …, r1,c1,r2,c2)` — 범위 내 앵커가 전부 th면 td로, 아니면 th로
- `setColWidths(doc, …, widths: number[])`
- `tableFromOpaqueHtml(idGen, html): TableElement | null` — opaque 원문에서 단일 table(±1겹 래퍼 div) 추출·정형 파싱, 래퍼에 frame이 있으면 사용, 없으면 96,200,1088,320. 실패 시 null
- 불변식: 모든 연산 후 그리드 정합 유지, 내용 무손실(행/열 삭제 시 삭제선 위 앵커 스팬>1 내용 이전 포함)

## 4. 편집 UI

- **삽입**: 툴바 "표" 버튼 → 8×8 그리드 피커 팝오버(hover로 N×M 하이라이트+라벨, 클릭 삽입). 삽입 frame: (280, 200), 너비 720, 높이 40×행수. 1 삽입 = 1 APPLY_DOC + 선택
- **셀 상호작용**(캔버스): 표 요소 선택 후 셀 클릭 = 셀 선택, 드래그/Shift+클릭 = 사각 범위, 더블클릭 = 셀 텍스트 편집(TextEditable 재사용 — data-text-tool 포커스 인프라 그대로), Tab/Shift+Tab = 다음/이전 셀 편집(마지막 셀에서 Tab = 행 추가 후 이동), Esc = 편집 종료
- **셀 선택 상태는 App 로컬 useState**(`{ elementId, anchor:[r,c], extent:[r,c] } | null`) — CanvasArea(읽기/쓰기)·PropertiesPanel(읽기) 공유, 요소 선택·슬라이드 변경 시 초기화, undo·리듀서 무관. 셀 편집 중 요소 단축키 억제는 기존 `editingTextId`(START/END_TEXT_EDIT) 재사용
- **속성 패널 "표" 섹션**(표 단일 선택 시): 행 추가/삭제·열 추가/삭제(셀 선택 위치 기준, 없으면 끝), 병합(canMerge일 때만 활성)/분할(스팬>1 셀 선택 시 활성), 셀 배경(ColorPopover)·가로 정렬 3종·헤더 토글(범위 대상), 1 클릭 = 1 APPLY_DOC
- **열 너비 드래그**: 셀 선택 모드에서 열 경계 핸들 드래그 — 이웃 두 열 % 재배분(각 최소 5%), pointerup 1 APPLY_DOC
- **opaque 변환**: 속성 패널 슬라이드 모드(선택 없음)에 현재 슬라이드의 변환 가능 opaque 표가 있으면 "편집 불가 표 N개를 표 요소로 변환" 버튼 — 클릭 시 전부 변환(1 APPLY_DOC, undo 1스텝 복귀). 변환 불가면 버튼 미표시

## 5. 검증기·문서

- 검증기: el-table 규칙 — table 1개, td/th만, 스팬 양의 정수, 행별 그리드 정합(스팬 고려), 오류 한국어. 정형 위반은 오류
- ai-guide: el-table 레시피(병합 예 포함) + "정형이 아니면 편집 불가(opaque)" 명시
- 런타임·템플릿 무변경. 마스터 스펙 §12 이력 추가

## 6. 오류 처리·알려진 한계

- 마지막 행/열 삭제 no-op(요소 삭제로 대신), 부분 겹침 병합은 버튼 비활성
- 회전된 표: 렌더·편집 동작하나 셀 편집 UI 시각적 어색 — 수용
- 셀별 테두리·비1급 스타일은 보존만(UI 없음)
- 변환은 정형 표만 — 실패 시 해당 요소 건너뜀(버튼 카운트에서 제외)
- 표 내용이 frame보다 크면 자연 확장 — 슬라이드 경계 초과는 기존 검증기 경고 관례

## 7. 테스트 전략

- **tableOps(최중요)**: 스팬 교차 전 케이스 — 삽입선이 스팬 내부/경계, 앵커 삭제 시 내용 이전, 부분 겹침 병합 거부, 병합 내용 무손실 연결, 분할 복원, 그리드 정합 불변식(모든 연산 후 buildGrid에 빈 칸 없음), colWidths 정규화
- 파서/직렬화: 병합 표 왕복, 셀 서식·비1급 스타일 보존, colgroup 없음 균등 유도, 비정형 opaque 강등 회귀, 2회 직렬화 안정, checkRoundTrip
- 검증기(tools): 정형 통과·비정형 오류 케이스
- RTL: 그리드 피커 삽입, 셀 선택/범위/더블클릭 편집/Tab 이동, 패널 병합·분할 활성 조건, 셀 서식 1 APPLY_DOC, 변환 버튼
- 최종 리뷰: 실브라우저 — 병합 표 렌더(저장 문서·발표 모드), 열 너비 드래그, 변환 왕복
