# WebDeck 문서 생성 가이드 (AI Agent용)

이 가이드는 AI Agent가 **WebDeck 표준 포맷 v1** HTML 슬라이드 문서를 생성하기 위한 규칙과 레시피다.
완성 예제는 `templates/` 디렉토리에 있다 — 새 문서는 `templates/minimal.html`을 복사해 시작하는 것을 권장한다.

## 필수 규칙 (검증 항목)

1. `<html>`에 `data-webdeck-version="1"` 속성 필수 (오류)
2. `<head>`에 `<meta charset="utf-8">`와 비어 있지 않은 `<title>` 필수 (경고)
3. 본문은 정확히 1개의 `<main class="deck" data-slide-width="1280" data-slide-height="720">` (오류)
4. deck의 자식은 `<section class="slide">`만 허용 (1개 이상) (오류)
5. 슬라이드의 자식은 전부 `.el` 요소 — `el-text` / `el-image` / `el-shape` 중 하나의 타입 클래스 필수 (오류)
6. 모든 `.el`은 인라인 style에 `left / top / width / height`를 **px 단위**로 명시 (오류)
7. 요소는 캔버스(1280×720) 안에 완전히 들어와야 함 (벗어나면 경고) (경고)
8. 이미지는 **data URI**만 사용 (외부 URL 금지 — 단일 파일 유통 원칙) (경고)
9. `el-image`에는 `<img>`가 **정확히 1개** 있어야 함 (오류)
10. `<img>`에는 `alt` 속성 필수 (경고)
11. 외부 `<script src>` / `<link rel="stylesheet">` 금지 (자기완결형 원칙) (오류)
12. `el-shape`의 `data-shape`는 `rect`/`ellipse`/`rounded`/`line`/`arrow` 5종 (v1.1) — line/arrow의 자식은 `<svg>` 1개만 허용 (오류). line/arrow는 선택 속성으로 선 서식 지원: `data-stroke-width`(양의 정수 px, 기본 2), `data-stroke-dash`(`dashed`/`dotted`, 생략 = 실선), `data-head-start`/`data-head-end`(`0`/`1` — 기본: line은 머리 없음, arrow는 끝 머리). 내부 SVG는 에디터가 정준형으로 재생성하므로 이 속성들이 서식의 단일 원본이다
13. `.el` 안에 다른 `.el`을 중첩하지 않는다 — 겹침은 절대 좌표 + DOM 순서(z-order)로 표현 (오류)
14. `data-transition`(슬라이드 전환)은 `fade`/`push`만 지원 — 선택 속성 (오류)
15. `el-table`에는 `<table>` 정확히 1개, 셀은 td/th만, 스팬은 양의 정수, 행별 그리드 정합 (오류)

## 문서 골격

`templates/minimal.html`의 `<style>`(뷰어 CSS)과 `<script>`(뷰어 스크립트) 블록을 그대로 복사하고,
`<main class="deck">` 안에 슬라이드를 채운다. 슬라이드 배경은 `data-bg="#ffffff"` 속성으로 지정한다.

