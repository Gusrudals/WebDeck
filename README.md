# WebDeck

AI가 생성하고 사람이 편집하는 HTML 슬라이드 문서 도구.

마크다운은 레이아웃 표현이 부족하고, AI가 만든 PPT는 편집이 안 된다.
WebDeck은 **HTML을 PPT처럼 쓰는** 접근이다 — AI Agent가 표준 포맷의 HTML 슬라이드를
생성하면, 브라우저만으로 보고 인쇄(PDF)할 수 있고, WYSIWYG 에디터로
비개발자도 PowerPoint처럼 편집할 수 있다.

## 현재 제공

- **표준 포맷 v1** — 1280×720 슬라이드, 절대 위치 요소, 자기완결형 단일 .html
- **템플릿** — `templates/` (minimal / 업무 보고서 / 기획 제안서). 브라우저로 바로 열어 확인
- **검증 CLI** — `node tools/validate-webdeck.mjs <문서.html>` (통과: 종료 코드 0)
- **AI 생성 가이드** — `docs/ai-guide.md`를 AI Agent에게 주입하면 포맷에 맞는 문서를 생성
- **에디터 코어 (Plan 2)** — `editor/src/model/`: 문서 모델, HTML↔모델 파서/직렬화(왕복 보존), 편집 커맨드, undo/redo. UI 없이 완전히 테스트됨 (`npm run test:editor`)
- **WYSIWYG 에디터** — `cd editor && npm run dev`로 실행. 열기/저장(File System Access), 드래그·리사이즈·스냅, 텍스트 편집·서식(폰트/크기/색/목록/줄 간격), 속성 패널(위치·크기·채우기·테두리·그림자·투명도), 슬라이드 관리, undo/redo, PPT식 단축키
- **문서 모드** — WebDeck 포맷이 아닌 일반 HTML도 에디터에서 열어 Word처럼 편집하고 일반 HTML 그대로 저장 (스크립트는 편집 중 실행 차단, 저장 시 보존)

## 사용법

```bash
npm install          # 최초 1회
npm run test:all     # 전체 테스트 (tools + editor)
npm run validate -- templates/minimal.html   # 문서 검증
open templates/business-report.html          # 브라우저로 보기 (인쇄 → PDF 저장 가능)
```

## 로드맵

- ~~Plan 1: 포맷 & 도구~~ · ~~Plan 2: 에디터 코어~~ · ~~Plan 3a: 뷰어~~ · ~~Plan 3b: 편집+저장 (MVP)~~ · ~~Plan 4: 새 문서·템플릿~~ · ~~Plan 5: 서식·속성 심화~~ · ~~문서 모드(일반 HTML)~~ (완료)
- 이후 계획: `docs/roadmap.md` (발표 모드, 테마, AI 연동, 표·도형 확장, 배포)

설계 문서: `docs/superpowers/specs/2026-07-02-webdeck-design.md`