배경은 단색 외에 규약 형태의 그라데이션·이미지도 지원한다 — `data-bg="linear-gradient(180deg, #1a56db, #e8f0fe)"`(각도는 0/90/180/270deg, 색은 #rrggbb 2개) 또는 `data-bg="url(data:image/png;base64,...) center / cover no-repeat"`. 이 정확한 형태여야 에디터 배경 UI에서 편집 가능하다(다른 형태는 보존만 됨).

슬라이드에는 선택 속성 2개를 쓸 수 있다: `data-transition="fade|push"`(발표 전환 효과),
`data-notes="평문"`(발표 노트). 문서를 브라우저로 열면 우상단 "발표" 버튼(또는 `P` 키)으로
전체화면 발표 모드가 시작된다(`→`/`←` 이동, `Esc` 종료). 뷰어 스크립트 블록은
`data-webdeck-runtime` 마커가 붙은 최신본을 템플릿에서 그대로 복사한다 —
에디터가 문서를 열어 저장하면 이 블록은 항상 최신 런타임으로 자동 갱신된다.

## 좌표 체계

- 캔버스: 1280×720px, 원점은 좌상단
- 기본 여백: 좌우 96px (본문 폭 = 1088px)
- 관례: 슬라이드 제목 `top:64px height:80px`, 제목 밑줄(포인트 바) `left:96px top:150px width:64px height:6px`, 본문 시작 `top:200px`
- z-order = DOM 순서 (나중에 쓴 요소가 위에 그려짐) — 도형 위에 텍스트를 올리려면 도형을 먼저 쓴다

## 테마 변수

| 변수 | 용도 | 기본값 |
|------|------|--------|
| `--wd-primary` | 강조색 (제목 바, 포인트) | `#1a56db` |
| `--wd-accent` | 옅은 배경 (카드, 밴드) | `#e8f0fe` |
| `--wd-text` | 본문 글자색 | `#1f2937` |
| `--wd-muted` | 보조 글자색 | `#6b7280` |
| `--wd-font-heading` | 제목 글꼴 | Pretendard 계열 |
| `--wd-font-body` | 본문 글꼴 | Pretendard 계열 |

색은 가급적 변수로 지정한다 (`color:var(--wd-muted)`, `background:var(--wd-accent)`).

## 요소 레시피

**텍스트 상자** — 내용은 `<p>` 단위. 서식은 `<strong>`(굵게), `<em>`(기울임), `<u>`(밑줄), `<span style>`(크기·색):

```html
<div class="el el-text" style="left:96px; top:200px; width:520px; height:440px;">
  <p style="font-size:22px; margin-bottom:16px;">• 첫 번째 항목</p>
  <p style="font-size:22px;"><strong>강조</strong>와 <span style="color:var(--wd-muted);">보조색</span></p>
</div>
```

**이미지** — `el-image`당 `<img>` 정확히 1개, data URI, alt 필수, img에 `width:100%; height:100%`:

```html
<div class="el el-image" style="left:664px; top:200px; width:520px; height:440px;">
  <img src="data:image/png;base64,..." alt="설명" style="width:100%; height:100%;">
</div>
```

**도형(사각형)** — 배경색·밴드·카드·포인트 바에 사용:

```html
<div class="el el-shape" data-shape="rect" style="left:96px; top:220px; width:344px; height:300px; background:var(--wd-accent);"></div>
```

**도형 변형·회전 (v1.1)** — 타원·둥근 사각형은 인라인 `border-radius`를 함께 지정하고, 회전은 `transform: rotate(<n>deg)`(정확히 이 형태)로 지정한다. 선·화살표의 내부 SVG는 에디터가 정준형으로 재생성하므로 비워 두거나 임의로 넣어도 된다:

```html
<div class="el el-shape" data-shape="ellipse" style="left:96px; top:200px; width:240px; height:160px; background:var(--wd-accent); border-radius:50%;"></div>
<div class="el el-shape" data-shape="rounded" style="left:96px; top:200px; width:240px; height:160px; background:var(--wd-accent); border-radius:24px;"></div>
<div class="el el-shape" data-shape="arrow" style="left:96px; top:400px; width:320px; height:8px; color:#374151; transform:rotate(45deg);"></div>
<div class="el el-shape" data-shape="arrow" data-stroke-width="4" data-stroke-dash="dashed" style="left:96px; top:440px; width:320px; height:8px; color:#dc2626;"></div>
<div class="el el-shape" data-shape="line" data-head-start="1" data-head-end="1" style="left:96px; top:480px; width:320px; height:8px; color:#374151;"></div>
```

**표 (v1.1)** — `el-table` 안에 `<table>` 1개. 셀은 td/th만, 병합은 colspan/rowspan. **정형(행별 스팬 합 = 열 수)이 아니면 편집 불가(opaque)로 보존만 된다.** `el-table` 바로 안에 `<table>` 외의 텍스트가 섞여도 마찬가지로 편집 불가(opaque)로 보존만 된다(도형 안에 텍스트를 중첩하지 않는 것과 같은 원칙). 열 너비는 colgroup의 %:

```html
<div class="el el-table" style="left:96px; top:200px; width:720px; height:160px;">
  <table>
    <colgroup><col style="width:40%"><col style="width:30%"><col style="width:30%"></colgroup>
    <tbody>
      <tr><th colspan="3" style="border:1px solid #d1d5db; padding:6px 10px; background:var(--wd-accent);"><p>분기 실적</p></th></tr>
      <tr><td style="border:1px solid #d1d5db; padding:6px 10px;"><p>항목</p></td><td style="border:1px solid #d1d5db; padding:6px 10px;"><p>1Q</p></td><td style="border:1px solid #d1d5db; padding:6px 10px;"><p>2Q</p></td></tr>
    </tbody>
  </table>
</div>
```

## 레이아웃 레시피 (검증된 좌표)

- **표지**: 제목 `96,240,1088,140`(54px bold) + 부제 `96,400,1088,60`(24px muted) + 하단 밴드 `0,600,1280,120`(accent)
- **풀블리드 표지**: 배경 rect `0,0,1280,720`(primary) + 흰색 제목 텍스트
- **목차**: 제목 + 밑줄 + 목록 텍스트 `96,200,1088,400`(26px, 줄 간격 margin-bottom:20px)
- **본문 2단**: 좌 `96,200,520,440` + 우 `664,200,520,440`
- **카드 3열**: rect `96/468/840, 220, 344, 300` + 텍스트 오버레이 `120/492/864, 252, 296, 236`
- **로드맵 3단계**: rect `96/468/840, 260, 344, 140` + 단계명 오버레이 + 설명 `430`부터

각 레시피의 실물은 `templates/business-report.html`, `templates/project-proposal.html` 참고.

## 생성 워크플로우

1. 문서 생성 (minimal.html 복사 → 내용 교체)
2. 검증: `node tools/validate-webdeck.mjs <문서.html>`
3. 오류·경고를 모두 해결할 때까지 2를 반복 (종료 코드 0 = 통과)

## 자주 하는 실수

- 요소 좌표 합이 캔버스를 벗어남 (`left + width > 1280`)
- `px` 생략 (`left:96` ❌ → `left:96px` ✅)
- 슬라이드 직속에 `.el`이 아닌 태그 배치 (`<h1>` ❌ — 텍스트는 항상 `el-text` 안에)
- 외부 이미지 URL 사용 (data URI로 변환할 것)
- 텍스트를 도형 안에 중첩 (`el-shape` 안에 `<p>` ❌ — 별도 `el-text`를 위에 겹칠 것)
- `iframe`/`video` 등 외부 콘텐츠 요소 사용 (v1에서 금지)

## 에디터 왕복 보존 범위 (참고)

WebDeck 에디터는 "이해하지 못하는 내용은 원문 보존" 원칙으로 동작하지만, 다음은 보존 비목표다:

- `<body>` 직속에서 `<main>` **앞**에 있던 요소는 저장 시 `<main>` **뒤**로 정규화된다 (내용 자체는 보존)
- `<body>` 직속의 텍스트 노드와 HTML 주석은 보존되지 않는다
- 요소 안 텍스트 HTML은 브라우저 DOM 직렬화 형태로 정규화될 수 있다 (의미 동일)

AI가 생성하는 문서가 이 가이드의 구조를 따르면 위 항목의 영향을 받지 않는다.
